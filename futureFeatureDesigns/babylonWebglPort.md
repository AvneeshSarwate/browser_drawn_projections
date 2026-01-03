# Babylon WebGL Port Plan (GLSL stack)

Goal: add a fully WebGL-compatible rendering path by creating **parallel `_GL` TypeScript infrastructure** (independent from the current WebGPU/WGSL stack). You will translate WGSL -> GLSL yourself; this plan focuses on the **TS + build infrastructure** needed to run those shaders in Babylon.js WebGL.

Assumptions
- WebGL2 target (GLSL ES 3.00). If WebGL1 support is needed, shader templates and capabilities must be downgraded.
- WGSL -> GLSL translation is manual and produces valid GLSL ES 3.00.
- PostFX pipeline continues to use `ShaderMaterial` + `RenderTargetTexture` with full-screen quad.
- Parallel `_GL` files live alongside existing WebGPU files; no mixed-mode file sharing unless noted.

Key design decisions to lock early
1) **Naming / file layout** for GLSL output and GL runtime files.
   - Example: `pixelate.fragFunc.glsl` -> `pixelate.frag.gl.generated.ts` (or `_GL.ts`).
   - Generator filenames: `generateFragmentShader_GL.ts`, `generateMaterialTypes_GL.ts`.
2) **Uniform reflection strategy** for GLSL:
   - Build-time AST parser (recommended for parity with WGSL generator), or
   - Runtime reflection via `gl.getActiveUniform` (less deterministic at build time).
3) **Sampler model** in WebGL:
   - WebGL uses texture sampling modes on the texture itself; sampler objects are not a first-class concept (unlike WebGPU). This affects `setTextureSampler` handling.

------------------------------------------------------------------------------

## Phase 0 — Inventory + targets

Deliverables
- A clear map of WebGPU-only files that need `_GL` equivalents.
- A list of new generated GLSL output files.

Tasks
- Scan for WebGPU-specific usages (`WebGPUEngine`, `ShadersStoreWGSL`, `ShaderLanguage.WGSL`, `StorageBuffer`).
- Decide which files remain WebGPU-only (compute pipelines) and which get `_GL` counterparts.

Likely candidates for `_GL`
- Runtime:
  - `src/rendering/shaderFXBabylon.ts` -> `src/rendering/shaderFXBabylon_GL.ts`
  - `src/rendering/power2d/types.ts` -> `src/rendering/power2d/types_GL.ts`
  - `src/rendering/power2d/StyledShape.ts` -> `src/rendering/power2d/StyledShape_GL.ts`
  - `src/rendering/power2d/BatchedStyledShape.ts` -> `src/rendering/power2d/BatchedStyledShape_GL.ts`
  - `src/rendering/power2d/sceneHelpers.ts` -> `src/rendering/power2d/sceneHelpers_GL.ts`
- Build-time generators:
  - `node_src/wgsl/generateFragmentShader.ts` -> `node_src/glsl/generateFragmentShader_GL.ts`
  - `node_src/wgsl/generateMaterialTypes.ts` -> `node_src/glsl/generateMaterialTypes_GL.ts`

------------------------------------------------------------------------------

## Phase 1 — GLSL PostFX generator (parallel to WGSL)

Goal
- Create a GLSL-based generator that produces `*.frag.gl.generated.ts` from `*.fragFunc.glsl`.

Implementation steps
1) **Create GLSL generator module**
   - New file: `node_src/glsl/generateFragmentShader_GL.ts`.
   - Port the WGSL generator structure but change:
     - Source extension: `.fragFunc.glsl`.
     - Output file suffix: `.frag.gl.generated.ts` (or `_GL.ts`).
     - Shader store: `BABYLON.ShaderStore.ShadersStore`.
     - Language: `BABYLON.ShaderLanguage.GLSL`.

2) **GLSL reflection**
   - Use a GLSL parser (e.g., `@shaderfrog/glsl-parser`) to extract:
     - Uniform struct definition (e.g., `struct PixelateUniforms { ... }`)
     - Types + field names.
   - Keep existing `UniformDescriptor` output shape for UI consistency.
   - Parse inline UI metadata in comments (same pattern as WGSL) if you want to keep the comment-based UI hints.

