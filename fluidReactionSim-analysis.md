# Fluid Reaction Simulation Debug Notes

## Goal
- Identify the source of the constant downward-left force observed in the WebGPU fluid simulation.
- Compare the behaviour and implementation against the original `pavelFluid.js`.

## Step 1 — Review of `pavelFluid.js`
- The vorticity confinement shader adds a normalized force based on curl gradients:
  - `force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L))`.
  - Force vector is normalized, scaled by `curl * C`, and the Y component is flipped (`force.y *= -1.0`) to account for texture coordinate orientation.
  - Velocity update clamps resultant velocity between `[-1000, 1000]` in each axis.
- No other obvious constant force terms are applied outside splats or user interaction.
- Advection pulls velocity back along its own flow: `coord = vUv - dt * velocity * texelSize`.
- Divergence uses centered differences with boundary mirroring that flips components when sampling outside `[0,1]`, ensuring no net flow is injected at edges.
- Overall, no constant bias or offset is visible in the baseline implementation.

## Step 2 — Audit of WebGPU Port (`src/rendering/fluidSimulation`)
- **Velocity advection** (`velocityAdvection.frag.generated.ts:34`):
  - Matches Pavel’s scheme: backtraces with `prevUv = uv - vel * dt * texel` and clamps into `[0,1]`.
  - Dissipation is applied as a multiplicative factor instead of divide-by-decay, which is algebraically equivalent.
- **Force injection** (`forceApplication.frag.generated.ts:41` and pointer handling in `LivecodeHolder.vue:310`):
  - Pointer deltas are converted to a direction in canvas space, then remapped to `[0,1]` per channel and stored with strength in alpha.
  - Port originally sampled forces with `1.0 - uv.y`, which introduced a second Y inversion; we now sample using clamped `uv` directly.
- **Curl & vorticity confinement** (`curl.frag.generated.ts:41`, `vorticityConfinement.frag.generated.ts:58`):
  - Curl uses the same reflective boundary rule as Pavel (set neighbor component to `-center` when sampling off-domain).
  - Vorticity force normalizes gradient of |curl| and flips Y (`force.y = -force.y`) mirroring the GLSL logic. Boundaries zero-out curl samples instead of mirroring; we now sample “top”/“bottom” using the corrected offsets.
- **Divergence & pressure solve** (`divergence.frag.generated.ts:33`, `pressureJacobi.frag.generated.ts:32`):
  - Divergence mirrors horizontal/vertical components exactly like the original shader after correcting the vertical neighbor lookup.
  - Jacobi iterations reuse the same coefficients and include optional damping (`PressureIterator.ts:108`) analogous to Pavel’s `clearProgram`.
- **Projection step** (`gradientSubtraction.frag.generated.ts:51`):
  - Subtracts pressure gradient via `(pR - pL, pT - pB)` without any texel scaling exactly like the GLSL version.
  - Because WebGPU’s UV origin is top-left, the “top” and “bottom” offsets must be swapped (`uv - texel.y` vs `uv + texel.y`); this is now applied consistently across the pipeline.
- **Coordinate conventions**:
  - WebGPU sampling treats `(0,0)` as the top-left texel, whereas WebGL treated `(0,0)` as bottom-left. Several shaders directly reuse Pavel’s offsets (`uv ± texel`) without adapting for this inversion.
  - Pointer input already flips Y (`dirY = -velY / speed` in `LivecodeHolder.vue:343`) while the force shader previously flipped again; with the fix, the double inversion is removed.

- **Interim hypothesis**: The persistent down-left drift likely stems from inconsistent Y-axis handling introduced during the WebGL → WebGPU port. The most suspicious sites are:
  1. Sampling neighbors along Y in divergence/projection/vorticity without compensating for the flipped UV origin.
  2. The extra `1.0 - uv.y` in force sampling on top of already flipped pointer velocities.

## Step 3 — Next Verification Steps
- Remove the force-sampling flip (`1.0 - uv.y`) temporarily to confirm whether pointer splats still travel in the intended direction; compare against Pavel’s behavior.
- Adjust Y-offset sampling in divergence / gradient subtraction / vorticity to mirror around the current pixel (e.g. treat “top” as `uv - texel.y` in WebGPU) and watch whether the steady diagonal bias disappears.
- Instrument the velocity field after each pass (e.g. render divergence or velocity magnitude) to pinpoint which stage injects the leftward/downward component.
- Once the offending stage is isolated, reconcile the coordinate conventions (either flip textures up-front or consistently mirror Y during neighbor lookups) and keep documentation inline to prevent regressions.

## Fixes Implemented (current session)
- Updated `forceApplication` and `dyeForceApplication` shaders to sample the force canvas directly in WebGPU orientation and clamp UVs instead of flipping Y.
- Re-aligned vertical neighbor sampling across divergence, pressure Jacobi, gradient subtraction, curl, and vorticity confinement shaders so “top” uses `uv - texel.y` and “bottom” uses `uv + texel.y`, matching the top-left origin.
- Synchronized the generated TypeScript shader wrappers with the WGSL changes so runtime code reflects the corrected math.

## Additional Investigation
- Residual down-left drift persists even after the above orientation fixes. Inspection showed that the WebGPU shaders applied extra boundary overrides (e.g. zeroing curl samples or forcing pressure neighbors to the center value) that Pavel’s GLSL never used; these injected asymmetric forces near the borders. Those overrides have been removed so the clamped sampling behaviour now mirrors the original WebGL implementation.
- Sampling modes: the port still uses linear sampling for velocity/dye paths and nearest for scalar passes (curl, divergence, pressure) just like the WebGL version when linear filtering is available, so no immediate mismatch there.
- Force and dye canvases fade via `destination-out` each frame, so any remaining steady force likely comes from the simulation stages rather than stale canvas data.

## Next Steps
- Re-test the sim to confirm the constant bias is gone and the dye field dissipates to black after interaction stops.
- If residual flow remains, instrument the velocity magnitude/pressure fields to see whether the pressure projection converges (a diverging pressure would hint at remaining boundary issues).
- Double-check that WebGPU texture descriptors (addressMode clamp, compare disabled, etc.) match WebGL defaults; consider forcing velocity-related render targets to `nearest` sampling if artifacts persist.
