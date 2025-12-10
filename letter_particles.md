# Letter Particle FX – Detailed Implementation Plan

Goal: add a polygon FX that renders an instanced particle cloud (one circle per visible pixel) that warps/lerps between its source image layout and a procedural layout (e.g., ring), reusing buffers unless bbox dimensions change. Grounded in existing Babylon WebGPU + WGSL pipeline and the wgsl type-gen tooling.

## Key references (read)
- `src/sketches/text_projmap_sandbox/polygonFx.ts` — lifecycle for p5 render targets and Babylon overlay scene; only rebuild on bbox dimension changes after recent edits.
- `src/sketches/text_projmap_sandbox/babylon_base_guide.md` — compaction with atomics, buffer setup, instanced rendering notes.
- `src/rendering/gpuStrokes/strokeAnimation.compute.wgsl` (+ generated TS) — examples of StorageBuffer + uniform usage, workgroup sizing, instanced matrix writes; shows how generated helpers map to WGSL bindings.
- `node_src/wgsl/generateShaderTypes.ts` — generator expects WGSL resources with explicit group/binding; emits `createShader`, storage/uniform helpers, and bindings mapping.

## Data flow (target state)
1. p5 draws polygon text into `p5.Graphics` (already in pipeline).
2. Upload that canvas as a Babylon texture (per polygon, sized to bbox).
3. Compute pass A (**compaction**):
   - Inputs: texture_2d<f32> (p5 canvas), StorageBuffer `particles`, StorageBuffer `counter`, UniformBuffer `settings`.
   - For pixels with `alpha > alphaThreshold`: atomicAdd counter, write `{uv, color}` to compacted array.
   - Outputs: compacted `particles` buffer + `liveCount` in counter.
4. (Optional) Compute pass B (**targets**): generate procedural layout positions if not done in vertex shader; writes `targetPositions` buffer of same length.
5. Render pass: instanced disc/quad mesh using ShaderMaterial (WGSL). Vertex shader reads `particles` (and `targetPositions` or procedurally computes target) via `@builtin(instance_index)`; lerps between source and target using uniform `lerpT`; fragment outputs soft circle with particle color.
6. CPU only reads `liveCount` when needed to set `forcedInstanceCount` (or later replace with indirect draw).

## Concrete steps
### 1) API / state changes
- Extend `FxChainMeta` with a new effect type (e.g., `mode: 'letterParticles'`) and params: `alphaThreshold`, `circleRadius`, `lerpT`, `targetLayout` (enum: ring/spiral/noise/grid), `targetRadius`, `seed`, `softness`, maybe `maxParticlesScale` to clamp buffer size.
- Update defaults/presets + UI schema in `appState.ts` and any Livecode controls to expose lerpT/target layout. Ensure `getFxMeta` parses new fields.

### 2) File layout
- Create `src/rendering/postFX/letterParticles/` with:
  - `letterParticles.compute.wgsl` (compaction)
  - `letterTargets.compute.wgsl` (optional target generation; can be deferred)
  - `letterParticles.material.wgsl` (vertex/fragment for instanced discs; or split into vertex/fragment strings)
  - Generated outputs: `.generated.ts` alongside each WGSL (via existing Vite WGSL plugin).
  - A TS module `letterParticles.ts` that wires compute + material, modeled after gpuStrokes helper patterns.

### 3) WGSL details
- Compaction shader bindings (group 0):
  - `@binding(0) inputTex : texture_2d<f32>`
  - `@binding(1) particles : array<Particle>` in storage buffer (struct: `uvColor : vec4<f32>`, `color : vec4<f32>`; keep 32-byte stride for alignment/packing ease).
  - `@binding(2) counter : struct { value : atomic<u32>; }`
  - `@binding(3) settings : uniform { alphaThreshold: f32; maxParticles: u32; texSize: vec2<u32>; }`
- Workgroup size: start with (8,8,1); dispatch ceil(w/8), ceil(h/8).
- Guard writes with `idx < maxParticles`; early return on alpha <= threshold.
- Optional second compute: input `liveCount`, writes `targetPos` buffer (vec4 for alignment) for ring/spiral; or compute target in vertex shader using `instance_index`.