3) **GLSL template changes**
   - Vertex template should be GLSL ES 3.00:
     - `#version 300 es`
     - `in vec3 position; in vec2 uv; out vec2 vUV;`
   - Fragment template:
     - `#version 300 es`
     - `precision highp float;`
     - `in vec2 vUV; out vec4 outColor;`
   - Replace WGSL keywords with GLSL syntax:
     - `textureSample` -> `texture`
     - `textureDimensions` -> `textureSize`
     - `vec2f` -> `vec2`, `vec4f` -> `vec4`

4) **Material wrapper output**
   - Keep the same public TS API:
     - `createXMaterial`, `XEffect`, `setXUniforms`, `XUniformMeta`, etc.
   - Remove `samplerObjects` from ShaderMaterial options for WebGL.
   - In `setTextureSampler`, either:
     - No-op, or
     - Apply sampling mode to the `BABYLON.BaseTexture` itself (preferred):
       - `texture.updateSamplingMode(...)`
       - `texture.wrapU`, `texture.wrapV`.

------------------------------------------------------------------------------

## Phase 2 — GLSL ShaderFX runtime (postFX core)

Goal
- Add a WebGL runtime parallel to `shaderFXBabylon.ts`.

Implementation steps
1) **Create `shaderFXBabylon_GL.ts`**
   - Port `CustomShaderEffect` but change:
     - Engine type: `BABYLON.Engine` (or `ThinEngine`) instead of `WebGPUEngine`.
     - Shader registration: `ShadersStore` (GLSL) instead of `ShadersStoreWGSL`.
     - Language: `BABYLON.ShaderLanguage.GLSL`.

2) **Canvas texture helper**
   - Create `CanvasTexture_GL` in `sceneHelpers_GL.ts`:
     - Use `BABYLON.DynamicTexture` to wrap a canvas.
     - On update, call `dynamicTexture.update()`.
     - Configure sampling mode + wrap on the `DynamicTexture` itself.
   - Avoid WebGPU-specific `engine.updateDynamicTexture` / `InternalTexture` logic.

3) **Render target precision fallback**
   - WebGL does not guarantee half-float render target support.
   - In GLSL path, choose texture type based on caps:
     - `engine.getCaps().textureHalfFloatRender` -> `TEXTURETYPE_HALF_FLOAT`.
     - else if `textureFloatRender` -> `TEXTURETYPE_FLOAT`.
     - else fallback to `TEXTURETYPE_UNSIGNED_BYTE`.
   - Adjust `RenderPrecision` handling accordingly in `_GL` file.

4) **Sampler handling**
   - Replace `samplerObjects` and `setTextureSampler` with texture-side configuration.
   - Provide utility helper: `applySampler(texture, { wrapU, wrapV, samplingMode })`.

------------------------------------------------------------------------------

## Phase 3 — GLSL Power2D materials (generator)

Goal
- Build GLSL material generator with parallel output to WGSL’s `generateMaterialTypes.ts`.

Implementation steps
1) **New file: `node_src/glsl/generateMaterialTypes_GL.ts`**
   - Input: `.material.glsl` (or `.material.frag.glsl`) and `.material.vert.glsl` depending on your material layout.
   - Output: `*.material.gl.generated.ts` (or `_GL.ts`).

2) **GLSL uniform + attribute mapping**
   - Same `UniformDescriptor` schema as WGSL.
   - Same `InstanceAttrLayout` shape (for thin instancing usage).
   - Emit ShaderMaterial options for GLSL:
     - `attributes: ['position', 'uv', 'inst_x', ...]`
     - `uniforms: ['power2d_shapeTranslate', ...]`
     - `samplers: ['texName']`
     - `shaderLanguage: BABYLON.ShaderLanguage.GLSL`.

3) **Sampler handling in material handles**
   - If `setTextureSampler` is kept, implement it by mutating the texture’s sampling mode and wrap modes.
   - Otherwise drop sampler setters in the GL version to avoid confusion.

------------------------------------------------------------------------------

## Phase 4 — Power2D runtime port

Goal
- Provide `_GL` versions of the shape and helper APIs.

Implementation steps
1) **Types**
   - `types_GL.ts` mirrors `types.ts`, but:
     - Update texture source types if needed for WebGL.
     - Remove WebGPU-only constructs.

