# Power2D: Deno to Bevy Implementation Plan

This document extends the isomorphic livecoding architecture to support Bevy as a rendering backend, enabling the same Deno notebook workflow to drive either a browser (Babylon.js) or a native Bevy application.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Why Not Bevy Remote Protocol](#why-not-bevy-remote-protocol)
3. [Custom Wire Protocol](#custom-wire-protocol)
4. [Bevy-Side Architecture](#bevy-side-architecture)
5. [Deno-Side Changes](#deno-side-changes)
6. [Mapping Power2D Concepts to Bevy](#mapping-power2d-concepts-to-bevy)
7. [Performance Considerations](#performance-considerations)
8. [Implementation Phases](#implementation-phases)
9. [Open Questions](#open-questions)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Deno / TypeScript                           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  Sketch Code    │───▶│  State Backend  │───▶│  Diff Emitter   │  │
│  │  (Portable API) │    │  (Registry +    │    │  (Binary/JSON)  │  │
│  │                 │    │   Dirty Flags)  │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘  │
└─────────────────────────────────────────────────────────│───────────┘
                                                          │
                                              WebSocket (Binary)
                                                          │
┌─────────────────────────────────────────────────────────▼───────────┐
│                              Bevy                                    │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  WebSocket      │───▶│  Command Queue  │───▶│  Reconciler     │  │
│  │  Server         │    │  (Thread-safe)  │    │  System         │  │
│  │  (tokio)        │    │                 │    │                 │  │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘  │
│                                                         │           │
│                         ┌───────────────────────────────┘           │
│                         ▼                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    ECS World                                 │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │   │
│  │  │ Entity  │  │ Mesh2d  │  │Material │  │ Instance Buffer │ │   │
│  │  │ + Shape │  │ Handle  │  │ Handle  │  │ (GPU)           │ │   │
│  │  │ Component│  │         │  │         │  │                 │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Custom protocol over BRP | BRP doesn't support Material/Mesh asset mutations |
| Binary WebSocket | 60-75% smaller payloads for float arrays (instance attrs, vertices) |
| Command queue pattern | Bevy owns the main loop; external commands queued for system processing |
| Hybrid JSON+binary format | JSON for structured data, binary for large typed arrays |

---

## Why Not Bevy Remote Protocol

The Bevy Remote Protocol (BRP) is designed for ECS inspection and manipulation—it speaks "entities and components," not "shapes and materials."

### BRP Limitations for Power2D

1. **No Material Asset Mutation**
   - BRP can mutate *components*, but `Assets<Material>` is a resource with handles
   - Updating uniform values requires `materials.get_mut(handle)`, not component access

2. **No Mesh Asset Mutation**
   - Same issue: `Assets<Mesh>` is a resource
   - `setPoints()` requires mesh rebuild, not component update

3. **No Instance Buffer Support**
   - `BatchedStyledShape` uses custom vertex buffers with `VertexStepMode::Instance`
   - BRP has no concept of GPU buffer management

4. **JSON-RPC Overhead**
   - Every message wrapped in `{id, method, params}` structure
   - Unnecessary for streaming diff updates at 60fps

### What BRP Could Handle (But We Won't Use)

- Entity spawn/despawn (shape lifecycle)
- Component queries (debugging/inspection)
- Transform updates (if transforms were components)

**Conclusion**: Building a purpose-built protocol is cleaner than adapting BRP.

---

## Custom Wire Protocol

### Message Format

```
┌──────────┬───────────┬──────────────┬─────────────────────┐
│ u8       │ u32       │ Variable     │ Variable            │
│ msgType  │ jsonLen   │ JSON header  │ Binary payloads     │
└──────────┴───────────┴──────────────┴─────────────────────┘
```

- **msgType**: Single byte identifying the operation
- **jsonLen**: Length of JSON header in bytes (little-endian u32)
- **JSON header**: Structured metadata (shape IDs, array offsets, dirty flags)
- **Binary payloads**: Packed TypedArrays (Float32Array data as raw bytes)

### Message Types

```typescript
enum MessageType {
  // Lifecycle
  CreateShapes    = 0x01,  // JSON: shape descriptors with initial state
  DeleteShapes    = 0x02,  // JSON: [shapeId, ...]

  // Uniform updates (JSON-only, small payloads)
  UpdateUniforms  = 0x03,  // JSON: {shapeId: {uniform: value, ...}, ...}

  // Geometry updates (JSON header + binary)
  UpdatePoints    = 0x04,  // JSON: {shapeId: {vertexCount, indexCount}}, binary: vertices, indices
  UpdateStroke    = 0x05,  // JSON: {shapeId: {thickness?, vertexCount?}}, binary?: stroke mesh

  // Instance attributes (JSON header + binary)
  UpdateInstances = 0x06,  // JSON: {shapeId: {instanceCount, dirtyRange}}, binary: packed attrs

  // Batched frame update (combines multiple operations)
  FrameUpdate     = 0x10,  // JSON: {creates, deletes, uniforms, meshUpdates, instanceUpdates}, binary: all arrays

  // Control
  Sync            = 0xF0,  // JSON: {frameId}, for latency measurement
  SyncAck         = 0xF1,  // JSON: {frameId, serverTime}
}
```

### JSON Header Examples

**CreateShapes (0x01)**
```json
{
  "shapes": [
    {
      "id": "shape_001",
      "type": "styled",
      "material": "BasicMaterial",
      "strokeMaterial": "BasicStrokeMaterial",
      "strokeThickness": 3.0,
      "closed": true,
      "initialUniforms": {"time": 0, "color": [1, 0, 0]},
      "initialPoints": {"offset": 0, "count": 4}
    }
  ]
}
// Binary: [x0,y0, x1,y1, x2,y2, x3,y3] as Float32Array
```

**UpdateInstances (0x06)**
```json
{
  "shapeId": "batched_001",
  "instanceCount": 1000,
  "layout": ["offset", "scale", "rotation", "tint"],
  "floatsPerInstance": 8,
  "dirtyRange": {"start": 0, "count": 1000}
}
// Binary: 1000 * 8 * 4 = 32000 bytes of packed instance data
```

**FrameUpdate (0x10)** — Batched for efficiency
```json
{
  "frameId": 12345,
  "creates": [...],
  "deletes": ["shape_old"],
  "uniforms": {
    "shape_001": {"time": 1.5},
    "shape_002": {"color": [0, 1, 0]}
  },
  "meshUpdates": [
    {"shapeId": "shape_003", "vertexOffset": 0, "vertexCount": 100, "indexOffset": 400, "indexCount": 288}
  ],
  "instanceUpdates": [
    {"shapeId": "batched_001", "offset": 0, "count": 32000}
  ]
}
// Binary: [mesh vertices][mesh indices][instance attrs]
```

### Binary Payload Layout

For `FrameUpdate`, binary payloads are concatenated in order:

1. All mesh vertex arrays (order matches `meshUpdates` array)
2. All mesh index arrays
3. All instance attribute arrays (order matches `instanceUpdates` array)

The JSON header contains offsets/counts to slice the binary buffer correctly.

---

## Bevy-Side Architecture

### Crate Structure

```
power2d_bevy/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Plugin entry point
│   ├── protocol/
│   │   ├── mod.rs
│   │   ├── message.rs         # Message type definitions
│   │   ├── deserialize.rs     # Binary + JSON parsing
│   │   └── command.rs         # Power2DCommand enum
│   ├── server/
│   │   ├── mod.rs
│   │   ├── websocket.rs       # tokio-tungstenite server
│   │   └── queue.rs           # Thread-safe command queue
│   ├── reconciler/
│   │   ├── mod.rs
│   │   ├── system.rs          # Bevy system that processes commands
│   │   ├── shape_registry.rs  # ShapeId → Entity mapping
│   │   └── material_cache.rs  # Material type → Handle cache
│   ├── rendering/
│   │   ├── mod.rs
│   │   ├── styled_shape.rs    # StyledShape component + mesh building
│   │   ├── batched_shape.rs   # BatchedStyledShape + instancing
│   │   ├── materials/
│   │   │   ├── mod.rs
│   │   │   ├── basic.rs       # BasicMaterial (Material2d impl)
│   │   │   └── basic_stroke.rs
│   │   └── stroke_mesh.rs     # Stroke mesh generation (port from TS)
│   └── point_generators.rs    # RectPts, CirclePts, etc. (port from TS)
```

### Plugin Structure

```rust
pub struct Power2DPlugin {
    pub port: u16,
    pub canvas_width: f32,
    pub canvas_height: f32,
}

impl Plugin for Power2DPlugin {
    fn build(&self, app: &mut App) {
        app
            // Resources
            .insert_resource(Power2DConfig {
                canvas_width: self.canvas_width,
                canvas_height: self.canvas_height,
            })
            .insert_resource(ShapeRegistry::default())
            .insert_resource(CommandQueue::default())

            // Materials
            .add_plugins(Material2dPlugin::<BasicMaterial>::default())
            .add_plugins(Material2dPlugin::<BasicStrokeMaterial>::default())

            // Systems
            .add_systems(Startup, start_websocket_server)
            .add_systems(Update, (
                process_commands.run_if(commands_available),
                update_canvas_size,
            ));
    }
}
```

### Command Queue (Thread-Safe)

```rust
// Shared between WebSocket thread and Bevy systems
#[derive(Resource, Default)]
pub struct CommandQueue {
    queue: Arc<Mutex<VecDeque<Power2DCommand>>>,
}

impl CommandQueue {
    pub fn push(&self, cmd: Power2DCommand) {
        self.queue.lock().unwrap().push_back(cmd);
    }

    pub fn drain(&self) -> Vec<Power2DCommand> {
        let mut guard = self.queue.lock().unwrap();
        guard.drain(..).collect()
    }
}

pub enum Power2DCommand {
    CreateShape {
        id: ShapeId,
        descriptor: ShapeDescriptor,
        initial_points: Option<Vec<Vec2>>,
    },
    DeleteShape(ShapeId),
    UpdateUniforms {
        id: ShapeId,
        uniforms: UniformUpdate,
    },
    UpdatePoints {
        id: ShapeId,
        vertices: Vec<Vec2>,
        indices: Option<Vec<u32>>,
    },
    UpdateInstanceAttrs {
        id: ShapeId,
        data: Vec<u8>,  // Raw bytes, interpreted per instance layout
        range: Range<usize>,
    },
    // ... etc
}
```

### Reconciler System

```rust
fn process_commands(
    mut commands: Commands,
    queue: Res<CommandQueue>,
    mut registry: ResMut<ShapeRegistry>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<BasicMaterial>>,
    mut shapes: Query<(&Power2DShape, &mut Handle<Mesh>, &MeshMaterial2d<BasicMaterial>)>,
    config: Res<Power2DConfig>,
) {
    for cmd in queue.drain() {
        match cmd {
            Power2DCommand::CreateShape { id, descriptor, initial_points } => {
                let entity = spawn_shape(&mut commands, &mut meshes, &mut materials, &descriptor, initial_points, &config);
                registry.insert(id, entity);
            }

            Power2DCommand::DeleteShape(id) => {
                if let Some(entity) = registry.remove(&id) {
                    commands.entity(entity).despawn_recursive();
                }
            }

            Power2DCommand::UpdateUniforms { id, uniforms } => {
                if let Some(entity) = registry.get(&id) {
                    if let Ok((shape, _, mat_handle)) = shapes.get(*entity) {
                        if let Some(mat) = materials.get_mut(&mat_handle.0) {
                            apply_uniforms(mat, &uniforms);
                        }
                    }
                }
            }

            Power2DCommand::UpdatePoints { id, vertices, indices } => {
                if let Some(entity) = registry.get(&id) {
                    if let Ok((shape, mut mesh_handle, _)) = shapes.get_mut(*entity) {
                        // Rebuild mesh with new vertices
                        let new_mesh = build_mesh(&vertices, indices.as_deref());
                        *mesh_handle = meshes.add(new_mesh);
                    }
                }
            }

            // ... etc
        }
    }
}
```

### Material Definition (Example)

```rust
#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct BasicMaterial {
    #[uniform(0)]
    pub time: f32,
    #[uniform(0)]
    pub color: Vec4,
    #[uniform(0)]
    pub canvas_size: Vec2,
}

impl Material2d for BasicMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/basic.wgsl".into()
    }

    fn vertex_shader() -> ShaderRef {
        "shaders/basic.wgsl".into()
    }
}
```

### Instance Attributes (BatchedStyledShape)

```rust
// Component marking a batched shape
#[derive(Component)]
pub struct BatchedShape {
    pub instance_count: usize,
    pub floats_per_instance: usize,
}

// Instance data buffer
#[derive(Component)]
pub struct InstanceBuffer {
    pub buffer: Buffer,
    pub capacity: usize,
}

fn update_instance_buffer(
    render_device: Res<RenderDevice>,
    mut query: Query<(&BatchedShape, &mut InstanceBuffer)>,
    queue: Res<CommandQueue>,
) {
    for cmd in queue.drain() {
        if let Power2DCommand::UpdateInstanceAttrs { id, data, range } = cmd {
            // Find entity, update buffer slice
            if let Ok((shape, mut buffer)) = query.get_mut(entity) {
                render_device.queue().write_buffer(
                    &buffer.buffer,
                    (range.start * 4) as u64,
                    &data,
                );
            }
        }
    }
}

// Vertex buffer layout for instancing
fn instance_buffer_layout() -> VertexBufferLayout {
    VertexBufferLayout::from_vertex_formats(
        VertexStepMode::Instance,
        [
            VertexFormat::Float32x2,  // offset
            VertexFormat::Float32,    // scale
            VertexFormat::Float32,    // rotation
            VertexFormat::Float32x4,  // tint (RGBA)
        ],
    )
    .offset_locations(3)  // Start at @location(3) after mesh attrs
}
```

---

## Deno-Side Changes

### Transport Abstraction

The existing state backend needs a pluggable transport layer:

```typescript
interface DiffTransport {
  send(diff: FrameDiff): void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

// Browser transport (existing)
class BrowserWebSocketTransport implements DiffTransport {
  constructor(private ws: WebSocket) {}

  send(diff: FrameDiff) {
    // Serialize to JSON (current implementation)
    this.ws.send(JSON.stringify(diff));
  }
}

// Bevy transport (new)
class BevyBinaryTransport implements DiffTransport {
  constructor(private ws: WebSocket) {
    this.ws.binaryType = 'arraybuffer';
  }

  send(diff: FrameDiff) {
    const message = serializeBinaryMessage(diff);
    this.ws.send(message);
  }
}
```

### Binary Serialization

```typescript
function serializeBinaryMessage(diff: FrameDiff): ArrayBuffer {
  // 1. Separate small updates (JSON) from large arrays (binary)
  const jsonPayload = {
    frameId: diff.frameId,
    creates: diff.creates,
    deletes: diff.deletes,
    uniforms: diff.uniforms,
    // Array metadata only (offsets, counts)
    meshUpdates: diff.meshUpdates?.map(m => ({
      shapeId: m.shapeId,
      vertexCount: m.vertices.length / 2,
      indexCount: m.indices?.length ?? 0,
    })),
    instanceUpdates: diff.instanceUpdates?.map(i => ({
      shapeId: i.shapeId,
      instanceCount: i.count,
      dirtyRange: i.dirtyRange,
    })),
  };

  const jsonStr = JSON.stringify(jsonPayload);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  // 2. Collect binary arrays
  const binaryArrays: ArrayBuffer[] = [];

  for (const mesh of diff.meshUpdates ?? []) {
    binaryArrays.push(mesh.vertices.buffer);  // Float32Array → ArrayBuffer
    if (mesh.indices) {
      binaryArrays.push(mesh.indices.buffer);  // Uint32Array → ArrayBuffer
    }
  }

  for (const inst of diff.instanceUpdates ?? []) {
    binaryArrays.push(inst.data.buffer);  // Packed instance attrs
  }

  // 3. Build final message
  const binaryTotal = binaryArrays.reduce((sum, arr) => sum + arr.byteLength, 0);
  const totalSize = 1 + 4 + jsonBytes.length + binaryTotal;

  const result = new ArrayBuffer(totalSize);
  const view = new DataView(result);
  const bytes = new Uint8Array(result);

  let offset = 0;

  // Message type
  view.setUint8(offset, MessageType.FrameUpdate);
  offset += 1;

  // JSON length
  view.setUint32(offset, jsonBytes.length, true);  // little-endian
  offset += 4;

  // JSON bytes
  bytes.set(jsonBytes, offset);
  offset += jsonBytes.length;

  // Binary payloads
  for (const arr of binaryArrays) {
    bytes.set(new Uint8Array(arr), offset);
    offset += arr.byteLength;
  }

  return result;
}
```

### Typed Packed Array Helpers (Generated)

For ergonomic per-instance attribute writing:

```typescript
// Generated from material definition
interface InstancedBasicAttrs {
  offset: [number, number];
  scale: number;
  rotation: number;
  tint: [number, number, number, number];
}

class InstancedBasicAttrArray {
  private data: Float32Array;
  private static readonly FLOATS_PER_INSTANCE = 8;

  constructor(instanceCount: number) {
    this.data = new Float32Array(instanceCount * InstancedBasicAttrArray.FLOATS_PER_INSTANCE);
  }

  set(index: number, attrs: Partial<InstancedBasicAttrs>) {
    const base = index * InstancedBasicAttrArray.FLOATS_PER_INSTANCE;
    if (attrs.offset !== undefined) {
      this.data[base + 0] = attrs.offset[0];
      this.data[base + 1] = attrs.offset[1];
    }
    if (attrs.scale !== undefined) {
      this.data[base + 2] = attrs.scale;
    }
    if (attrs.rotation !== undefined) {
      this.data[base + 3] = attrs.rotation;
    }
    if (attrs.tint !== undefined) {
      this.data[base + 4] = attrs.tint[0];
      this.data[base + 5] = attrs.tint[1];
      this.data[base + 6] = attrs.tint[2];
      this.data[base + 7] = attrs.tint[3];
    }
  }

  get buffer(): ArrayBuffer {
    return this.data.buffer;
  }
}
```

---

## Mapping Power2D Concepts to Bevy

### StyledShape

| Power2D (TS/Babylon) | Bevy |
|---------------------|------|
| `StyledShape` class instance | Entity with `Power2DShape` component |
| `bodyMesh: BABYLON.Mesh` | `Handle<Mesh>` + `Mesh2d` component |
| `bodyMaterialInstance` | `Handle<BasicMaterial>` + `MeshMaterial2d` |
| `strokeMesh` | Child entity with stroke mesh/material |
| `parentNode` | Parent entity (for body + stroke grouping) |
| `setUniforms({...})` | Mutate material asset via `materials.get_mut(handle)` |
| `setPoints([...])` | Rebuild mesh, update handle |
| `alphaIndex` | Render layer or Z-coordinate |

### BatchedStyledShape

| Power2D (TS/Babylon) | Bevy |
|---------------------|------|
| `BatchedStyledShape` class | Entity with `BatchedShape` + `InstanceBuffer` components |
| `instanceData: Float32Array` | `Buffer` with `BufferUsages::VERTEX` |
| `writeInstanceAttr(i, {...})` | Write to buffer via command queue |
| `thinInstanceCount` | Draw call instance count |
| `VertexBuffer` from `StorageBuffer` | `VertexBufferLayout` with `VertexStepMode::Instance` |

### Point Generators

Direct port—pure functions with identical signatures:

```rust
pub fn rect_pts(x: f32, y: f32, width: f32, height: f32) -> Vec<Vec2> {
    vec![
        Vec2::new(x, y),
        Vec2::new(x + width, y),
        Vec2::new(x + width, y + height),
        Vec2::new(x, y + height),
    ]
}

pub fn circle_pts(cx: f32, cy: f32, radius: f32, segments: usize) -> Vec<Vec2> {
    (0..segments)
        .map(|i| {
            let angle = (i as f32 / segments as f32) * std::f32::consts::TAU;
            Vec2::new(cx + angle.cos() * radius, cy + angle.sin() * radius)
        })
        .collect()
}
```

### Stroke Mesh Generation

Port the `strokeMeshGenerator.ts` algorithm to Rust. Same logic:
1. Compute tangents and normals for each segment
2. Generate quad strip with vertices on both sides of centerline
3. Compute arc lengths and miter factors
4. Output: positions, uvs, normals, sides, arcLengths, miterFactors, indices

---

## Performance Considerations

### Latency Budget (60fps = 16.6ms)

| Component | Expected Latency | Notes |
|-----------|------------------|-------|
| Deno state diff generation | < 1ms | In-memory dirty flag checks |
| Binary serialization | < 0.5ms | TypedArray buffer concatenation |
| WebSocket send (localhost) | 0.1-0.5ms | Binary frames |
| Rust deserialization | < 0.5ms | JSON header + zero-copy binary slices |
| Command queue processing | < 1ms | Depends on command count |
| Mesh/material updates | 1-5ms | Depends on mesh complexity |
| **Total** | **~5-10ms** | Leaves headroom for rendering |

### When Binary Format Matters

| Payload Type | JSON Size | Binary Size | Use Binary? |
|--------------|-----------|-------------|-------------|
| 10 uniform updates | ~1KB | ~0.8KB | No |
| 100 uniform updates | ~10KB | ~6KB | Maybe |
| 1000 instance attrs (8 floats each) | ~80-120KB | 32KB | **Yes** |
| 500 vertex mesh update | ~25-40KB | 10KB | **Yes** |

### Dirty Tracking Optimization

The state backend should track:
- **Uniform dirty**: Which uniforms changed (bitmask per shape)
- **Geometry dirty**: Points changed (full rebuild needed)
- **Instance dirty range**: [start, end) of modified instances

This avoids sending unchanged data:

```typescript
interface ShapeDirtyState {
  uniformsDirty: Set<string>;  // Which uniform fields changed
  pointsDirty: boolean;
  instanceDirtyRange: { start: number; end: number } | null;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Bevy Plugin + Protocol)

**Goal**: Deno can create and delete shapes in Bevy with basic uniforms.

1. **Bevy plugin scaffold**
   - `Power2DPlugin` with config
   - WebSocket server (tokio-tungstenite)
   - Command queue resource
   - Basic reconciler system

2. **Protocol basics**
   - Message type enum
   - JSON-only messages (no binary yet)
   - `CreateShapes`, `DeleteShapes`, `UpdateUniforms`

3. **Basic material**
   - Port `BasicMaterial` to Bevy `Material2d`
   - Simple WGSL shader (time, color, canvas size)

4. **Shape registry**
   - `ShapeId → Entity` mapping
   - Create/delete lifecycle

**Deliverable**: Deno sketch creates colored rectangles in Bevy window.

### Phase 2: Geometry Updates

**Goal**: Full mesh support including dynamic point updates.

1. **Triangulation**
   - Integrate `earcutr` crate (Rust port of earcut)
   - Mesh building from point arrays

2. **Point generators**
   - Port `RectPts`, `CirclePts`, `EllipsePts`, `RegularPolygonPts`

3. **UpdatePoints command**
   - Binary payload for vertex data
   - Mesh handle replacement

4. **Stroke mesh generation**
   - Port stroke algorithm
   - Stroke material
   - Body + stroke as parent/child entities

**Deliverable**: Deno sketch creates arbitrary polygons with strokes, can update points at runtime.

### Phase 3: Instancing (BatchedStyledShape)

**Goal**: Efficient instanced rendering with per-instance attributes.

1. **Instance buffer setup**
   - Custom vertex buffer with `VertexStepMode::Instance`
   - `InstanceBuffer` component

2. **Instance attribute layout**
   - Codegen for typed attribute structs (Rust side)
   - Layout matching between TS and Rust

3. **UpdateInstances command**
   - Binary payload for packed instance data
   - Dirty range support (partial updates)

4. **Custom render pipeline**
   - Material that reads instance attributes in vertex shader
   - Instance count in draw call

**Deliverable**: Deno sketch drives 1000+ instanced shapes at 60fps.

### Phase 4: Optimization + Polish

**Goal**: Production-ready performance and developer experience.

1. **Binary protocol optimization**
   - Zero-copy buffer slicing on Rust side
   - Batched frame updates

2. **Dirty tracking improvements**
   - Per-uniform dirty flags
   - Instance dirty ranges
   - Skip unchanged shapes entirely

3. **Material codegen**
   - Generate Rust materials from `.material.wgsl`
   - Type-safe uniform structs

4. **Error handling**
   - Graceful disconnect/reconnect
   - Invalid message handling
   - Debug logging

5. **Testing**
   - Latency benchmarks
   - Stress tests (many shapes, large meshes)
   - Round-trip verification

**Deliverable**: Robust, performant Deno → Bevy pipeline.

---

## Open Questions

### Material System

1. **How to handle multiple material types?**
   - One `Material2d` impl per material, or generic with uniform buffer?
   - Codegen from `.material.wgsl` files?

2. **Texture support**
   - TextureId registry (like browser design)
   - Asset loading on Bevy side
   - Dynamic texture updates?

### Coordinate System

1. **Pixel space conversion**
   - Same approach as Babylon (shader-side NDC conversion)?
   - Or Bevy's native coordinate system?

2. **Camera setup**
   - Orthographic camera matching canvas dimensions
   - `Camera2d` or custom?

### Stroke Rendering

1. **Stroke as separate entity or component?**
   - Parent entity (body + stroke children) matches Babylon design
   - But adds entity overhead

2. **Stroke material attributes**
   - Same attribute layout as Babylon (normals, arcLength, etc.)?
   - Or simplified for initial implementation?

### Hot Reload

1. **Shader hot reload**
   - Bevy asset hot reload works for shaders
   - But material struct changes require recompile

2. **Reconnection handling**
   - Full state resync on reconnect?
   - Or incremental catch-up?

---

## References

- [Bevy Remote Protocol](https://docs.rs/bevy/latest/bevy/remote/index.html) — What we're *not* using, but useful reference
- [Bevy Custom Shader Instancing](https://bevy.org/examples/shaders/custom-shader-instancing/) — Instance buffer pattern
- [Bevy Material2d](https://docs.rs/bevy/latest/bevy/sprite/trait.Material2d.html) — 2D material trait
- [tokio-tungstenite](https://docs.rs/tokio-tungstenite/latest/tokio_tungstenite/) — Async WebSocket for Rust
- [earcutr](https://docs.rs/earcutr/latest/earcutr/) — Rust port of earcut triangulation
- [Power2D Babylon Spec](./power2DBabylon.md) — Original Babylon implementation
- [Isomorphic Design](./narrativePlan.md) — State backend architecture