### 4) Type generation & glue
- Ensure WGSL files live under `src/` so Vite plugin runs; generator will emit `createShader`, `createStorageBuffer_*`, `createUniformBuffer_*`, etc., matching bindings mapping (see `generateShaderTypes.ts` rules).
- Use generated helpers to create buffers and set bindings instead of hand-writing `ComputeShader` setup.
- Mark particle/target StorageBuffers with `BUFFER_CREATIONFLAG_STORAGE | BUFFER_CREATIONFLAG_VERTEX` to allow direct use in vertex stage without copies.
- Counter buffer: 4 bytes storage buffer; helper will expose `updateStorageBuffer_counter` for zeroing (write `Uint32Array([0])`).

### 5) Renderer material
- New WGSL vertex shader:
  - Inputs: mesh quad/disc positions.
  - Storage buffer binding for `particles`; optional `targetPositions`.
  - Uniforms: `lerpT`, `bboxOrigin` (logical), `bboxSize`, `canvasSize`, `liveCount`, `targetRadius`, `seed`, maybe `time`.
  - Compute `srcPos` in NDC: `(uv * bboxSize + bboxOrigin) -> normalize by canvasSize -> map to [-1,1]`.
  - `dstPos`: ring or other layout; ring angle = `2π * instance_index / max(liveCount,1)`, radius uniform, centered at bbox center.
  - `pos = mix(srcPos, dstPos, lerpT)`; billboard the disc and pass color to fragment.
- Fragment shader: draws soft circle (distance from center); apply color and optional smoothstep softness.
- Babylon setup: create ShaderMaterial with WGSL strings registered in `ShaderStore.ShadersStoreWGSL[...]`; attributes `position`; uniforms listed above; bind storage buffers via `setStorageBuffer`.
- Geometry: single disc/quad mesh; set `forcedInstanceCount` each frame to `liveCount`.

### 6) Integration into `polygonFx.ts`
- Add a code path alongside existing postFX chain:
  - On first use or when bbox **dimensions** change, create/recreate: p5.Graphics, Babylon texture from graphics, particle/target buffers sized to `width*height*maxParticlesScale`, counter buffer, uniforms, material, and a plane/quad or disc mesh.
  - On metadata/position change (same dimensions): reuse buffers; redraw p5 graphics; update uniforms (lerpT, targetRadius, alphaThreshold, layout type, bbox origin/size); reset counter; dispatch compaction compute (and optional target compute); read `liveCount` (or keep previous if no readback path).
  - Update mesh position/scale in overlay scene to match bbox (similar to current quad logic), but leave material bound for instancing.
  - Dispose only on delete/disable or bbox dimension change.

### 7) CPU/GPU sync & perf
- Counter readback: do once per frame after dispatch; consider batching changes to avoid stalls. Future stretch: indirect draw buffer written by compute to remove readback.
- Clamp `maxParticles` to bbox size; if user sets radius/softness that inflates overdraw, consider `circleRadius` default small.
- Ensure storage buffer sizes use `w*h` worst case; recreate when dimensions change.

### 8) Testing / validation
- Dev harness: toggle FX to letterParticles, animate `lerpT` 0→1, vary alpha threshold; log `liveCount` and ensure instance count matches visible pixels.
- Visual check: clear alpha regions move circles offscreen (instance matrices set far away if `liveCount` smaller than buffer).
- Confirm WebGPU-only guard; fallback or disable on non-WebGPU to avoid runtime errors.

## Stretch items
- GPU-driven indirect draw args buffer written by compute to avoid CPU readback of `liveCount`.
- Additional target layouts (grid/spiral/noise flow field) selectable via enum; could reuse same compute to write `targetPositions`.
- Fragment soft edges with analytic disc SDF to reduce aliasing at small radii.

## Decision on liveCount usage (no CPU readback)
- Keep `forcedInstanceCount = maxParticles`; store `liveCount` or an `active` flag per instance in the particle buffer.
- In the vertex shader, early-out inactive instances by setting position to a large offscreen value (e.g., -1e6) or scale=0/alpha=0; Babylon will cull them post-VS, avoiding fragment work.
- Use small rects instead of circles to keep the fragment shader minimal; discs are optional.