2) **StyledShape_GL.ts**
   - Mostly a shallow port:
     - Replace imports with `_GL` versions of material types.
     - Ensure `setTextureSampler` path matches WebGL behavior.

3) **BatchedStyledShape_GL.ts**
   - Replace `StorageBuffer` instancing with **thin instances**:
     - Allocate `Float32Array` buffers for instance attributes.
     - Call `mesh.thinInstanceSetBuffer('matrix', matrices, 16, true)`.
     - For per-instance custom attributes, use `thinInstanceSetBuffer('inst_attrName', data, size, true)` and declare attributes in GLSL.
   - Remove `StorageBuffer` + vertex buffer setup entirely.
   - Rebuild `writeInstanceAttr` to write into the thin-instance arrays.

4) **sceneHelpers_GL.ts**
   - `createPower2DScene` can remain identical except engine type.
   - Use WebGL canvas texture helper.

------------------------------------------------------------------------------

## Phase 5 — Glue and demo wiring

Goal
- Add GL versions of demos without touching existing WebGPU demos.

Implementation steps
1) **Sketch initializers**
   - New `_GL` versions of the relevant `SketchInitializer.vue` files:
     - Use `new BABYLON.Engine(canvas, true)`.
     - Avoid `WebGPUEngine` and `.initAsync()` calls.

2) **PostFX usage**
   - Point GL demos to the `*_GL` generated postFX classes.
   - Ensure their shaders are GLSL-translated variants of `fragFunc` sources.

3) **Build scripts**
   - Add npm script for GLSL generators, e.g. `generate:glsl`.
   - Ensure output paths don’t collide with WGSL generated files.

------------------------------------------------------------------------------

## Phase 6 — Validation + compatibility checks

Minimum checks
- Render a single postFX pass in WebGL (pixelate or blur) using `CustomShaderEffect_GL`.
- Render a `StyledShape_GL` with body + stroke.
- Render a `BatchedStyledShape_GL` with thin instances and custom attributes.
- Verify WebGL2 requirement is met on target device.

Performance checks
- Compare thin-instance update cost vs StorageBuffer in WebGPU.
- Evaluate required instance counts and update frequency for acceptable FPS.

Fallbacks / limitations to accept
- No compute shaders.
- No storage buffers.
- Potentially fewer texture formats / precision options.

------------------------------------------------------------------------------

## Suggested file naming convention

Build-time
- `node_src/glsl/generateFragmentShader_GL.ts`
- `node_src/glsl/generateMaterialTypes_GL.ts`

Runtime
- `src/rendering/shaderFXBabylon_GL.ts`
- `src/rendering/power2d/types_GL.ts`
- `src/rendering/power2d/StyledShape_GL.ts`
- `src/rendering/power2d/BatchedStyledShape_GL.ts`
- `src/rendering/power2d/sceneHelpers_GL.ts`

Generated outputs
- PostFX: `src/rendering/postFX/*.*.gl.generated.ts` (or `*_GL.ts`)
- Materials: `src/rendering/power2d/materials/*.material.gl.generated.ts`

------------------------------------------------------------------------------

## Implementation notes and pitfalls

- **Shader preprocessor**: keep `#define` blocks and includes consistent with Babylon’s `ShaderStore` behavior; avoid WGSL-specific macros.
- **Sampler semantics**: GLSL `sampler2D` is tied to texture; don’t model sampler objects unless you implement a mapping to texture sampling modes.
- **Uniform name flattening**: if you rely on struct reflection, be aware WebGL runtime reflection flattens names (`uStruct.field`, `uArray[0].field`). A build-time parser avoids these inconsistencies.
- **Precision**: include `precision highp float;` in fragment shaders to avoid default precision issues.
- **Half-float render targets**: gate on caps and provide fallback.

------------------------------------------------------------------------------

## Milestone breakdown

M1 — Generator scaffolding
- GLSL generator stub + output file naming + build script.
- Hard-coded template output to validate compilation.

M2 — ShaderFX runtime
- `shaderFXBabylon_GL.ts` + GLSL shader store usage.
- One postFX shader generated and running.

M3 — Power2D materials
- GLSL material generator + `StyledShape_GL` rendering.

M4 — Batched instancing
- Thin-instance port with per-instance attributes.

M5 — Demo parity
- GL demo versions for at least one postFX sketch + one power2d sketch.

