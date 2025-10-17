# Fluid Simulation Architecture Analysis

## Current Implementation Issues

The current `fluidSim.fragFunc.wgsl` uses a **3-pass architecture with a single feedback loop** that combines multiple stages. This is fundamentally different from Pavel Dogreat's reference implementation and **cannot produce correct incompressible fluid behavior**.

### Critical Missing Component: Pressure Projection

**Pavel's Pressure Projection Pipeline:**
1. Compute divergence: `div = 0.5 * ((vR.x - vL.x) + (vT.y - vB.y))`
2. Solve Poisson equation `∇²p = div` via **20 Jacobi iterations**:
   - `p_new = 0.25 * (pL + pR + pT + pB - div)`
   - Ping-pong between pressure buffers each iteration
3. Project velocity to divergence-free: `v = v - ∇p`
   - `v.x = v.x - (pR - pL)`
   - `v.y = v.y - (pT - pB)`

**Current Implementation:**
- Uses **3×3 blur** as implicit diffusion (not physically meaningful)
- Computes `length(current - blurred)` as "divergence" (not the divergence operator!)
- **No pressure field**, **no Poisson solve**, **no projection step**
- Result: Fluid is compressible, energy doesn't conserve properly, looks "off"

## What Each Pass Currently Does

### Pass 0: Advection + Forces + Dissipation
```wgsl
// Combines what should be 3-4 separate stages:
// 1. Semi-Lagrangian advection (backtrace velocity field)
// 2. Force application (add external forces from canvas)
// 3. Curl computation (for vorticity effects)
// 4. Dissipation (energy loss)
// Output: vec4(velocity.xy, density, curl)
```

### Pass 1: Spatial Blur (Pseudo-Diffusion)
```wgsl
// PROBLEM: This is NOT pressure projection!
// - 3×3 weighted box blur on velocity and density
// - Computes length(current - blurred) as "divergence"
//   (not the true divergence operator!)
// - Cannot enforce incompressibility
// Output: vec4(blurred_velocity.xy, blurred_density, pseudo_divergence)
```

### Pass 2: Blend and Output
```wgsl
// Blends advected (pass0) with blurred (pass1)
// Creates alpha for visualization
// Output: vec4(velocity.xy, density, alpha)
```

## Pavel's Architecture (What We Need)

Pavel uses **separate shader stages** with **dedicated buffers** for each field:

### Buffers Needed:
- **velocity**: RG16F, double-buffered (read/write for ping-pong)
- **dye**: RGBA16F, double-buffered
- **divergence**: R16F, single buffer (intermediate)
- **curl**: R16F, single buffer (intermediate)
- **pressure**: R16F, double-buffered (for Jacobi iterations)

### Pipeline Per Frame:
```
1. Advect velocity:    v.write = advect(v.read, v.read, dt, velDissipation)
2. Apply forces:       v.write = v.read + forces
3. Compute curl:       curl = curl(v.read)
4. Vorticity confine:  v.write = v.read + vorticity_force(curl) * dt
5. Compute divergence: div = ∇·v.read
6. Pressure solve:     Jacobi iterations (20×):
                         p.write = 0.25 * (pL+pR+pT+pB - div)
                         swap p.read ↔ p.write
7. Gradient subtract:  v.write = v.read - ∇p.read  [PROJECTION STEP]
8. Advect dye:         dye.write = advect(dye.read, v.read, dt, dyeDissipation)
9. Apply dye splats:   dye.write = dye.read + color_forces
10. Display:           render dye.read to screen
```

## Recommended Restructuring

### Approach 1: Minimal Fix (Medium Effort)
Add proper pressure projection while keeping simplified architecture:

1. **Add separate buffers:**
   - `velocityBuffer`: FeedbackNode for velocity only
   - `dyeBuffer`: FeedbackNode for dye/density only
   - `divergenceBuffer`: Single texture
   - `pressureBuffer`: FeedbackNode for Jacobi iterations

