# Power 2D Babylon.js Implementation Plan

A Vite plugin system for creating custom-shaded 2D shapes in Babylon.js WebGPU with type-safe uniforms, textures, and instancing support.

---

## Reference Files

This system builds on patterns already established in the codebase. The following files serve as reference implementations:

### Code Generators
- [generateShaderTypes.ts](../../node_src/wgsl/generateShaderTypes.ts) - WGSL → TypeScript generator for `.compute.wgsl` files. Demonstrates struct parsing, uniform buffer generation, and storage buffer handling.
- [generateFragmentShader.ts](../../node_src/wgsl/generateFragmentShader.ts) - Generator for `.fragFunc.wgsl` files. Shows the pattern of wrapping user functions in Babylon.js-compatible shaders.

### Vite Plugins
- [vitePlugin.ts](../../node_src/wgsl/vitePlugin.ts) - Vite plugin for `.compute.wgsl` files
- [viteFragmentPlugin.ts](../../node_src/wgsl/viteFragmentPlugin.ts) - Vite plugin for `.fragFunc.wgsl` files

### Runtime Patterns
- [drawingScene.ts](../gpuStrokes/drawingScene.ts) - Demonstrates storage buffers as vertex buffers for instancing, orthographic camera setup, and zero-copy GPU buffer binding (lines 205-256)
- [letterParticles.ts](../../sketches/text_projmap_sandbox/letterParticles.ts) - Shows instanced rendering with compute-driven instance attributes and the `setupVertexBuffer()` pattern (lines 252-320)
- [shaderFXBabylon.ts](../shaderFXBabylon.ts) - `CustomShaderEffect` class demonstrates texture resolution from multiple source types (Canvas, RenderTargetTexture, ShaderEffect)

### Example WGSL Files
- [strokeAnimation.compute.wgsl](../gpuStrokes/strokeAnimation.compute.wgsl) - Example compute shader with struct definitions and bindings
- [wobble.fragFunc.wgsl](../postFX/wobble.fragFunc.wgsl) - Example fragment function showing the "user writes function, generator wraps it" pattern
- [edge.fragFunc.wgsl](../postFX/edge.fragFunc.wgsl) - Another fragment function example with texture sampling

### Generated Output Examples
- [strokeAnimation.compute.wgsl.generated.ts](../gpuStrokes/strokeAnimation.compute.wgsl.generated.ts) - Shows generated TypeScript interfaces, pack functions, buffer helpers, and shader bindings
- [wobble.frag.generated.ts](../postFX/wobble.frag.generated.ts) - Shows generated material class with typed uniform setters

---

## Table of Contents

