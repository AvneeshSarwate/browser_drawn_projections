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
4. Compute pass B (**targets**): generate procedural layout positions if not done in vertex shader; writes `targetPositions` buffer of same length.
5. Render pass: zero-copy thin instancing with built-in material (no custom ShaderMaterial). A compute pass writes world matrices (4×vec4 per instance) into a `StorageBuffer` flagged VERTEX|STORAGE; the mesh binds that buffer as `world0..world3` instanced attributes (see `babylon_instance_scene_example.ts`). A second storage buffer (VERTEX|STORAGE) carries per-instance `colorActive` (rgba + active flag); bound as an instanced vertex attribute so each instance matches its source pixel color. CPU never reads `liveCount`; we always draw `forcedInstanceCount = maxParticles` and cull inactive instances via matrices (offscreen translate or zero scale).

## Concrete steps
### 1) API / state changes
- Extend `FxChainMeta` with a new effect type (e.g., `mode: 'letterParticles'`) and params: `alphaThreshold`, `circleRadius`, `lerpT`, `targetLayout` (enum: ring/spiral/noise/grid), `targetRadius`, `seed`, `softness`, maybe `maxParticlesScale` to clamp buffer size.
- Update defaults/presets + UI schema in `appState.ts` and any Livecode controls to expose lerpT/target layout. Ensure `getFxMeta` parses new fields.

### 2) File layout
- Create `src/rendering/postFX/letterParticles/` with:
  - `letterParticles.compute.wgsl` (compaction)
  - `letterTargets.compute.wgsl` (placement/lerp compute — mandatory)
  - Generated outputs: `.generated.ts` alongside each WGSL (via existing Vite WGSL plugin).
  - A TS module `letterParticles.ts` that wires compute + instancing buffers (no custom material).

### 3) WGSL details
- Compaction shader (group 0):
  - `@binding(0) inputTex : texture_2d<f32>`
  - `@binding(1) particles : array<Particle>` storage buffer (struct: `uvColor : vec4<f32>` where uv.xy; `color : vec4<f32>`; 32-byte stride).
  - `@binding(2) counter : struct { value : atomic<u32>; }`
  - `@binding(3) settings : uniform { alphaThreshold: f32; maxParticles: u32; texSize: vec2<u32>; }`
- Workgroup size: (8,8,1); dispatch ceil(w/8), ceil(h/8). Guard `idx < maxParticles`; skip alpha <= threshold.
- Placement/lerp shader (group 0):
  - Inputs: `particles` (from compaction), `counter` (for liveCount), uniforms (`lerpT`, `bboxOrigin`, `bboxSize`, `canvasSize`, `targetRadius`, etc.).
  - Outputs: `instanceMatrices` storage buffer (array<vec4<f32>> with 4 vec4 per instance) flagged VERTEX|STORAGE; `instanceColorActive` buffer (vec4: rgb + active) also flagged VERTEX|STORAGE.
  - For each index `< maxParticles`: if `idx >= liveCount`, write translate offscreen (or scale 0) and set active=0/alpha=0; else compute src position from uv → bbox → NDC, compute target layout (ring), `pos = mix(src, dst, lerpT)` (mandatory lerp stage), write world0-3 rows and copy color from `particles` into `instanceColorActive` (alpha preserved, active=1).

### 4) Type generation & glue
- Keep WGSL under `src/` for Vite plugin; use generated helpers (`createShader`, `createStorageBuffer_*`, `createUniformBuffer_*`) instead of manual bindings.
- Mark `instanceMatrices` buffer with `BUFFER_CREATIONFLAG_STORAGE | BUFFER_CREATIONFLAG_VERTEX` so it can be both compute output and vertex input (zero copy), mirroring `babylon_instance_scene_example.ts`.
- `instanceColorActive` buffer also flagged VERTEX|STORAGE; always produced by compute so colors match source pixels.
- Counter buffer: 4-byte storage; reset via generated helper; no CPU reads.

### 5) Renderer material (no custom shader)
- Use `StandardMaterial` (or existing overlay material). Enable thin instancing on a quad.
- Bind `instanceMatrices` buffer as instanced vertex attributes `world0..world3` via four `VertexBuffer` views into the same GPU buffer (stride 16 floats, offsets 0/4/8/12). Set `manualUpdateOfWorldMatrixInstancedBuffer = true`.
- Set `thinInstanceCount` and `forcedInstanceCount` to `maxParticles`. Inactive instances are moved offscreen or scaled to 0 by the placement compute.
- Per-instance color: required. Bind `instanceColorActive` buffer as an instanced vertex attribute (4 floats: rgb + active/alpha) written by the placement compute; StandardMaterial uses it via thin-instance color semantics.

### 6) Integration into `polygonFx.ts`
- Add a letterParticles mode alongside existing FX:
  - On first use or when bbox **dimensions** change, create/recreate: p5.Graphics, Babylon texture from graphics, particle buffer, counter, instanceMatrices buffer (VERTEX|STORAGE), instanceColorActive buffer (VERTEX|STORAGE), uniforms, and the thin-instanced quad with `StandardMaterial`; bind world0–world3 to the matrix buffer; set `thinInstanceCount/forcedInstanceCount = maxParticles`.
  - On metadata/position change (same dimensions): redraw p5 graphics; update uniforms (lerpT, alphaThreshold, target layout, bbox origin/size); reset counter; dispatch compaction then placement compute. No CPU readback; renderer consumes the same buffers.
  - Dispose only on delete/disable or bbox dimension change; keep overlay scene/mesh otherwise.

### 7) CPU/GPU sync & perf
- No CPU readback: always render `maxParticles`; placement compute moves inactive instances offscreen/zero scale.
- Clamp `maxParticles` to bbox size; default small rects to minimize overdraw.
- Ensure storage buffer sizes use `w*h` worst case; recreate when dimensions change.

### 8) Testing / validation
- Dev harness: toggle FX to letterParticles, animate `lerpT` 0→1, vary alpha threshold; confirm inactive instances are offscreen/zero scale and fragments drop.
- Visual check: clear alpha regions result in no visible particles; target ring layout centers correctly within bbox.
- WebGPU-only; no fallback required.

## Stretch items
- GPU-driven indirect draw (when Babylon exposes it) to avoid drawing inactive instances at all.
- Additional target layouts (grid/spiral/noise flow field) selectable via enum; could reuse placement compute to write alternative matrices.
- If soft circles desired, swap mesh to a disc; still no custom material needed.

## Decision on liveCount usage (no CPU readback)
- Keep `forcedInstanceCount = maxParticles`; store `liveCount` or an `active` flag per instance in the particle buffer.
- In the vertex shader, early-out inactive instances by setting position to a large offscreen value (e.g., -1e6) or scale=0/alpha=0; Babylon will cull them post-VS, avoiding fragment work.
- Use small rects to keep the fragment shader minimal.