2. **Split into stages:**
   - `advectionPass`: Advect velocity
   - `forcePass`: Apply external forces
   - `divergencePass`: Compute true divergence
   - `pressurePass`: Jacobi iteration (run 15-20 times)
   - `projectionPass`: Subtract pressure gradient
   - `dyeAdvectionPass`: Advect dye using velocity
   - `displayPass`: Render dye to screen

### Approach 2: Full Pavel-Style (Large Effort)
Implement complete multi-stage pipeline with all optimizations:
- Add curl + vorticity confinement
- Separate simulation resolution from display resolution
- Add proper boundary conditions
- Implement BFECC advection for dye (optional)

## Implementation Effort Estimates

| Task | Effort | Impact |
|------|--------|--------|
| Add divergence shader | S (1h) | Critical |
| Add Jacobi pressure solver | M (2-3h) | Critical |
| Add projection shader | S (1h) | Critical |
| Separate velocity/dye buffers | M (2h) | Critical |
| Wire up new pipeline | M (3h) | Critical |
| Add curl/vorticity | S (2h) | High quality |
| Tune parameters | S (1-2h) | Polish |
| **Total (Minimal Fix)** | **L (1-2 days)** | **Makes fluid work correctly** |

## Key Shader Implementations Needed

### Divergence Shader
```wgsl
fn computeDivergence(
  velocity: texture_2d<f32>,
  sampler: sampler,
  uv: vec2f,
  texel: vec2f
) -> f32 {
  let vL = textureSample(velocity, sampler, uv - vec2f(texel.x, 0.0)).x;
  let vR = textureSample(velocity, sampler, uv + vec2f(texel.x, 0.0)).x;
  let vB = textureSample(velocity, sampler, uv - vec2f(0.0, texel.y)).y;
  let vT = textureSample(velocity, sampler, uv + vec2f(0.0, texel.y)).y;
  
  return 0.5 * (vR - vL + vT - vB);
}
```

### Jacobi Pressure Iteration
```wgsl
fn jacobiPressure(
  pressure: texture_2d<f32>,
  divergence: texture_2d<f32>,
  sampler: sampler,
  uv: vec2f,
  texel: vec2f
) -> f32 {
  let pL = textureSample(pressure, sampler, uv - vec2f(texel.x, 0.0)).x;
  let pR = textureSample(pressure, sampler, uv + vec2f(texel.x, 0.0)).x;
  let pB = textureSample(pressure, sampler, uv - vec2f(0.0, texel.y)).x;
  let pT = textureSample(pressure, sampler, uv + vec2f(0.0, texel.y)).x;
  let div = textureSample(divergence, sampler, uv).x;
  
  return 0.25 * (pL + pR + pB + pT - div);
}
```

### Gradient Subtraction (Projection)
```wgsl
fn subtractGradient(
  velocity: texture_2d<f32>,
  pressure: texture_2d<f32>,
  sampler: sampler,
  uv: vec2f,
  texel: vec2f
) -> vec2f {
  let v = textureSample(velocity, sampler, uv).xy;
  
  let pL = textureSample(pressure, sampler, uv - vec2f(texel.x, 0.0)).x;
  let pR = textureSample(pressure, sampler, uv + vec2f(texel.x, 0.0)).x;
  let pB = textureSample(pressure, sampler, uv - vec2f(0.0, texel.y)).x;
  let pT = textureSample(pressure, sampler, uv + vec2f(0.0, texel.y)).x;
  
  let gradient = vec2f(pR - pL, pT - pB);
  return v - gradient;
}
```

## Decision Point

**Option A: Keep current simplified approach**
- ✅ Simpler code, fewer buffers
- ❌ Fluid never looks correct
- ❌ Can't match reference implementations
- ❌ Wasted effort tuning parameters that can't fix fundamental issues

**Option B: Restructure with proper pressure projection**
- ✅ Correct fluid physics
- ✅ Matches reference implementations
- ✅ Adjustable quality (Jacobi iteration count)
- ❌ 1-2 days of work to implement properly
- ✅ Worth it for correct results

**Recommendation:** **Option B** - Restructure with proper pressure projection. The current approach fundamentally cannot work, and parameter tuning won't fix architectural issues.