1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Material WGSL Format](#material-wgsl-format)
4. [Stroke Material WGSL Format](#stroke-material-wgsl-format)
5. [Code Generation](#code-generation)
6. [Runtime Classes](#runtime-classes)
7. [Point Generators](#point-generators)
8. [Scene Setup Helpers](#scene-setup-helpers)
9. [Vite Plugin](#vite-plugin)
10. [Implementation Order](#implementation-order)

---

## Overview

### Design Goals

- Write a single `.material.wgsl` file defining vertex/fragment shader logic
- Vite plugin generates TypeScript wrapper with typed uniform/texture setters
- `StyledShape` class provides clean API for creating shaded meshes
- Support for custom strokes via separate `.strokeMaterial.wgsl` files
- `BatchedStyledShape` for GPU-instanced rendering with typed instance attributes
- All coordinates in **pixel space** (logical pixels, like p5.js)

### Key Decisions

| Aspect | Decision |
|--------|----------|
| Coordinate system | Pixel coordinates (user-space), converted internally to NDC |
| Scene ownership | User passes pre-created scene; helper available for 2D setup |
| Material passing | Generated module exports constructor used by StyledShape |
| Uniform access | Explicit setters: `shape.setUniforms({...})` |
| Dynamic values | Not supported; update in draw loop instead |
| Vector types | Arrays `[number, number]`, not Babylon types |
| Texture namespace | Separate: `shape.setTexture('name', tex)` |
| Texture sources | BaseTexture, RenderTargetTexture, Canvas, ShaderEffect (auto-resolve) |
| Batch GPU upload | Automatic every frame |
| External buffers | All-or-nothing toggle |
| Stroke path | Auto-derived from body points |
| Point updates | Explicit `setPoints()` with re-triangulation |
| Z-ordering | Depth disabled, use `alphaIndex` for layering |
| Defaults | Error if no material; stroke is `null` if no stroke material |

---

## File Structure

```
src/rendering/power2d/
├── power2DBabylon.md           # This spec
├── generateMaterialTypes.ts     # WGSL → TypeScript generator for .material.wgsl
├── generateStrokeMaterialTypes.ts # Generator for .strokeMaterial.wgsl
├── viteMaterialPlugin.ts        # Vite plugin for .material.wgsl files
├── viteStrokeMaterialPlugin.ts  # Vite plugin for .strokeMaterial.wgsl files
├── StyledShape.ts               # Runtime class for single shapes
├── BatchedStyledShape.ts        # Runtime class for instanced shapes
├── pointGenerators.ts           # RectPts, CirclePts, PolygonPts, etc.
├── strokeMeshGenerator.ts       # Converts path points to stroke mesh
├── sceneHelpers.ts              # createPower2DScene, etc.
└── types.ts                     # Shared type definitions
```

Example user files:
```
src/sketches/mySketch/
├── gradient.material.wgsl
├── gradient.material.wgsl.generated.ts  # Auto-generated
├── dashed.strokeMaterial.wgsl
├── dashed.strokeMaterial.wgsl.generated.ts  # Auto-generated
└── sketch.ts                    # User code
```

---

## Material WGSL Format

### File Naming
Files must be named `*.material.wgsl` to be processed by the Vite plugin.

### Structure

```wgsl
// gradient.material.wgsl

// Uniform struct - values shared across all vertices/fragments
// Field comments define defaults: // defaultValue [min=X max=Y step=Z]
struct GradientUniforms {
  time: f32,           // 0.0
  colorA: vec3f,       // [1.0, 0.0, 0.0]
  colorB: vec3f,       // [0.0, 0.0, 1.0]
  gradientAngle: f32,  // 0.0 min=0 max=6.28 step=0.01
};

// Vertex shader function
// Receives: position (vec2f in pixel coords), uv (vec2f 0-1)
// Returns: position adjustment (or pass through)
fn vertShader(
  position: vec2f,
  uv: vec2f,
  uniforms: GradientUniforms,
) -> vec2f {
  // Custom vertex manipulation (optional)
  return position;
}

// Fragment shader function
// Receives: uv, uniforms, and any declared textures
fn fragShader(
  uv: vec2f,
  uniforms: GradientUniforms,
  // Texture parameters auto-detected by type
  noiseTex: texture_2d<f32>,
  noiseTexSampler: sampler,
) -> vec4f {
  let t = dot(uv - 0.5, vec2f(cos(uniforms.gradientAngle), sin(uniforms.gradientAngle))) + 0.5;
  let color = mix(uniforms.colorA, uniforms.colorB, t);
  let noise = textureSample(noiseTex, noiseTexSampler, uv).r;
  return vec4f(color + noise * 0.1, 1.0);
}
```

### Parsing Rules

1. **Uniform Struct**: Must be named `*Uniforms` (e.g., `GradientUniforms`)
2. **vertShader Function**:
   - First arg: `position: vec2f` (pixel coordinates)
   - Second arg: `uv: vec2f` (0-1 normalized)
   - Third arg: uniforms struct
   - Returns: `vec2f` (adjusted position in pixels)
3. **fragShader Function**:
   - First arg: `uv: vec2f`
   - Second arg: uniforms struct
   - Remaining args: texture/sampler pairs (auto-detected)
   - Returns: `vec4f` (RGBA color)
4. **Default Values**: Parsed from comments after field declarations
5. **Textures**: Detected by `texture_2d<f32>` type, must have matching `*Sampler` parameter

### Generated Wrapper Shader

The generator produces a complete Babylon.js-compatible WGSL shader:

```wgsl
// Auto-generated wrapper

// Babylon.js required structures
attribute position: vec3<f32>;
attribute uv: vec2<f32>;
varying vUV: vec2<f32>;

// Generated uniform declarations (individual uniforms, not UBO)
uniform uniforms_time: f32;
uniform uniforms_colorA: vec3<f32>;
uniform uniforms_colorB: vec3<f32>;
uniform uniforms_gradientAngle: f32;

// Texture declarations
var noiseTex: texture_2d<f32>;
var noiseTexSampler: sampler;

// Canvas/projection uniforms (auto-added)
uniform power2d_canvasWidth: f32;
uniform power2d_canvasHeight: f32;

// User's original structs and functions (verbatim)
struct GradientUniforms { ... }
fn vertShader(...) -> vec2f { ... }
fn fragShader(...) -> vec4f { ... }

// Loader function to construct user's struct
fn load_GradientUniforms() -> GradientUniforms {
  return GradientUniforms(
    uniforms.uniforms_time,
    uniforms.uniforms_colorA,
    uniforms.uniforms_colorB,
    uniforms.uniforms_gradientAngle
  );
}

// Pixel to NDC conversion
fn pixelToNDC(pixelPos: vec2f) -> vec4f {
  let ndcX = (pixelPos.x / uniforms.power2d_canvasWidth) * 2.0 - 1.0;
  let ndcY = 1.0 - (pixelPos.y / uniforms.power2d_canvasHeight) * 2.0;
  return vec4f(ndcX, ndcY, 0.0, 1.0);
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let uniformsValue = load_GradientUniforms();
  let pixelPos = vec2f(vertexInputs.position.x, vertexInputs.position.y);
  let uv = vertexInputs.uv;

  // Call user's vertex shader
  let adjustedPixelPos = vertShader(pixelPos, uv, uniformsValue);

  vertexOutputs.position = pixelToNDC(adjustedPixelPos);
  vertexOutputs.vUV = uv;
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let uniformsValue = load_GradientUniforms();
  let uv = fragmentInputs.vUV;

  // Call user's fragment shader
  let color = fragShader(uv, uniformsValue, noiseTex, noiseTexSampler);

  fragmentOutputs.color = color;
}
```

---

## Stroke Material WGSL Format

### File Naming
Files must be named `*.strokeMaterial.wgsl`.

### Structure

```wgsl
// dashed.strokeMaterial.wgsl

struct DashedStrokeUniforms {
  time: f32,              // 0.0
  dashLength: f32,        // 10.0
  gapLength: f32,         // 5.0
  color: vec4f,           // [1.0, 1.0, 1.0, 1.0]
  animationSpeed: f32,    // 50.0
};

// Stroke vertex shader
// Receives special stroke attributes in addition to standard ones
fn strokeVertShader(
  centerPos: vec2f,       // Position on stroke centerline (pixels)
  normal: vec2f,          // Perpendicular to stroke direction
  side: f32,              // -1.0 or +1.0 (which side of centerline)
  arcLength: f32,         // Distance from stroke start (pixels)
  normalizedArc: f32,     // 0.0 to 1.0 along stroke
  miterFactor: f32,       // Miter adjustment for joins
  thickness: f32,         // Current stroke thickness
  uniforms: DashedStrokeUniforms,
) -> vec2f {
  // Compute final position (default: expand by thickness)
  return centerPos + normal * side * thickness * 0.5 * miterFactor;
}

// Stroke fragment shader
fn strokeFragShader(
  uv: vec2f,              // Local UV within stroke quad
  arcLength: f32,         // Passed from vertex shader
  normalizedArc: f32,
  uniforms: DashedStrokeUniforms,
) -> vec4f {
  // Animated dash pattern
  let phase = arcLength + uniforms.time * uniforms.animationSpeed;
  let period = uniforms.dashLength + uniforms.gapLength;
  let inDash = fract(phase / period) < (uniforms.dashLength / period);

  if (!inDash) {
    discard;
  }

  return uniforms.color;
}
```

### Stroke Mesh Attributes

The stroke mesh generator creates vertices with these attributes:

| Attribute | Type | Description |
|-----------|------|-------------|
| position | vec3f | Center position on stroke path (z=0) |
| uv | vec2f | Local UV (u=0-1 across width, v=normalized arc) |
| normal | vec2f | Perpendicular to stroke direction |
| side | f32 | -1.0 (left) or +1.0 (right) |
| arcLength | f32 | Distance from stroke start in pixels |
| normalizedArc | f32 | 0.0 at start, 1.0 at end |
| miterFactor | f32 | Length multiplier for miter joins |

### Stroke Mesh Generation

The stroke mesh is generated from the body path points:

1. Extract outline from triangulated body (or use original input points)
2. For each segment, compute tangent and normal
3. Generate quad strip with vertices on both sides of centerline
4. Compute arc lengths along the path
5. Handle joins (miter by default, with configurable miter limit)

```typescript
interface StrokeMeshData {
  positions: Float32Array;    // vec3 per vertex
  uvs: Float32Array;          // vec2 per vertex
  normals: Float32Array;      // vec2 per vertex
  sides: Float32Array;        // f32 per vertex
  arcLengths: Float32Array;   // f32 per vertex
  normalizedArcs: Float32Array; // f32 per vertex
  miterFactors: Float32Array; // f32 per vertex
  indices: Uint32Array;
  totalArcLength: number;
}
```

---

## Code Generation

### Generated TypeScript Module (`.material.wgsl.generated.ts`)

```typescript
// gradient.material.wgsl.generated.ts
// Auto-generated by power2d material generator. DO NOT EDIT.

import * as BABYLON from 'babylonjs';

//=============================================================================
// Shader Sources
//=============================================================================

export const GradientVertexSource = `...`;  // Full wrapped vertex shader
export const GradientFragmentSource = `...`; // Full wrapped fragment shader

//=============================================================================
// Uniform Types
//=============================================================================

export interface GradientUniforms {
  time: number;
  colorA: readonly [number, number, number];
  colorB: readonly [number, number, number];
  gradientAngle: number;
}

export const GradientUniformDefaults: GradientUniforms = {
  time: 0.0,
  colorA: [1.0, 0.0, 0.0],
  colorB: [0.0, 0.0, 1.0],
  gradientAngle: 0.0,
};

export const GradientUniformMeta = [
  { name: 'time', kind: 'f32', bindingName: 'uniforms_time', default: 0.0 },
  { name: 'colorA', kind: 'vec3f', bindingName: 'uniforms_colorA', default: [1.0, 0.0, 0.0] },
  { name: 'colorB', kind: 'vec3f', bindingName: 'uniforms_colorB', default: [0.0, 0.0, 1.0] },
  { name: 'gradientAngle', kind: 'f32', bindingName: 'uniforms_gradientAngle', default: 0.0, ui: { min: 0, max: 6.28, step: 0.01 } },
] as const;

//=============================================================================
// Texture Types
//=============================================================================

export type GradientTextureName = 'noiseTex';

export const GradientTextureNames = ['noiseTex'] as const;

//=============================================================================
// Material Definition (used by StyledShape)
//=============================================================================

export interface GradientMaterialDef {
  readonly uniformType: GradientUniforms;
  readonly textureNames: readonly ['noiseTex'];
  readonly vertexSource: string;
  readonly fragmentSource: string;
  readonly uniformMeta: typeof GradientUniformMeta;
  readonly uniformDefaults: GradientUniforms;
  readonly createMaterial: (scene: BABYLON.Scene, name: string) => GradientMaterialInstance;
}

export interface GradientMaterialInstance {
  material: BABYLON.ShaderMaterial;
  setUniforms(uniforms: Partial<GradientUniforms>): void;
  setTexture(name: GradientTextureName, texture: BABYLON.BaseTexture): void;
  setCanvasSize(width: number, height: number): void;
  dispose(): void;
}

export function createGradientMaterial(
  scene: BABYLON.Scene,
  name: string = 'GradientMaterial'
): GradientMaterialInstance {
  const vertexShaderName = `${name}VertexShader`;
  const fragmentShaderName = `${name}FragmentShader`;

  BABYLON.ShaderStore.ShadersStoreWGSL[vertexShaderName] = GradientVertexSource;
  BABYLON.ShaderStore.ShadersStoreWGSL[fragmentShaderName] = GradientFragmentSource;

  const material = new BABYLON.ShaderMaterial(name, scene, {
    vertex: name,
    fragment: name,
  }, {
    attributes: ['position', 'uv'],
    uniforms: [
      'uniforms_time',
      'uniforms_colorA',
      'uniforms_colorB',
      'uniforms_gradientAngle',
      'power2d_canvasWidth',
      'power2d_canvasHeight',
    ],
    samplers: ['noiseTex'],
    samplerObjects: ['noiseTexSampler'],
    shaderLanguage: BABYLON.ShaderLanguage.WGSL,
  });

  // Apply defaults
  material.setFloat('uniforms_time', 0.0);
  material.setVector3('uniforms_colorA', new BABYLON.Vector3(1.0, 0.0, 0.0));
  material.setVector3('uniforms_colorB', new BABYLON.Vector3(0.0, 0.0, 1.0));
  material.setFloat('uniforms_gradientAngle', 0.0);

  // Disable depth for 2D
  material.disableDepthWrite = true;
  material.depthFunction = BABYLON.Constants.ALWAYS;
  material.backFaceCulling = false;
  material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;

  return {
    material,

    setUniforms(uniforms: Partial<GradientUniforms>) {
      if (uniforms.time !== undefined) {
        material.setFloat('uniforms_time', uniforms.time);
      }
      if (uniforms.colorA !== undefined) {
        const v = uniforms.colorA;
        material.setVector3('uniforms_colorA', new BABYLON.Vector3(v[0], v[1], v[2]));
      }
      if (uniforms.colorB !== undefined) {
        const v = uniforms.colorB;
        material.setVector3('uniforms_colorB', new BABYLON.Vector3(v[0], v[1], v[2]));
      }
      if (uniforms.gradientAngle !== undefined) {
        material.setFloat('uniforms_gradientAngle', uniforms.gradientAngle);
      }
    },

    setTexture(name: GradientTextureName, texture: BABYLON.BaseTexture) {
      material.setTexture(name, texture);
    },

    setCanvasSize(width: number, height: number) {
      material.setFloat('power2d_canvasWidth', width);
      material.setFloat('power2d_canvasHeight', height);
    },

    dispose() {
      material.dispose(true, false);
      delete BABYLON.ShaderStore.ShadersStoreWGSL[vertexShaderName];
      delete BABYLON.ShaderStore.ShadersStoreWGSL[fragmentShaderName];
    },
  };
}

// Material definition object for StyledShape
export const GradientMaterial: GradientMaterialDef = {
  uniformType: undefined as unknown as GradientUniforms, // Type-only
  textureNames: GradientTextureNames,
  vertexSource: GradientVertexSource,
  fragmentSource: GradientFragmentSource,
  uniformMeta: GradientUniformMeta,
  uniformDefaults: GradientUniformDefaults,
  createMaterial: createGradientMaterial,
};

// Default export for convenience
export default GradientMaterial;
```

### Generated Stroke Material Module

Similar structure but with stroke-specific attributes and the `thickness` uniform injected automatically.

---

## Runtime Classes

### StyledShape

```typescript
// StyledShape.ts

import * as BABYLON from 'babylonjs';
import Tess2 from 'tess2';
import { generateStrokeMesh, StrokeMeshData } from './strokeMeshGenerator';

interface MaterialDef<U, T extends string> {
  createMaterial: (scene: BABYLON.Scene, name: string) => MaterialInstance<U, T>;
  uniformDefaults: U;
  textureNames: readonly T[];
}

interface MaterialInstance<U, T extends string> {
  material: BABYLON.ShaderMaterial;
  setUniforms(uniforms: Partial<U>): void;
  setTexture(name: T, texture: BABYLON.BaseTexture): void;
  setCanvasSize(width: number, height: number): void;
  dispose(): void;
}

interface StrokeMaterialDef<U, T extends string> extends MaterialDef<U, T> {
  // Stroke materials have additional thickness handling
}

type TextureSource =
  | BABYLON.BaseTexture
  | BABYLON.RenderTargetTexture
  | HTMLCanvasElement
  | OffscreenCanvas
  | { output: BABYLON.RenderTargetTexture }; // ShaderEffect-like

interface StyledShapeOptions<
  BodyU,
  BodyT extends string,
  StrokeU = never,
  StrokeT extends string = never
> {
  scene: BABYLON.Scene;
  points: readonly [number, number][];
  bodyMaterial: MaterialDef<BodyU, BodyT>;
  strokeMaterial?: MaterialDef<StrokeU, StrokeT>;
  strokeThickness?: number;
  closed?: boolean; // Default: true
  canvasWidth: number;
  canvasHeight: number;
}

export class StyledShape<
  BodyU extends object,
  BodyT extends string,
  StrokeU extends object = never,
  StrokeT extends string = never
> {
  private readonly scene: BABYLON.Scene;
  private readonly bodyMesh: BABYLON.Mesh;
  private readonly bodyMaterialInstance: MaterialInstance<BodyU, BodyT>;
  private strokeMesh: BABYLON.Mesh | null = null;
  private strokeMaterialInstance: MaterialInstance<StrokeU, StrokeT> | null = null;
  private readonly parentNode: BABYLON.TransformNode;

  private points: readonly [number, number][];
  private closed: boolean;
  private canvasWidth: number;
  private canvasHeight: number;
  private _strokeThickness: number;
  private _alphaIndex: number = 0;

  // Texture management (like CustomShaderEffect)
  private readonly bodyCanvasTextures: Map<string, CanvasTextureEntry> = new Map();
  private readonly strokeCanvasTextures: Map<string, CanvasTextureEntry> = new Map();

  constructor(options: StyledShapeOptions<BodyU, BodyT, StrokeU, StrokeT>) {
    this.scene = options.scene;
    this.points = options.points;
    this.closed = options.closed ?? true;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;
    this._strokeThickness = options.strokeThickness ?? 1;

    // Create parent node for body + stroke
    this.parentNode = new BABYLON.TransformNode('styledShape', this.scene);

    // Create body material
    this.bodyMaterialInstance = options.bodyMaterial.createMaterial(
      this.scene,
      'styledShapeBodyMaterial'
    );
    this.bodyMaterialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);

    // Create body mesh
    this.bodyMesh = this.createBodyMesh();
    this.bodyMesh.parent = this.parentNode;
    this.bodyMesh.material = this.bodyMaterialInstance.material;

    // Create stroke if material provided
    if (options.strokeMaterial) {
      this.strokeMaterialInstance = options.strokeMaterial.createMaterial(
        this.scene,
        'styledShapeStrokeMaterial'
      ) as unknown as MaterialInstance<StrokeU, StrokeT>;
      this.strokeMaterialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);

      this.strokeMesh = this.createStrokeMesh();
      this.strokeMesh.parent = this.parentNode;
      this.strokeMesh.material = this.strokeMaterialInstance.material;
    }
  }

  //===========================================================================
  // Body API
  //===========================================================================

  get body() {
    const self = this;
    return {
      setUniforms(uniforms: Partial<BodyU>): void {
        self.bodyMaterialInstance.setUniforms(uniforms);
      },

      setTexture(name: BodyT, source: TextureSource): void {
        const texture = self.resolveTexture(source, name, self.bodyCanvasTextures);
        self.bodyMaterialInstance.setTexture(name, texture);
      },

      get mesh(): BABYLON.Mesh {
        return self.bodyMesh;
      },
    };
  }

  //===========================================================================
  // Stroke API
  //===========================================================================

  get stroke(): StrokeAPI<StrokeU, StrokeT> | null {
    if (!this.strokeMaterialInstance || !this.strokeMesh) {
      return null;
    }

    const self = this;
    return {
      setUniforms(uniforms: Partial<StrokeU>): void {
        self.strokeMaterialInstance!.setUniforms(uniforms);
      },

      setTexture(name: StrokeT, source: TextureSource): void {
        const texture = self.resolveTexture(source, name, self.strokeCanvasTextures);
        self.strokeMaterialInstance!.setTexture(name, texture);
      },

      get thickness(): number {
        return self._strokeThickness;
      },

      set thickness(value: number) {
        if (value !== self._strokeThickness) {
          self._strokeThickness = value;
          self.rebuildStrokeMesh();
        }
      },

      get mesh(): BABYLON.Mesh {
        return self.strokeMesh!;
      },
    };
  }

  //===========================================================================
  // Transform API
  //===========================================================================

  get position(): BABYLON.Vector3 {
    return this.parentNode.position;
  }

  set position(value: BABYLON.Vector3) {
    this.parentNode.position = value;
  }

  get rotation(): BABYLON.Vector3 {
    return this.parentNode.rotation;
  }

  set rotation(value: BABYLON.Vector3) {
    this.parentNode.rotation = value;
  }

  get scaling(): BABYLON.Vector3 {
    return this.parentNode.scaling;
  }

  set scaling(value: BABYLON.Vector3) {
    this.parentNode.scaling = value;
  }

  get alphaIndex(): number {
    return this._alphaIndex;
  }

  set alphaIndex(value: number) {
    this._alphaIndex = value;
    this.bodyMesh.alphaIndex = value;
    if (this.strokeMesh) {
      this.strokeMesh.alphaIndex = value;
    }
  }

  //===========================================================================
  // Point Updates
  //===========================================================================

  setPoints(points: readonly [number, number][], closed?: boolean): void {
    this.points = points;
    if (closed !== undefined) {
      this.closed = closed;
    }

    // Rebuild body mesh
    this.bodyMesh.dispose(false, false);
    const newBodyMesh = this.createBodyMesh();
    newBodyMesh.parent = this.parentNode;
    newBodyMesh.material = this.bodyMaterialInstance.material;
    newBodyMesh.alphaIndex = this._alphaIndex;
    (this as any).bodyMesh = newBodyMesh;

    // Rebuild stroke mesh if exists
    if (this.strokeMesh) {
      this.rebuildStrokeMesh();
    }
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.bodyMaterialInstance.setCanvasSize(width, height);
    if (this.strokeMaterialInstance) {
      this.strokeMaterialInstance.setCanvasSize(width, height);
    }
  }

  //===========================================================================
  // Mesh Creation (Private)
  //===========================================================================

  private createBodyMesh(): BABYLON.Mesh {
    // Flatten points for tess2
    const contour: number[] = [];
    for (const [x, y] of this.points) {
      contour.push(x, y);
    }

    // Triangulate with tess2
    const result = Tess2.tesselate({
      contours: [contour],
      windingRule: Tess2.WINDING_ODD,
      elementType: Tess2.POLYGONS,
      polySize: 3,
      vertexSize: 2,
    });

    // Create Babylon mesh from triangulation
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Compute bounding box for UV generation
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < result.vertices.length; i += 2) {
      minX = Math.min(minX, result.vertices[i]);
      maxX = Math.max(maxX, result.vertices[i]);
      minY = Math.min(minY, result.vertices[i + 1]);
      maxY = Math.max(maxY, result.vertices[i + 1]);
    }
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    // Build vertex data
    for (let i = 0; i < result.vertices.length; i += 2) {
      const x = result.vertices[i];
      const y = result.vertices[i + 1];
      positions.push(x, y, 0);
      uvs.push((x - minX) / width, (y - minY) / height);
    }

    // Copy indices
    for (const idx of result.elements) {
      indices.push(idx);
    }

    // Create mesh
    const mesh = new BABYLON.Mesh('styledShapeBody', this.scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.uvs = uvs;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);

    return mesh;
  }

  private createStrokeMesh(): BABYLON.Mesh {
    const strokeData = generateStrokeMesh(
      this.points,
      this._strokeThickness,
      this.closed
    );

    const mesh = new BABYLON.Mesh('styledShapeStroke', this.scene);
    const vertexData = new BABYLON.VertexData();

    vertexData.positions = Array.from(strokeData.positions);
    vertexData.uvs = Array.from(strokeData.uvs);
    vertexData.indices = Array.from(strokeData.indices);
    vertexData.applyToMesh(mesh);

    // Add custom attributes
    mesh.setVerticesData('strokeNormal', Array.from(strokeData.normals), false, 2);
    mesh.setVerticesData('strokeSide', Array.from(strokeData.sides), false, 1);
    mesh.setVerticesData('strokeArcLength', Array.from(strokeData.arcLengths), false, 1);
    mesh.setVerticesData('strokeNormalizedArc', Array.from(strokeData.normalizedArcs), false, 1);
    mesh.setVerticesData('strokeMiterFactor', Array.from(strokeData.miterFactors), false, 1);

    return mesh;
  }

  private rebuildStrokeMesh(): void {
    if (!this.strokeMesh || !this.strokeMaterialInstance) return;

    this.strokeMesh.dispose(false, false);
    this.strokeMesh = this.createStrokeMesh();
    this.strokeMesh.parent = this.parentNode;
    this.strokeMesh.material = this.strokeMaterialInstance.material;
    this.strokeMesh.alphaIndex = this._alphaIndex;
  }

  //===========================================================================
  // Texture Resolution (like CustomShaderEffect)
  //===========================================================================

  private resolveTexture(
    source: TextureSource,
    key: string,
    cache: Map<string, CanvasTextureEntry>
  ): BABYLON.BaseTexture {
    // Handle ShaderEffect-like objects
    if ('output' in source && source.output instanceof BABYLON.RenderTargetTexture) {
      return source.output;
    }

    // Handle Babylon textures directly
    if (source instanceof BABYLON.BaseTexture) {
      return source;
    }

    // Handle canvas sources
    const canvas = source as HTMLCanvasElement | OffscreenCanvas;
    const width = canvas.width;
    const height = canvas.height;
    const engine = this.scene.getEngine() as BABYLON.WebGPUEngine;

    let entry = cache.get(key);
    if (!entry || entry.width !== width || entry.height !== height) {
      if (entry) {
        entry.internal.dispose();
      }

      const internal = engine.createDynamicTexture(
        width, height, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE
      );
      internal.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      internal.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

      const wrapper = new BABYLON.BaseTexture(this.scene, internal);
      wrapper.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      wrapper.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

      entry = { texture: wrapper, internal, width, height };
      cache.set(key, entry);
    }

    engine.updateDynamicTexture(
      entry.internal,
      canvas as HTMLCanvasElement,
      false, false,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE
    );

    return entry.texture;
  }

  //===========================================================================
  // Disposal
  //===========================================================================

  dispose(): void {
    this.bodyMesh.dispose(false, false);
    this.bodyMaterialInstance.dispose();

    if (this.strokeMesh) {
      this.strokeMesh.dispose(false, false);
    }
    if (this.strokeMaterialInstance) {
      this.strokeMaterialInstance.dispose();
    }

    this.parentNode.dispose();

    // Dispose canvas textures
    for (const entry of this.bodyCanvasTextures.values()) {
      entry.internal.dispose();
      entry.texture.dispose();
    }
    for (const entry of this.strokeCanvasTextures.values()) {
      entry.internal.dispose();
      entry.texture.dispose();
    }
  }
}

interface CanvasTextureEntry {
  texture: BABYLON.BaseTexture;
  internal: BABYLON.InternalTexture;
  width: number;
  height: number;
}

interface StrokeAPI<U, T extends string> {
  setUniforms(uniforms: Partial<U>): void;
  setTexture(name: T, source: TextureSource): void;
  thickness: number;
  mesh: BABYLON.Mesh;
}
```

### BatchedStyledShape

```typescript
// BatchedStyledShape.ts

import * as BABYLON from 'babylonjs';

interface BatchMaterialDef<U, T extends string, I> {
  createMaterial: (scene: BABYLON.Scene, name: string) => BatchMaterialInstance<U, T>;
  uniformDefaults: U;
  textureNames: readonly T[];
  instanceAttrLayout: InstanceAttrLayout<I>;
}

interface InstanceAttrLayout<I> {
  size: number; // Total floats per instance
  members: Array<{
    name: keyof I;
    offset: number;
    floatCount: number;
  }>;
}

interface BatchMaterialInstance<U, T extends string> {
  material: BABYLON.ShaderMaterial;
  setUniforms(uniforms: Partial<U>): void;
  setTexture(name: T, texture: BABYLON.BaseTexture): void;
  setCanvasSize(width: number, height: number): void;
  dispose(): void;
}

interface BatchedStyledShapeOptions<
  U extends object,
  T extends string,
  I extends object
> {
  scene: BABYLON.Scene;
  points: readonly [number, number][];
  material: BatchMaterialDef<U, T, I>;
  instanceCount: number;
  canvasWidth: number;
  canvasHeight: number;
  closed?: boolean;
}

export class BatchedStyledShape<
  U extends object,
  T extends string,
  I extends object
> {
  private readonly scene: BABYLON.Scene;
  private readonly mesh: BABYLON.Mesh;
  private readonly materialInstance: BatchMaterialInstance<U, T>;
  private readonly instanceCount: number;
  private readonly instanceLayout: InstanceAttrLayout<I>;

  // Instance attribute buffers
  private readonly instanceData: Float32Array;
  private readonly instanceBuffer: BABYLON.StorageBuffer;
  private useExternalBuffers: boolean = false;

  private canvasWidth: number;
  private canvasHeight: number;

  constructor(options: BatchedStyledShapeOptions<U, T, I>) {
    this.scene = options.scene;
    this.instanceCount = options.instanceCount;
    this.instanceLayout = options.material.instanceAttrLayout;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;

    const engine = this.scene.getEngine() as BABYLON.WebGPUEngine;

    // Create material
    this.materialInstance = options.material.createMaterial(this.scene, 'batchedMaterial');
    this.materialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);

    // Create mesh (same as StyledShape body)
    this.mesh = this.createMesh(options.points, options.closed ?? true);
    this.mesh.material = this.materialInstance.material;

    // Create instance attribute buffer
    const floatsPerInstance = this.instanceLayout.size;
    const totalFloats = floatsPerInstance * this.instanceCount;
    this.instanceData = new Float32Array(totalFloats);

    this.instanceBuffer = new BABYLON.StorageBuffer(
      engine,
      totalFloats * 4,
      BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
      BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE
    );

    // Set up thin instancing
    this.mesh.thinInstanceCount = this.instanceCount;
    this.mesh.forcedInstanceCount = this.instanceCount;
    this.mesh.manualUpdateOfWorldMatrixInstancedBuffer = true;

    // Bind instance attributes as vertex buffers
    this.setupInstanceVertexBuffers();
  }

  //===========================================================================
  // Uniform API
  //===========================================================================

  setUniforms(uniforms: Partial<U>): void {
    this.materialInstance.setUniforms(uniforms);
  }

  setTexture(name: T, source: TextureSource): void {
    // Similar texture resolution as StyledShape
    this.materialInstance.setTexture(name, source as BABYLON.BaseTexture);
  }

  //===========================================================================
  // Instance Attribute API
  //===========================================================================

  writeInstanceAttr(index: number, values: Partial<I>): void {
    if (this.useExternalBuffers) {
      console.warn('Cannot write instance attrs when using external buffers');
      return;
    }

    const floatsPerInstance = this.instanceLayout.size;
    const baseOffset = index * floatsPerInstance;

    for (const member of this.instanceLayout.members) {
      const value = values[member.name];
      if (value !== undefined) {
        const memberOffset = baseOffset + member.offset;
        if (typeof value === 'number') {
          this.instanceData[memberOffset] = value;
        } else if (Array.isArray(value)) {
          for (let i = 0; i < member.floatCount && i < value.length; i++) {
            this.instanceData[memberOffset + i] = value[i];
          }
        }
      }
    }
  }

  /**
   * Called automatically before render, uploads instance data to GPU
   */
  updateInstanceBuffer(): void {
    if (!this.useExternalBuffers) {
      this.instanceBuffer.update(this.instanceData);
    }
  }

  //===========================================================================
  // External Buffer Control
  //===========================================================================

  setInstancingBuffer(buffer: BABYLON.StorageBuffer | null): void {
    this.externalInstanceBuffer = buffer;
    this.useExternalBuffers = buffer !== null;
    this.rebuildInstanceVertexBuffers();
  }

  getInstanceBuffer(): BABYLON.StorageBuffer {
    return this.instanceBuffer;
  }

  //===========================================================================
  // Lifecycle
  //===========================================================================

  /**
   * Call this in your render loop before scene.render()
   */
  beforeRender(): void {
    this.updateInstanceBuffer();
  }

  dispose(): void {
    this.mesh.dispose(false, false);
    this.materialInstance.dispose();
    this.instanceBuffer.dispose();
  }

  //===========================================================================
  // Private
  //===========================================================================

  private createMesh(
    points: readonly [number, number][],
    closed: boolean
  ): BABYLON.Mesh {
    // Same triangulation as StyledShape
    // ... (implementation same as StyledShape.createBodyMesh)
    return new BABYLON.Mesh('batched', this.scene);
  }

  private setupInstanceVertexBuffers(): void {
    const engine = this.scene.getEngine() as BABYLON.WebGPUEngine;
    const floatsPerInstance = this.instanceLayout.size;

    for (const member of this.instanceLayout.members) {
      const vb = new BABYLON.VertexBuffer(
        engine,
        this.instanceBuffer.getBuffer(),
        `inst_${String(member.name)}`,
        false,
        false,
        floatsPerInstance,
        true, // instanced
        member.offset,
        member.floatCount
      );
      this.mesh.setVerticesBuffer(vb);
    }
  }
}
```

---

## Point Generators

```typescript
// pointGenerators.ts

export type Point2D = readonly [number, number];

export interface RectOptions {
  x: number;      // Left edge in pixels
  y: number;      // Top edge in pixels
  width: number;  // Width in pixels
  height: number; // Height in pixels
}

export interface CircleOptions {
  cx: number;     // Center X in pixels
  cy: number;     // Center Y in pixels
  radius: number; // Radius in pixels
  segments?: number; // Default: 32
}

export interface EllipseOptions {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
  segments?: number;
}

export interface RegularPolygonOptions {
  cx: number;
  cy: number;
  radius: number;
  sides: number;
  rotation?: number; // Radians, default: 0
}

export function RectPts(opts: RectOptions): Point2D[] {
  const { x, y, width, height } = opts;
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

export function CirclePts(opts: CircleOptions): Point2D[] {
  const { cx, cy, radius, segments = 32 } = opts;
  const points: Point2D[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
    ]);
  }
  return points;
}

export function EllipsePts(opts: EllipseOptions): Point2D[] {
  const { cx, cy, radiusX, radiusY, segments = 32 } = opts;
  const points: Point2D[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([
      cx + Math.cos(angle) * radiusX,
      cy + Math.sin(angle) * radiusY,
    ]);
  }
  return points;
}

export function RegularPolygonPts(opts: RegularPolygonOptions): Point2D[] {
  const { cx, cy, radius, sides, rotation = 0 } = opts;
  const points: Point2D[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    points.push([
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
    ]);
  }
  return points;
}

// For arbitrary user points
export function PolygonPts(points: Array<{ x: number; y: number }>): Point2D[] {
  return points.map(p => [p.x, p.y]);
}
```

---

## Scene Setup Helpers

```typescript
// sceneHelpers.ts

import * as BABYLON from 'babylonjs';

export interface Power2DSceneOptions {
  engine: BABYLON.WebGPUEngine;
  canvasWidth: number;
  canvasHeight: number;
  clearColor?: BABYLON.Color4;
}

export interface Power2DScene {
  scene: BABYLON.Scene;
  camera: BABYLON.FreeCamera;
  canvasWidth: number;
  canvasHeight: number;
  resize(width: number, height: number): void;
}

export function createPower2DScene(options: Power2DSceneOptions): Power2DScene {
  const { engine, canvasWidth, canvasHeight, clearColor } = options;

  const scene = new BABYLON.Scene(engine);
  scene.autoClear = true;
  scene.clearColor = clearColor ?? new BABYLON.Color4(0, 0, 0, 1);

  // Disable depth for 2D rendering
  scene.autoClearDepthAndStencil = true;

  // Create orthographic camera
  // Camera looks down -Z axis at Z=0 plane
  const camera = new BABYLON.FreeCamera(
    'power2dCamera',
    new BABYLON.Vector3(0, 0, -1),
    scene
  );
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0;
  camera.maxZ = 10;

  // Set orthographic bounds based on canvas size
  // This creates a coordinate system where:
  // - (0, 0) is top-left
  // - (canvasWidth, canvasHeight) is bottom-right
  // But note: the actual conversion happens in the shader
  // The camera just needs to see NDC space (-1 to 1)
  camera.orthoLeft = -1;
  camera.orthoRight = 1;
  camera.orthoTop = 1;
  camera.orthoBottom = -1;

  scene.activeCamera = camera;

  const resize = (width: number, height: number) => {
    // Camera doesn't need to change (shader handles pixel→NDC conversion)
    // But we might want to track the size
  };

  return {
    scene,
    camera,
    canvasWidth,
    canvasHeight,
    resize,
  };
}
```

---

## Vite Plugin

```typescript
// viteMaterialPlugin.ts

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { PluginOption } from 'vite';
import { generateMaterialTypes } from './generateMaterialTypes';

interface MaterialPluginOptions {
  srcDir?: string;
  quiet?: boolean;
}

async function findMaterialFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
        continue;
      }
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile() && absolute.endsWith('.material.wgsl')) {
        results.push(absolute);
      }
    }
  }
  await walk(root);
  return results;
}

export function wgslMaterialPlugin(options: MaterialPluginOptions = {}): PluginOption {
  const projectRoot = process.cwd();
  const srcDir = options.srcDir
    ? path.resolve(projectRoot, options.srcDir)
    : path.resolve(projectRoot, 'src');
  const quiet = options.quiet ?? false;

  async function processFile(filePath: string): Promise<void> {
    try {
      await generateMaterialTypes(filePath, {
        projectRoot,
        logger: quiet ? undefined : (msg) => console.log(`[wgsl-material] ${msg}`),
      });
    } catch (error) {
      console.error('[wgsl-material] Failed:', path.relative(projectRoot, filePath));
      console.error(error);
    }
  }

  async function removeArtifacts(filePath: string): Promise<void> {
    const baseName = path.basename(filePath);
    const dir = path.dirname(filePath);
    const generatedPath = path.join(dir, `${baseName}.generated.ts`);
    await fs.unlink(generatedPath).catch(() => {});
  }

  return {
    name: 'wgsl-material-plugin',
    enforce: 'pre',
    async buildStart() {
      const files = await findMaterialFiles(srcDir);
      await Promise.all(files.map(processFile));
    },
    configureServer(server) {
      const watcher = server.watcher;

      watcher.on('add', (filePath) => {
        if (!filePath.endsWith('.material.wgsl')) return;
        processFile(filePath).then(() => {
          const generatedPath = `${filePath}.generated.ts`;
          server.ws.send({
            type: 'full-reload',
            path: `/${path.relative(projectRoot, generatedPath)}`
          });
        });
      });

      watcher.on('change', (filePath) => {
        if (!filePath.endsWith('.material.wgsl')) return;
        processFile(filePath).then(() => {
          const generatedPath = `${filePath}.generated.ts`;
          server.ws.send({
            type: 'full-reload',
            path: `/${path.relative(projectRoot, generatedPath)}`
          });
        });
      });

      watcher.on('unlink', (filePath) => {
        if (!filePath.endsWith('.material.wgsl')) return;
        removeArtifacts(filePath);
      });
    },
  };
}

// Similar plugin for .strokeMaterial.wgsl files
export function wgslStrokeMaterialPlugin(options: MaterialPluginOptions = {}): PluginOption {
  // Same structure, different file suffix and generator
  // ...
}
```

---

## Implementation Order

### Phase 1: Core Infrastructure
1. **types.ts** - Shared type definitions
2. **pointGenerators.ts** - RectPts, CirclePts, EllipsePts, PolygonPts
3. **sceneHelpers.ts** - createPower2DScene

### Phase 2: Body Material System
4. **generateMaterialTypes.ts** - WGSL parser and TypeScript generator for `.material.wgsl`
5. **viteMaterialPlugin.ts** - Vite integration
6. **StyledShape.ts** - Basic version (body only, no stroke)

### Phase 3: Stroke System
7. **strokeMeshGenerator.ts** - Path to stroke mesh conversion
8. **generateStrokeMaterialTypes.ts** - Generator for `.strokeMaterial.wgsl`
9. **viteStrokeMaterialPlugin.ts** - Vite integration
10. **StyledShape.ts** - Add stroke support

### Phase 4: Instancing
11. **BatchedStyledShape.ts** - Instanced rendering with typed instance attributes
12. **Update generators** - Add instance attribute parsing for batched materials

### Phase 5: Polish
13. **Error handling** - Descriptive errors for WGSL parsing issues
14. **Default materials** - Simple solid color material for quick prototyping
15. **Documentation** - Usage examples and API docs

---

## Usage Example

```typescript
// sketch.ts
import * as BABYLON from 'babylonjs';
import { createPower2DScene, StyledShape, RectPts, CirclePts } from '@/rendering/power2d';
import { GradientMaterial } from './gradient.material.wgsl.generated';
import { DashedStrokeMaterial } from './dashed.strokeMaterial.wgsl.generated';

async function main() {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  const engine = new BABYLON.WebGPUEngine(canvas);
  await engine.initAsync();

  const { scene, canvasWidth, canvasHeight } = createPower2DScene({
    engine,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });

  // Create a gradient-filled rectangle with dashed stroke
  const rect = new StyledShape({
    scene,
    points: RectPts({ x: 100, y: 100, width: 200, height: 150 }),
    bodyMaterial: GradientMaterial,
    strokeMaterial: DashedStrokeMaterial,
    strokeThickness: 3,
    canvasWidth,
    canvasHeight,
  });

  // Create a circle with just body (no stroke)
  const circle = new StyledShape({
    scene,
    points: CirclePts({ cx: 400, cy: 200, radius: 50 }),
    bodyMaterial: GradientMaterial,
    canvasWidth,
    canvasHeight,
  });

  // Set up z-ordering
  rect.alphaIndex = 1;
  circle.alphaIndex = 2; // Circle renders on top

  // Animation loop
  engine.runRenderLoop(() => {
    const time = performance.now() / 1000;

    // Update uniforms
    rect.body.setUniforms({ time, gradientAngle: time * 0.5 });
    circle.body.setUniforms({ time });

    // Update stroke
    if (rect.stroke) {
      rect.stroke.setUniforms({ time });
    }

    scene.render();
  });
}

main();
```

### BatchedStyledShape Usage (CPU-driven instance attributes)

```typescript
// particles.batchMaterial.wgsl
struct ParticleUniforms {
  time: f32,
  globalColor: vec3f,
};

// Instance attributes - per-particle data
struct ParticleInstanceAttrs {
  position: vec2f,    // Particle position in pixels
  scale: f32,         // Size multiplier
  rotation: f32,      // Rotation in radians
  color: vec4f,       // Per-particle color tint
};

fn vertShader(
  localPos: vec2f,
  uv: vec2f,
  uniforms: ParticleUniforms,
  inst: ParticleInstanceAttrs,
) -> vec2f {
  // Rotate local position
  let c = cos(inst.rotation);
  let s = sin(inst.rotation);
  let rotated = vec2f(
    localPos.x * c - localPos.y * s,
    localPos.x * s + localPos.y * c
  );
  // Scale and translate
  return inst.position + rotated * inst.scale;
}

fn fragShader(
  uv: vec2f,
  uniforms: ParticleUniforms,
  inst: ParticleInstanceAttrs,
) -> vec4f {
  let tint = vec3f(uniforms.globalColor * inst.color.rgb);
  return vec4f(tint, inst.color.a);
}
```

```typescript
// particleSystem.ts
import { createPower2DScene, BatchedStyledShape, CirclePts } from '@/rendering/power2d';
import { ParticleMaterial } from './particles.batchMaterial.wgsl.generated';

async function main() {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  const engine = new BABYLON.WebGPUEngine(canvas);
  await engine.initAsync();

  const { scene, canvasWidth, canvasHeight } = createPower2DScene({
    engine,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });

  const PARTICLE_COUNT = 1000;

  // Create batched particle system using a small circle as base shape
  const particles = new BatchedStyledShape({
    scene,
    points: CirclePts({ cx: 0, cy: 0, radius: 5, segments: 8 }),
    material: ParticleMaterial,
    instanceCount: PARTICLE_COUNT,
    canvasWidth,
    canvasHeight,
  });

  // Initialize particle positions randomly
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.writeInstanceAttr(i, {
      position: [Math.random() * canvasWidth, Math.random() * canvasHeight],
      scale: 0.5 + Math.random() * 1.5,
      rotation: Math.random() * Math.PI * 2,
      color: [Math.random(), Math.random(), Math.random(), 1.0],
    });
  }

  // Animation loop
  engine.runRenderLoop(() => {
    const time = performance.now() / 1000;

    // Update shared uniforms
    particles.setUniforms({
      time,
      globalColor: [1, 1, 1],
    });

    // Update individual particle positions (CPU-driven)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const baseX = (i % 50) * 20 + 50;
      const baseY = Math.floor(i / 50) * 20 + 50;
      particles.writeInstanceAttr(i, {
        position: [
          baseX + Math.sin(time + i * 0.1) * 10,
          baseY + Math.cos(time + i * 0.15) * 10,
        ],
        rotation: time + i * 0.01,
      });
    }

    // Upload instance data to GPU (called automatically if using beforeRender)
    particles.beforeRender();

    scene.render();
  });
}

main();
```

### BatchedStyledShape with Compute Shader (GPU-driven instance attributes)

```typescript
// When instance data is driven by a compute shader, use external buffer mode
// This avoids the CPU→GPU upload each frame

import { createPower2DScene, BatchedStyledShape, CirclePts } from '@/rendering/power2d';
import { ParticleMaterial } from './particles.batchMaterial.wgsl.generated';
import * as ParticleCompute from './particlePhysics.compute.wgsl.generated';

async function main() {
  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  const engine = new BABYLON.WebGPUEngine(canvas);
  await engine.initAsync();

  const { scene, canvasWidth, canvasHeight } = createPower2DScene({
    engine,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });

  const PARTICLE_COUNT = 10000;

  // Create batched particle system
  const particles = new BatchedStyledShape({
    scene,
    points: CirclePts({ cx: 0, cy: 0, radius: 3, segments: 6 }),
    material: ParticleMaterial,
    instanceCount: PARTICLE_COUNT,
    canvasWidth,
    canvasHeight,
  });

  // Create the instance buffer for compute -> render sharing
  const instanceBufferState = ParticleCompute.createStorageBuffer_particles(engine, PARTICLE_COUNT, {
    usage: BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
      BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
  });

  // Bind the compute-owned buffer to the batched shape
  particles.setInstancingBuffer(instanceBufferState.buffer);

  // Create compute shader for particle physics
  const computeUniforms = ParticleCompute.createUniformBuffer(engine);
  const computeShader = ParticleCompute.createShader(engine, {
    uniforms: computeUniforms,
    particles: instanceBufferState.buffer, // Bind the same buffer!
  });

  // Animation loop
  engine.runRenderLoop(() => {
    const time = performance.now() / 1000;

    // Update compute shader uniforms
    ParticleCompute.updateUniformBuffer(computeUniforms, {
      time,
      deltaTime: engine.getDeltaTime() / 1000,
      canvasWidth,
      canvasHeight,
    });

    // Dispatch compute shader - writes directly to instance buffer
    computeShader.shader.dispatch(Math.ceil(PARTICLE_COUNT / 64), 1, 1);

    // Update rendering uniforms
    particles.setUniforms({
      time,
      globalColor: [1, 1, 1],
    });

    // No beforeRender() needed - buffer is already on GPU from compute shader

    scene.render();
  });
}

main();
```

---

## Open Questions / Future Work

1. **Spline support**: Add `SplinePts(controlPoints, tension, segments)` that generates smooth curves
2. **Self-intersecting polygons**: Switch from tess2 triangulation - already planned
3. **Round/bevel joins**: Configurable join style in stroke mesh generator
4. **Gradient strokes**: Support for stroke width variation along path
5. **Texture atlasing**: Combine multiple material textures for batch rendering
6. **Compute-driven instances**: Direct compute shader → instance buffer binding

---

## Addendum (Dec 29, 2025)

Clarifications from implementation kickoff:

### WGSL Format + Generator
- Single-pass only (standard vertex + fragment for mesh materials).
- Zero textures allowed; if no textures are declared, emit no samplers.
- Uniform restrictions match `generateFragmentShader.ts` (no arrays, no nested structs).
- Ignore uniform comment annotations (no default/min/max/step parsing).

### Uniforms + Injection
- Per-field uniforms (individual uniforms, not UBOs).
- `power2d_canvasWidth` / `power2d_canvasHeight` are set every frame.
- User is responsible for render target sizing/aspect; rendering should stretch to fill the target.

### Textures
- Any texture name allowed.
- Samplers are optional per texture; if omitted, use a default sampler (linear + clamp-to-edge).
- Restrict to `texture_2d<f32>` + `sampler` for now.

### Coordinate System
- Pixel space with origin at top-left (Y down), standard 2D screen coordinates.

### Instancing / Buffers
- Use thin instances with custom buffers.
- Instance transform matrix layout matches existing patterns (world0..world3).

### Stroke Materials
- `.strokeMaterial.wgsl` mirrors `.material.wgsl` with stroke-specific inputs.
- Centerline derived from main shape on CPU; expansion/triangulation happens later.

### Texture Source Resolution
- Duplicate texture resolution logic locally for Power2D (no shared helper yet).

### Vite Plugins / Output
- Plugins should mimic existing behavior (overwrite artifacts on change).
- `StyledShape` / `BatchedStyledShape` are shared runtime classes.
- Generated output is a MaterialBuilder module used by those classes.
