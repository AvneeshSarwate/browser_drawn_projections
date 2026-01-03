# Power2D Per-Shape FX Pipeline in Bevy

This document describes the implementation plan for a Bevy-native rendering pipeline that supports:
1. Power2D shapes (StyledShape / BatchedStyledShape) with custom materials
2. Per-shape post-processing effect chains
3. Final scene composition

This mirrors the `polygonFx.ts` architecture but uses GPU-native rendering throughout (no canvas → texture upload).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Shape Layer Rendering](#shape-layer-rendering)
4. [PostFX System](#postfx-system)
5. [Per-Shape FX Chains](#per-shape-fx-chains)
6. [Final Composition](#final-composition)
7. [Code Generation](#code-generation)
8. [Implementation Phases](#implementation-phases)
9. [Shader Porting](#shader-porting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Per-Shape FX Pipeline (Single Shape)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Power2D Shape(s) for Region                                                │
│  - StyledShape with custom material                                         │
│  - Mesh generated from polygon points                                       │
│  - Optional stroke as separate entity                                       │
│       │                                                                      │
│       ▼ (Camera renders to texture, cropped to shape bbox)                  │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │           Shape Render Target (bbox-sized)                   │            │
│  │   Resolution: bboxWidth × bboxHeight pixels                  │            │
│  └─────────────────────────────────────────────────────────────┘            │
│       │                                                                      │
│       ▼                                                                      │
│  PostFX Chain: Wobble → HBlur → VBlur → Pixelate → AlphaThreshold          │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │              Final FX Output Texture                         │            │
│  └─────────────────────────────────────────────────────────────┘            │
│       │                                                                      │
│       ▼                                                                      │
│  Quad in final scene (positioned at bbox location, textured with FX output) │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Final Scene Composition                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Shape A FX Output ──┐                                                      │
│  Shape B FX Output ──┼──→ Final Scene Camera → Screen                       │
│  Shape C FX Output ──┘    (composites all FX outputs)                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### Render Layers

Bevy's `RenderLayers` system controls which cameras see which entities:

| Layer | Purpose |
|-------|---------|
| 0 | Final composition (default) |
| 1-N | Per-shape rendering (each shape gets its own layer) |
| 100+ | PostFX passes (shared fullscreen quad system) |

### Camera Ordering

Cameras render in order specified by `Camera.order`:

| Order | Camera Type |
|-------|-------------|
| -100 to -1 | Shape layer cameras (render shapes to textures) |
| 0-99 | PostFX pass cameras (process shape textures) |
| 100 | Final composition camera |

### Resource Handles

```rust
/// Identifies a shape's FX chain
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct ShapeFxId(pub u32);

/// All resources for one shape's FX pipeline
pub struct ShapeFxBundle {
    pub id: ShapeFxId,
    pub bbox: Rect,
    pub shape_layer: u8,
    pub shape_camera: Entity,
    pub shape_target: Handle<Image>,
    pub fx_chain: FxChain,
    pub output_quad: Entity,
}
```

---

## Shape Layer Rendering

### Shape Camera Setup

Each shape (or group of shapes) renders to its own texture via a dedicated camera:

```rust
/// Marker for shape layer cameras
#[derive(Component)]
pub struct ShapeLayerCamera {
    pub shape_id: ShapeFxId,
}

/// Create a camera that renders shapes to a texture
fn create_shape_camera(
    commands: &mut Commands,
    images: &mut Assets<Image>,
    shape_id: ShapeFxId,
    bbox: Rect,
    layer: u8,
    order: isize,
) -> (Entity, Handle<Image>) {
    let width = bbox.width().ceil() as u32;
    let height = bbox.height().ceil() as u32;

    // Create render target
    let target = images.add(Image {
        texture_descriptor: TextureDescriptor {
            label: Some("shape_render_target"),
            size: Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: TextureDimension::D2,
            format: TextureFormat::Rgba16Float,
            usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        },
        ..default()
    });

    // Create orthographic camera sized to bbox
    let camera = commands.spawn((
        Camera2d,
        Camera {
            target: RenderTarget::Image(target.clone()),
            order,
            clear_color: ClearColorConfig::Custom(Color::NONE),
            ..default()
        },
        OrthographicProjection {
            // Camera views the bbox region
            left: bbox.min.x,
            right: bbox.max.x,
            bottom: bbox.min.y,
            top: bbox.max.y,
            ..OrthographicProjection::default_2d()
        },
        RenderLayers::layer(layer),
        ShapeLayerCamera { shape_id },
    )).id();

    (camera, target)
}
```

### Shape Entity Setup

```rust
/// Marker for shapes that belong to an FX chain
#[derive(Component)]
pub struct FxShape {
    pub chain_id: ShapeFxId,
}

/// Spawn a StyledShape for FX rendering
fn spawn_fx_shape(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<Power2dMaterial>,
    points: &[Vec2],
    material_def: &Power2dMaterialDef,
    chain_id: ShapeFxId,
    layer: u8,
) -> Entity {
    // Triangulate points
    let mesh = triangulate_polygon(points);

    // Create material
    let material = materials.add(material_def.create_material());

    commands.spawn((
        Mesh2d(meshes.add(mesh)),
        MeshMaterial2d(material),
        RenderLayers::layer(layer),
        FxShape { chain_id },
    )).id()
}
```

---

## PostFX System

### Effect Trait

```rust
/// A single post-processing effect
pub trait PostFxEffect: Send + Sync + 'static {
    /// The material type for this effect
    type Material: Material2d;

    /// Create material with input texture
    fn create_material(input: Handle<Image>) -> Self::Material;

    /// Update uniforms each frame
    fn update_uniforms(
        &self,
        material: &mut Self::Material,
        time: f32,
        params: &FxParams,
    );
}

/// Parameters for FX chain (mirrors FxChainMeta from TypeScript)
#[derive(Clone, Default)]
pub struct FxParams {
    pub wobble_x: f32,
    pub wobble_y: f32,
    pub blur_x: f32,
    pub blur_y: f32,
    pub pixelate: f32,
    pub alpha_threshold: f32,
}
```

### Concrete Effects

```rust
// Wobble effect
#[derive(Asset, AsBindGroup, TypePath, Clone)]
pub struct WobbleMaterial {
    #[uniform(0)]
    pub x_strength: f32,
    #[uniform(0)]
    pub y_strength: f32,
    #[uniform(0)]
    pub time: f32,
    #[texture(1)]
    #[sampler(2)]
    pub src: Handle<Image>,
}

impl Material2d for WobbleMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/postfx/wobble.wgsl".into()
    }
}

pub struct WobbleEffect;

impl PostFxEffect for WobbleEffect {
    type Material = WobbleMaterial;

    fn create_material(input: Handle<Image>) -> Self::Material {
        WobbleMaterial {
            x_strength: 0.0,
            y_strength: 0.0,
            time: 0.0,
            src: input,
        }
    }

    fn update_uniforms(
        &self,
        material: &mut Self::Material,
        time: f32,
        params: &FxParams,
    ) {
        material.x_strength = params.wobble_x;
        material.y_strength = params.wobble_y;
        material.time = time;
    }
}

// Similar implementations for:
// - HorizontalBlurEffect
// - VerticalBlurEffect
// - PixelateEffect
// - AlphaThresholdEffect
```

### FX Pass

```rust
/// A single pass in an FX chain
pub struct FxPass {
    pub input: Handle<Image>,
    pub output: Handle<Image>,
    pub material: UntypedHandle,  // Type-erased material handle
    pub camera: Entity,
    pub quad: Entity,
    pub update_fn: Box<dyn Fn(&mut World, f32, &FxParams) + Send + Sync>,
}

impl FxPass {
    pub fn new<E: PostFxEffect>(
        commands: &mut Commands,
        images: &mut Assets<Image>,
        materials: &mut Assets<E::Material>,
        meshes: &mut Assets<Mesh>,
        input: Handle<Image>,
        width: u32,
        height: u32,
        camera_order: isize,
        fx_layer: u8,
    ) -> Self {
        // Create output render target
        let output = images.add(create_render_target(width, height));

        // Create material
        let material = materials.add(E::create_material(input.clone()));
        let material_handle = material.clone().untyped();

        // Create fullscreen quad
        let quad_mesh = meshes.add(Rectangle::new(2.0, 2.0));
        let quad = commands.spawn((
            Mesh2d(quad_mesh),
            MeshMaterial2d(material.clone()),
            RenderLayers::layer(fx_layer),
        )).id();

        // Create camera for this pass
        let camera = commands.spawn((
            Camera2d,
            Camera {
                target: RenderTarget::Image(output.clone()),
                order: camera_order,
                clear_color: ClearColorConfig::Custom(Color::NONE),
                ..default()
            },
            OrthographicProjection {
                left: -1.0,
                right: 1.0,
                bottom: -1.0,
                top: 1.0,
                ..OrthographicProjection::default_2d()
            },
            RenderLayers::layer(fx_layer),
        )).id();

        // Type-erased update function
        let update_fn = Box::new(move |world: &mut World, time: f32, params: &FxParams| {
            let mut materials = world.resource_mut::<Assets<E::Material>>();
            if let Some(mat) = materials.get_mut(&material) {
                E::update_uniforms(&E, mat, time, params);
            }
        });

        Self {
            input,
            output,
            material: material_handle,
            camera,
            quad,
            update_fn,
        }
    }
}
```

---

## Per-Shape FX Chains

### FxChain

```rust
/// A complete FX chain for one shape
pub struct FxChain {
    pub passes: Vec<FxPass>,
    pub params: FxParams,
}

impl FxChain {
    /// Get the final output texture
    pub fn output(&self) -> &Handle<Image> {
        self.passes.last()
            .map(|p| &p.output)
            .expect("FxChain must have at least one pass")
    }

    /// Update all pass uniforms
    pub fn update(&self, world: &mut World, time: f32) {
        for pass in &self.passes {
            (pass.update_fn)(world, time, &self.params);
        }
    }
}

/// Builder for FX chains
pub struct FxChainBuilder {
    passes: Vec<FxPass>,
    current_output: Handle<Image>,
    width: u32,
    height: u32,
    next_order: isize,
    fx_layer: u8,
}

impl FxChainBuilder {
    pub fn new(
        input: Handle<Image>,
        width: u32,
        height: u32,
        base_order: isize,
        fx_layer: u8,
    ) -> Self {
        Self {
            passes: Vec::new(),
            current_output: input,
            width,
            height,
            next_order: base_order,
            fx_layer,
        }
    }

    pub fn add_pass<E: PostFxEffect>(
        mut self,
        commands: &mut Commands,
        images: &mut Assets<Image>,
        materials: &mut Assets<E::Material>,
        meshes: &mut Assets<Mesh>,
    ) -> Self {
        let pass = FxPass::new::<E>(
            commands,
            images,
            materials,
            meshes,
            self.current_output.clone(),
            self.width,
            self.height,
            self.next_order,
            self.fx_layer,
        );

        self.current_output = pass.output.clone();
        self.next_order += 1;
        self.passes.push(pass);
        self
    }

    pub fn build(self, params: FxParams) -> FxChain {
        FxChain {
            passes: self.passes,
            params,
        }
    }
}
```

### Creating a Per-Shape Chain

```rust
/// Create the full pipeline for one shape
fn create_shape_fx_pipeline(
    commands: &mut Commands,
    images: &mut Assets<Image>,
    meshes: &mut Assets<Mesh>,
    power2d_materials: &mut Assets<Power2dMaterial>,
    wobble_materials: &mut Assets<WobbleMaterial>,
    hblur_materials: &mut Assets<HBlurMaterial>,
    vblur_materials: &mut Assets<VBlurMaterial>,
    pixelate_materials: &mut Assets<PixelateMaterial>,
    alpha_materials: &mut Assets<AlphaThresholdMaterial>,
    shape_id: ShapeFxId,
    points: &[Vec2],
    material_def: &Power2dMaterialDef,
    fx_params: FxParams,
    shape_layer: u8,
    fx_layer: u8,
) -> ShapeFxBundle {
    // Calculate bounding box
    let bbox = calculate_bbox(points);
    let width = bbox.width().ceil() as u32;
    let height = bbox.height().ceil() as u32;

    // Base camera order for this shape
    let base_order = -(shape_id.0 as isize * 10) - 100;

    // 1. Create shape camera and target
    let (shape_camera, shape_target) = create_shape_camera(
        commands,
        images,
        shape_id,
        bbox,
        shape_layer,
        base_order,
    );

    // 2. Spawn shape entity
    spawn_fx_shape(
        commands,
        meshes,
        power2d_materials,
        points,
        material_def,
        shape_id,
        shape_layer,
    );

    // 3. Build FX chain
    let fx_chain = FxChainBuilder::new(
        shape_target.clone(),
        width,
        height,
        base_order + 1,
        fx_layer,
    )
    .add_pass::<WobbleEffect>(commands, images, wobble_materials, meshes)
    .add_pass::<HBlurEffect>(commands, images, hblur_materials, meshes)
    .add_pass::<VBlurEffect>(commands, images, vblur_materials, meshes)
    .add_pass::<PixelateEffect>(commands, images, pixelate_materials, meshes)
    .add_pass::<AlphaThresholdEffect>(commands, images, alpha_materials, meshes)
    .build(fx_params);

    // 4. Create output quad for final composition
    let output_quad = spawn_output_quad(
        commands,
        meshes,
        images,
        fx_chain.output().clone(),
        bbox,
    );

    ShapeFxBundle {
        id: shape_id,
        bbox,
        shape_layer,
        shape_camera,
        shape_target,
        fx_chain,
        output_quad,
    }
}
```

---

## Final Composition

### Output Quad

```rust
/// Material for final composition quads
#[derive(Asset, AsBindGroup, TypePath, Clone)]
pub struct CompositeQuadMaterial {
    #[texture(0)]
    #[sampler(1)]
    pub texture: Handle<Image>,
}

impl Material2d for CompositeQuadMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/composite_quad.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

fn spawn_output_quad(
    commands: &mut Commands,
    meshes: &mut Assets<Mesh>,
    materials: &mut Assets<CompositeQuadMaterial>,
    texture: Handle<Image>,
    bbox: Rect,
) -> Entity {
    let material = materials.add(CompositeQuadMaterial { texture });

    // Quad sized and positioned to match bbox
    let mesh = meshes.add(Rectangle::new(bbox.width(), bbox.height()));

    commands.spawn((
        Mesh2d(mesh),
        MeshMaterial2d(material),
        Transform::from_xyz(
            bbox.center().x,
            bbox.center().y,
            0.0,
        ),
        RenderLayers::layer(0),  // Final composition layer
        CompositeQuad,
    )).id()
}

/// Final camera that composites all output quads
fn setup_final_camera(commands: &mut Commands) {
    commands.spawn((
        Camera2d,
        Camera {
            order: 100,  // Renders last
            ..default()
        },
        RenderLayers::layer(0),
    ));
}
```

---

## Code Generation

### Proc Macro for PostFX Effects

```rust
// User writes this .wgsl file:
// shaders/postfx/wobble.wgsl

// And annotates a struct:
#[derive(PostFxMaterial)]
#[shader("shaders/postfx/wobble.wgsl")]
pub struct WobbleUniforms {
    pub x_strength: f32,
    pub y_strength: f32,
    pub time: f32,
}

// Proc macro generates:
// - WobbleMaterial with AsBindGroup
// - Material2d impl
// - WobbleEffect impl
// - Typed setters
```

### Proc Macro for Power2D Materials

```rust
// User writes this .material.wgsl file with vertShader/fragShader

// And annotates:
#[derive(Power2dMaterial)]
#[shader("shaders/basic.material.wgsl")]
pub struct BasicUniforms {
    pub time: f32,
    pub color: Vec3,
}

// For instanced materials:
#[derive(Power2dMaterial)]
#[shader("shaders/instanced_basic.material.wgsl")]
#[instanced]
pub struct InstancedBasicUniforms {
    pub time: f32,
    pub color: Vec3,
}

#[derive(InstanceAttrs)]
pub struct InstancedBasicInstance {
    pub offset: Vec2,
    pub scale: f32,
    pub rotation: f32,
    pub tint: Vec3,
    pub instance_index: f32,
}

// Proc macro generates:
// - Material2d impl with custom vertex shader
// - Instance buffer layout
// - Typed uniform setters
```

---

## Implementation Phases

### Phase 1: Core Rendering Infrastructure

**Goal**: Render Power2D shapes to textures.

1. **Render target management**
   - Create/resize render targets
   - Image handle registry

2. **Shape camera system**
   - Per-shape orthographic cameras
   - Render layer assignment

3. **Basic shape rendering**
   - Triangulation (port earcut)
   - Simple flat-color material
   - Render to texture verification

**Deliverable**: Shapes render to textures viewable in debug UI.

### Phase 2: PostFX Pipeline

**Goal**: Process shape textures through effect chains.

1. **PostFX effect trait**
   - Material creation
   - Uniform updates

2. **FxPass implementation**
   - Fullscreen quad
   - Pass camera
   - Input/output texture binding

3. **FxChain builder**
   - Multi-pass chaining
   - Parameter propagation

4. **Port basic effects**
   - Wobble
   - Horizontal/Vertical blur
   - Pixelate
   - Alpha threshold

**Deliverable**: Shape → FX chain → processed texture.

### Phase 3: Final Composition

**Goal**: Composite all FX outputs into final scene.

1. **Output quad system**
   - Position at bbox
   - Alpha blending

2. **Z-ordering**
   - Configurable layer order
   - Alpha sorting

3. **Final camera**
   - Composites all quads
   - Background handling

**Deliverable**: Multiple shapes with independent FX chains composited.

### Phase 4: Power2D Integration

**Goal**: Full Power2D material system.

1. **Material code generation**
   - Parse .material.wgsl format
   - Generate Bevy Material2d impls

2. **StyledShape equivalent**
   - Body + stroke entities
   - Material instance management
   - Transform uniforms

3. **BatchedStyledShape equivalent**
   - Instance buffer management
   - Per-instance attribute updates

**Deliverable**: Full Power2D API parity.

### Phase 5: Remote Control Integration

**Goal**: Deno → Bevy control via WebSocket.

1. **Protocol integration**
   - Shape create/delete commands
   - Uniform update commands
   - FX parameter commands

2. **Shape registry**
   - ShapeId → Entity mapping
   - FxChain → Entity mapping

3. **Diff-based updates**
   - Incremental uniform updates
   - Mesh rebuilds on point changes

**Deliverable**: Deno notebook controls Bevy rendering.

---

## Shader Porting

### PostFX Shaders (WGSL)

The existing `.fragFunc.wgsl` shaders port with minimal changes:

**Original (Babylon/TypeScript):**
```wgsl
struct WobbleUniforms {
  xStrength: f32,
  yStrength: f32,
  time: f32,
};

fn pass0(uv: vec2f, uniforms: WobbleUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  var uv2 = uv;
  uv2.x = uv2.x + sin(uv.y * 10.0 + uniforms.time * 2.0) * uniforms.xStrength;
  uv2.y = uv2.y + cos(uv.x * 10.0 + uniforms.time * 2.0) * uniforms.yStrength;
  return textureSample(src, srcSampler, uv2);
}
```

**Bevy version:**
```wgsl
#import bevy_sprite::mesh2d_vertex_output::VertexOutput

@group(2) @binding(0) var<uniform> x_strength: f32;
@group(2) @binding(1) var<uniform> y_strength: f32;
@group(2) @binding(2) var<uniform> time: f32;
@group(2) @binding(3) var src: texture_2d<f32>;
@group(2) @binding(4) var src_sampler: sampler;

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    var uv = in.uv;
    uv.x = uv.x + sin(in.uv.y * 10.0 + time * 2.0) * x_strength;
    uv.y = uv.y + cos(in.uv.x * 10.0 + time * 2.0) * y_strength;
    return textureSample(src, src_sampler, uv);
}
```

### Power2D Material Shaders

**Original format:**
```wgsl
struct BasicUniforms { time: f32, color: vec3f };

fn vertShader(position: vec2f, uv: vec2f, uniforms: BasicUniforms) -> vec2f {
  return position;
}

fn fragShader(uv: vec2f, uniforms: BasicUniforms) -> vec4f {
  return vec4f(uniforms.color, 1.0);
}
```

**Bevy version (with codegen):**
```wgsl
#import bevy_sprite::mesh2d_vertex_output::VertexOutput
#import power2d::transforms::pixel_to_ndc, apply_shape_transform

struct BasicUniforms {
    time: f32,
    color: vec3<f32>,
}

@group(2) @binding(0) var<uniform> uniforms: BasicUniforms;
@group(2) @binding(1) var<uniform> canvas_size: vec2<f32>;
@group(2) @binding(2) var<uniform> shape_transform: mat3x3<f32>;

// User's vertShader function
fn vert_shader(position: vec2<f32>, uv: vec2<f32>, u: BasicUniforms) -> vec2<f32> {
    return position;
}

// User's fragShader function
fn frag_shader(uv: vec2<f32>, u: BasicUniforms) -> vec4<f32> {
    return vec4<f32>(u.color, 1.0);
}

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    let pixel_pos = vec2<f32>(vertex.position.x, vertex.position.y);
    let adjusted = vert_shader(pixel_pos, vertex.uv, uniforms);
    let transformed = apply_shape_transform(adjusted, shape_transform);
    let ndc = pixel_to_ndc(transformed, canvas_size);

    var out: VertexOutput;
    out.position = vec4<f32>(ndc, 0.0, 1.0);
    out.uv = vertex.uv;
    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    return frag_shader(in.uv, uniforms);
}
```

---

## Resource Management

### ShapeFxRegistry

```rust
#[derive(Resource, Default)]
pub struct ShapeFxRegistry {
    bundles: HashMap<ShapeFxId, ShapeFxBundle>,
    next_id: u32,
    layer_allocator: LayerAllocator,
}

impl ShapeFxRegistry {
    pub fn create_shape(&mut self, /* params */) -> ShapeFxId {
        let id = ShapeFxId(self.next_id);
        self.next_id += 1;

        let layer = self.layer_allocator.allocate();
        // Create bundle...

        id
    }

    pub fn remove_shape(&mut self, id: ShapeFxId, commands: &mut Commands) {
        if let Some(bundle) = self.bundles.remove(&id) {
            // Despawn all entities
            commands.entity(bundle.shape_camera).despawn();
            commands.entity(bundle.output_quad).despawn();
            for pass in bundle.fx_chain.passes {
                commands.entity(pass.camera).despawn();
                commands.entity(pass.quad).despawn();
            }
            self.layer_allocator.free(bundle.shape_layer);
        }
    }

    pub fn get(&self, id: ShapeFxId) -> Option<&ShapeFxBundle> {
        self.bundles.get(&id)
    }

    pub fn get_mut(&mut self, id: ShapeFxId) -> Option<&mut ShapeFxBundle> {
        self.bundles.get_mut(&id)
    }
}
```

### Update System

```rust
fn update_shape_fx_chains(
    time: Res<Time>,
    mut registry: ResMut<ShapeFxRegistry>,
    world: &mut World,
) {
    let elapsed = time.elapsed_secs();

    for bundle in registry.bundles.values() {
        bundle.fx_chain.update(world, elapsed);
    }
}
```

---

## Open Questions

### Layer Limits

Bevy's `RenderLayers` supports up to 32 layers. With per-shape layers:
- Each shape needs ~1 layer for shape rendering
- FX passes can share a layer (different cameras)
- May need layer recycling for many shapes

**Options:**
1. Recycle layers when shapes are destroyed
2. Use render graph nodes instead of layers for more flexibility
3. Batch shapes that share FX parameters onto same layer

### Camera Count

Many shapes = many cameras. Performance considerations:
- Each camera has setup/teardown overhead
- May want to batch shapes with same FX params
- Could use single camera with multiple render passes via render graph

### Dynamic Resize

When shape bbox changes:
- Render targets need resizing
- FX chain outputs need resizing
- May want pooled render targets of common sizes

---

## References

- [Bevy Render Layers](https://docs.rs/bevy/latest/bevy/render/view/struct.RenderLayers.html)
- [Bevy Camera Ordering](https://docs.rs/bevy/latest/bevy/render/camera/struct.Camera.html#structfield.order)
- [Bevy Material2d](https://docs.rs/bevy/latest/bevy/sprite/trait.Material2d.html)
- [Power2D Babylon Spec](./power2DBabylon.md)
- [Power2D Deno to Bevy](./power2DDenoToBevy.md)
- [polygonFx.ts](../../src/sketches/mpe_projmap/polygonFx.ts) - Original implementation
