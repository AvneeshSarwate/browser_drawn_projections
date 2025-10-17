# Option B Refactor: Proper Fluid Simulation Architecture

## Overview

Split the monolithic 3-pass shader into separate stages with proper pressure projection using an efficient **PressureIterator** that runs Jacobi iterations internally with only 2 buffers (not N buffers).

## Architecture

```
Input: Mouse Forces (Canvas)
  ↓
┌─────────────────────────────────────────────────────────┐
│ VELOCITY PIPELINE                                        │
├─────────────────────────────────────────────────────────┤
│ 1. VelocityAdvection (with FeedbackNode)                │
│    Input:  velocity.read                                 │
│    Output: advected velocity → velocity.write           │
├─────────────────────────────────────────────────────────┤
│ 2. ForceApplication (no feedback)                       │
│    Input:  advected velocity + force canvas             │
│    Output: velocity with forces applied                 │
├─────────────────────────────────────────────────────────┤
│ 3. Curl (no feedback, single pass)                      │
│    Input:  forced velocity                              │
│    Output: curl scalar field (R16F)                     │
├─────────────────────────────────────────────────────────┤
│ 4. VorticityConfinement (optional)                      │
│    Input:  forced velocity + curl                       │
│    Output: velocity with vorticity boost                │
├─────────────────────────────────────────────────────────┤
│ 5. Divergence (no feedback, single pass)                │
│    Input:  velocity                                      │
│    Output: divergence scalar field (R16F)               │
├─────────────────────────────────────────────────────────┤
│ 6. PressureIterator (custom, 2 internal buffers)        │
│    Input:  divergence field                             │
│    Internal: runs Jacobi 20x with ping-pong             │
│    Output: pressure field (R16F)                        │
├─────────────────────────────────────────────────────────┤
│ 7. GradientSubtraction (Projection)                     │
│    Input:  velocity + pressure                          │
│    Output: divergence-free velocity → projected         │
└─────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────┐
│ DYE PIPELINE                                             │
├─────────────────────────────────────────────────────────┤
│ 8. DyeAdvection (with FeedbackNode)                     │
│    Input:  dye.read + projected velocity                │
│    Output: advected dye → dye.write                     │
├─────────────────────────────────────────────────────────┤
│ 9. DyeForces (color splats)                             │
│    Input:  advected dye + force canvas                  │
│    Output: dye with color added                         │
└─────────────────────────────────────────────────────────┘
  ↓
Display: dye.output
```

## Key Innovation: PressureIterator

Instead of creating 20 FeedbackNode loops (wasteful: 40+ buffers), create a custom `PressureIterator` class that:

1. **Extends CustomShaderEffect** for consistency
2. **Manages 2 internal RTTs** (ping-pong pair)
3. **Runs Jacobi shader N times** in a loop within `render()`
4. **Swaps internal buffers** between iterations
5. **Outputs to stable RTT** so downstream effects see consistent texture identity

### Memory Efficiency

**Bad approach (N FeedbackNodes):**
```
Iteration 1: FeedbackNode → 2 buffers
Iteration 2: FeedbackNode → 2 buffers
...
Iteration 20: FeedbackNode → 2 buffers
Total: 40 buffers!
```

**Good approach (PressureIterator):**
```
PressureIterator:
  - pressureRT0 (internal ping)
  - pressureRT1 (internal pong)
  - output (stable external RTT)
Total: 3 buffers
```

## Implementation Details

### 1. Jacobi Pressure Shader (WGSL)

Create `src/rendering/postFX/pressureJacobi.fragFunc.wgsl`:

```wgsl
// Jacobi iteration: p_new = 0.25 * (pL + pR + pT + pB - divergence)
// Run this shader N times to iteratively solve ∇²p = div

fn safeSample(tex: texture_2d<f32>, samp: sampler, uv: vec2f) -> f32 {
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  return textureSample(tex, samp, clampedUv).x;
}

fn texelSize(tex: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(tex);
  return vec2f(
    select(1.0 / f32(dims.x), 0.0, dims.x == 0u),
    select(1.0 / f32(dims.y), 0.0, dims.y == 0u)
  );
}

fn pass0(
  uv: vec2f,
  pressure: texture_2d<f32>,
  pressureSampler: sampler,
  divergence: texture_2d<f32>,
  divergenceSampler: sampler,
) -> vec4f {
  let texel = texelSize(pressure);
  
  // Sample neighbors
  let pL = safeSample(pressure, pressureSampler, uv - vec2f(texel.x, 0.0));
  let pR = safeSample(pressure, pressureSampler, uv + vec2f(texel.x, 0.0));
  let pB = safeSample(pressure, pressureSampler, uv - vec2f(0.0, texel.y));
  let pT = safeSample(pressure, pressureSampler, uv + vec2f(0.0, texel.y));
  
  // Sample divergence at center
  let div = safeSample(divergence, divergenceSampler, uv);
  
  // Jacobi iteration
  let p = 0.25 * (pL + pR + pB + pT - div);
  
  return vec4f(p, 0.0, 0.0, 1.0);
}
```

### 2. PressureIterator Class

Add to `src/rendering/shaderFXBabylon.ts`:

```typescript
export interface PressureIteratorInputs {
  divergence: ShaderSource;
  initialPressure?: ShaderSource; // optional seed (usually omitted, starts at 0)
}

export class PressureIterator extends CustomShaderEffect<
  Record<string, never>,
  PressureIteratorInputs
> {
  effectName = 'PressureIterator';
  
  private iterations: number;
  private pressureRT0: BABYLON.RenderTargetTexture;
  private pressureRT1: BABYLON.RenderTargetTexture;
  private jacobiMaterial: MaterialHandles<Record<string, never>, string>;
  private copyMaterial: MaterialHandles<Record<string, never>, string>;

  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: PressureIteratorInputs,
    width: number,
    height: number,
    sampleMode: SamplingMode = 'nearest',
    precision: RenderPrecision = 'half_float',
    iterations: number = 20
  ) {
    super(engine, inputs, {
      factory: createPressureJacobiMaterial, // from generated file
      textureInputKeys: ['divergence'],
      width,
      height,
      materialName: 'PressureJacobiMaterial',
      sampleMode,
      precision,
      passCount: 1,
      primaryTextureKey: 'divergence',
    });
    
    this.iterations = Math.max(1, iterations);
    this.jacobiMaterial = this.passHandles[0];
    
    // Create copy material for final blit
    this.copyMaterial = createPassthruMaterial(this.scene, { 
      name: 'PressureCopyMaterial' 
    });
    
    // Allocate internal ping-pong buffers
    this.allocatePingPongBuffers();
  }

  setIterations(n: number): void {
    this.iterations = Math.max(1, Math.floor(n));
  }

  private allocatePingPongBuffers(): void {
    // Dispose old buffers
    this.pressureRT0?.dispose();
    this.pressureRT1?.dispose();
    
    // Create new buffers with same settings as output
    const makeRTT = (name: string) =>
      new BABYLON.RenderTargetTexture(
        name,
        { width: this.width, height: this.height },
        this.scene,
        false, // generateMipMaps
        true,  // doNotChangeAspectRatio
        this.textureType,
        false, // isCube
        this.samplingMode,
        true,  // generateDepthBuffer
        false, // generateStencilBuffer
        false, // isMulti
        undefined, // format
        false  // delayAllocation
      );
    
    this.pressureRT0 = makeRTT('pressureRT0');
    this.pressureRT1 = makeRTT('pressureRT1');
  }

  private ensureSizeMatch(): void {
    const size = this.pressureRT0.getSize();
    if (size.width !== this.width || size.height !== this.height) {
      this.allocatePingPongBuffers();
    }
  }

  private renderToTarget(
    target: BABYLON.RenderTargetTexture,
    material: MaterialHandles<any, string>
  ): void {
    // Set up render target
    target.renderList = [this.quad];
    this.quad.material = material.material;
    this.quad.isVisible = true;
    
    // Render
    target.render(true);
    
    // Clean up
    this.quad.isVisible = false;
    target.renderList = null;
  }

  override render(engine: BABYLON.Engine): void {
    // Resolve input textures
    const resolved = this.resolveInputTextures();
    const divergence = resolved.divergence as BABYLON.BaseTexture;
    
    // Ensure buffers match size
    this.ensureSizeMatch();
    
    // Get sampler
    const sampler = this.sampler ?? this.defaultSampler;
    
    // Initialize pressure field
    let readBuffer = this.pressureRT0;
    let writeBuffer = this.pressureRT1;
    
    // Optional: seed with initial pressure
    if (this.inputs.initialPressure) {
      const initialPressure = this.resolveTexture(
        this.inputs.initialPressure
      ) as BABYLON.BaseTexture;
      
      this.copyMaterial.setTexture('src', initialPressure);
      this.copyMaterial.setTextureSampler('src', sampler);
      this.renderToTarget(readBuffer, this.copyMaterial);
    }
    // Otherwise readBuffer starts at 0 (cleared RTT)
    
    // Run Jacobi iterations
    for (let i = 0; i < this.iterations; i++) {
      // Bind input textures
      this.jacobiMaterial.setTexture('pressure', readBuffer);
      this.jacobiMaterial.setTextureSampler('pressure', sampler);
      this.jacobiMaterial.setTexture('divergence', divergence);
      this.jacobiMaterial.setTextureSampler('divergence', sampler);
      
      // Render iteration
      this.renderToTarget(writeBuffer, this.jacobiMaterial);
      
      // Swap buffers for next iteration
      const temp = readBuffer;
      readBuffer = writeBuffer;
      writeBuffer = temp;
    }
    
    // Copy final result to stable output RTT
    // (readBuffer now contains the final pressure after all iterations)
    this.copyMaterial.setTexture('src', readBuffer);
    this.copyMaterial.setTextureSampler('src', sampler);
    this.renderToTarget(this.output, this.copyMaterial);
  }

  override dispose(): void {
    this.pressureRT0?.dispose();
    this.pressureRT1?.dispose();
    super.dispose();
  }

  // Required abstract implementations
  setSrcs(inputs: Partial<PressureIteratorInputs>): void {
    if (inputs.divergence !== undefined) {
      this.inputs.divergence = inputs.divergence;
    }
    if (inputs.initialPressure !== undefined) {
      this.inputs.initialPressure = inputs.initialPressure;
    }
  }

  setUniforms(_uniforms: Record<string, ShaderUniformValue>): void {
    // No uniforms needed
  }

  updateUniforms(): void {
    // No uniforms to update
  }
}
```

### 3. Other Required Shaders

Create these additional WGSL files:

#### `velocityAdvection.fragFunc.wgsl`
```wgsl
struct VelocityAdvectionUniforms {
  timeStep: f32,
  dissipation: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: VelocityAdvectionUniforms,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
) -> vec4f {
  // Backtrace particle position
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  let prevUv = uv - vel * uniforms.timeStep;
  
  // Sample velocity at backtraced position
  let advectedVel = textureSample(velocity, velocitySampler, prevUv).xy;
  
  // Apply dissipation
  let finalVel = advectedVel * uniforms.dissipation;
  
  return vec4f(finalVel, 0.0, 1.0);
}
```

#### `forceApplication.fragFunc.wgsl`
```wgsl
struct ForceApplicationUniforms {
  forceStrength: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: ForceApplicationUniforms,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
  forces: texture_2d<f32>,
  forcesSampler: sampler,
) -> vec4f {
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  
  // Sample forces with Y-flip for DOM coordinates
  let forceSample = textureSample(forces, forcesSampler, vec2f(uv.x, 1.0 - uv.y));
  
  // Un-premultiply alpha and decode to [-1, 1]
  let a = max(forceSample.a, 1e-4);
  let forceDir = forceSample.xy / a;
  let encodedForce = forceDir * 2.0 - vec2f(1.0);
  
  // Apply force
  let newVel = vel + encodedForce * uniforms.forceStrength * a;
  
  return vec4f(newVel, 0.0, 1.0);
}
```

#### `divergence.fragFunc.wgsl`
```wgsl
fn texelSize(tex: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(tex);
  return 1.0 / vec2f(f32(dims.x), f32(dims.y));
}

fn pass0(
  uv: vec2f,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
) -> vec4f {
  let texel = texelSize(velocity);
  
  // Sample neighbor velocities
  let vL = textureSample(velocity, velocitySampler, uv - vec2f(texel.x, 0.0)).x;
  let vR = textureSample(velocity, velocitySampler, uv + vec2f(texel.x, 0.0)).x;
  let vB = textureSample(velocity, velocitySampler, uv - vec2f(0.0, texel.y)).y;
  let vT = textureSample(velocity, velocitySampler, uv + vec2f(0.0, texel.y)).y;
  
  // Compute divergence: ∇·v = ∂vx/∂x + ∂vy/∂y
  let div = 0.5 * (vR - vL + vT - vB);
  
  return vec4f(div, 0.0, 0.0, 1.0);
}
```

#### `gradientSubtraction.fragFunc.wgsl`
```wgsl
fn texelSize(tex: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(tex);
  return 1.0 / vec2f(f32(dims.x), f32(dims.y));
}

fn pass0(
  uv: vec2f,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
  pressure: texture_2d<f32>,
  pressureSampler: sampler,
) -> vec4f {
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  let texel = texelSize(pressure);
  
  // Sample neighbor pressures
  let pL = textureSample(pressure, pressureSampler, uv - vec2f(texel.x, 0.0)).x;
  let pR = textureSample(pressure, pressureSampler, uv + vec2f(texel.x, 0.0)).x;
  let pB = textureSample(pressure, pressureSampler, uv - vec2f(0.0, texel.y)).x;
  let pT = textureSample(pressure, pressureSampler, uv + vec2f(0.0, texel.y)).x;
  
  // Compute pressure gradient
  let gradient = vec2f(pR - pL, pT - pB);
  
  // Subtract gradient to make velocity divergence-free
  let projectedVel = vel - gradient;
  
  return vec4f(projectedVel, 0.0, 1.0);
}
```

#### `dyeAdvection.fragFunc.wgsl`
```wgsl
struct DyeAdvectionUniforms {
  timeStep: f32,
  dissipation: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: DyeAdvectionUniforms,
  dye: texture_2d<f32>,
  dyeSampler: sampler,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
) -> vec4f {
  // Backtrace using velocity field
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  let prevUv = uv - vel * uniforms.timeStep;
  
  // Sample dye at backtraced position
  let advectedDye = textureSample(dye, dyeSampler, prevUv).xyz;
  
  // Apply dissipation
  let finalDye = advectedDye * uniforms.dissipation;
  
  return vec4f(finalDye, 1.0);
}
```

### 4. Pipeline Wiring in LivecodeHolder.vue

```typescript
// Buffer sizes
const simWidth = 512;
const simHeight = 512;

// 1. Velocity advection with feedback
const velocityInitial = new PassthruEffect(
  fluidEngine,
  { src: createBlackTexture(simWidth, simHeight) },
  simWidth,
  simHeight,
  'linear',
  'half_float'
);
const velocityFeedback = new FeedbackNode(
  fluidEngine,
  velocityInitial,
  simWidth,
  simHeight,
  'linear',
  'half_float'
);
const velocityAdvection = new VelocityAdvectionEffect(
  fluidEngine,
  { velocity: velocityFeedback },
  simWidth,
  simHeight,
  'linear',
  'half_float'
);
velocityAdvection.setUniforms({
  timeStep: 0.016,
  dissipation: 0.83, // Pavel's value
});
velocityFeedback.setFeedbackSrc(velocityAdvection);

// 2. Force application
const forceApplication = new ForceApplicationEffect(
  fluidEngine,
  { velocity: velocityAdvection, forces: forceCanvas },
  simWidth,
  simHeight,
  'linear',
  'half_float'
);
forceApplication.setUniforms({
  forceStrength: 6000, // Pavel's SPLAT_FORCE
});

// 3. Divergence computation
const divergence = new DivergenceEffect(
  fluidEngine,
  { velocity: forceApplication },
  simWidth,
  simHeight,
  'nearest', // Use nearest for scalar fields
  'half_float'
);

// 4. Pressure iteration (20 Jacobi iterations internally)
const pressure = new PressureIterator(
  fluidEngine,
  { divergence: divergence },
  simWidth,
  simHeight,
  'nearest',
  'half_float',
  20 // iterations
);

// 5. Gradient subtraction (projection)
const projection = new GradientSubtractionEffect(
  fluidEngine,
  { velocity: forceApplication, pressure: pressure },
  simWidth,
  simHeight,
  'linear',
  'half_float'
);

// Update velocity feedback to use projected velocity
velocityFeedback.setFeedbackSrc(projection);

// 6. Dye advection with feedback
const dyeInitial = new PassthruEffect(
  fluidEngine,
  { src: createInitialDyeTexture(simWidth, simHeight) },
  simWidth,
  simHeight,
  'linear',
  'half_float'
);
const dyeFeedback = new FeedbackNode(
  fluidEngine,
  dyeInitial,
  simWidth,
  simHeight,
  'linear',
  'half_float'
);
const dyeAdvection = new DyeAdvectionEffect(
  fluidEngine,
  { dye: dyeFeedback, velocity: projection },
  simWidth,
  simHeight,
  'linear',
  'half_float'
);
dyeAdvection.setUniforms({
  timeStep: 0.016,
  dissipation: 0.98,
});
dyeFeedback.setFeedbackSrc(dyeAdvection);

// 7. Display
const display = new CanvasPaint(
  fluidEngine,
  { src: dyeAdvection },
  width,
  height,
  'linear',
  'half_float'
);

// Render loop
function render() {
  if (!state.paused) {
    fluidEngine.beginFrame();
    try {
      display.renderAll(fluidEngine as unknown as BABYLON.Engine);
    } finally {
      fluidEngine.endFrame();
    }
  }
  animationHandle = requestAnimationFrame(render);
}
```

## Wrapper: FluidSimulationEffect

To simplify usage and encapsulate the complex pipeline, create a wrapper effect that manages the entire fluid simulation subgraph internally.

### Design Goals

1. **Simple Interface**: Hide internal complexity, expose only essential inputs/outputs
2. **Unified Configuration**: Single config object for all parameters
3. **Automatic Wiring**: Manages all internal feedback loops and connections
4. **Multiple Outputs**: Exposes both velocity and dye fields for external use
5. **Self-Contained**: Can be dropped into any project as a single component

### Public Interface

```typescript
export interface FluidSimulationConfig {
  // Simulation resolution
  simWidth: number;
  simHeight: number;
  
  // Display resolution (can be different from sim)
  displayWidth?: number;
  displayHeight?: number;
  
  // Velocity parameters
  velocityDissipation?: number; // default: 0.83
  timeStep?: number; // default: 0.016
  forceStrength?: number; // default: 6000
  
  // Pressure solver
  pressureIterations?: number; // default: 20
  
  // Dye parameters
  dyeDissipation?: number; // default: 0.98
  
  // Optional enhancements
  enableVorticity?: boolean; // default: false
  vorticityStrength?: number; // default: 30
  
  // Rendering
  sampleMode?: SamplingMode; // default: 'linear'
  precision?: RenderPrecision; // default: 'half_float'
}

export interface FluidSimulationInputs {
  forces: ShaderSource; // Force field texture (from canvas)
  dyeForces?: ShaderSource; // Optional separate dye injection
}

export class FluidSimulationEffect {
  // Public outputs
  public readonly velocity: ShaderSource; // Projected velocity field
  public readonly dye: ShaderSource; // Advected dye field
  public readonly pressure: ShaderSource; // Pressure field (for debugging)
  public readonly divergence: ShaderSource; // Divergence field (for debugging)
  
  // Internal effects (private)
  private velocityAdvection: VelocityAdvectionEffect;
  private forceApplication: ForceApplicationEffect;
  private divergenceEffect: DivergenceEffect;
  private pressureIterator: PressureIterator;
  private projection: GradientSubtractionEffect;
  private dyeAdvection: DyeAdvectionEffect;
  
  // Feedback nodes
  private velocityFeedback: FeedbackNode;
  private dyeFeedback: FeedbackNode;
  
  // Configuration
  private config: Required<FluidSimulationConfig>;
  
  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: FluidSimulationInputs,
    config: FluidSimulationConfig
  ) {
    this.config = this.fillDefaults(config);
    this.buildPipeline(engine, inputs);
    
    // Expose outputs
    this.velocity = this.projection.output;
    this.dye = this.dyeAdvection.output;
    this.pressure = this.pressureIterator.output;
    this.divergence = this.divergenceEffect.output;
  }
  
  private fillDefaults(config: FluidSimulationConfig): Required<FluidSimulationConfig> {
    return {
      simWidth: config.simWidth,
      simHeight: config.simHeight,
      displayWidth: config.displayWidth ?? config.simWidth,
      displayHeight: config.displayHeight ?? config.simHeight,
      velocityDissipation: config.velocityDissipation ?? 0.83,
      timeStep: config.timeStep ?? 0.016,
      forceStrength: config.forceStrength ?? 6000,
      pressureIterations: config.pressureIterations ?? 20,
      dyeDissipation: config.dyeDissipation ?? 0.98,
      enableVorticity: config.enableVorticity ?? false,
      vorticityStrength: config.vorticityStrength ?? 30,
      sampleMode: config.sampleMode ?? 'linear',
      precision: config.precision ?? 'half_float',
    };
  }
  
  private buildPipeline(
    engine: BABYLON.WebGPUEngine,
    inputs: FluidSimulationInputs
  ): void {
    const { simWidth, simHeight, sampleMode, precision } = this.config;
    
    // ===== VELOCITY PIPELINE =====
    
    // 1. Velocity feedback loop
    const velocityInitial = new PassthruEffect(
      engine,
      { src: this.createBlackTexture(simWidth, simHeight) },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    
    this.velocityFeedback = new FeedbackNode(
      engine,
      velocityInitial,
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    
    // 2. Advection
    this.velocityAdvection = new VelocityAdvectionEffect(
      engine,
      { velocity: this.velocityFeedback },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.velocityAdvection.setUniforms({
      timeStep: this.config.timeStep,
      dissipation: this.config.velocityDissipation,
    });
    
    // 3. Force application
    this.forceApplication = new ForceApplicationEffect(
      engine,
      { 
        velocity: this.velocityAdvection,
        forces: inputs.forces,
      },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.forceApplication.setUniforms({
      forceStrength: this.config.forceStrength,
    });
    
    // 4. Optional vorticity confinement
    let velocityWithVorticity = this.forceApplication.output;
    if (this.config.enableVorticity) {
      // TODO: implement curl + vorticity stages
      // For now, skip
    }
    
    // 5. Divergence
    this.divergenceEffect = new DivergenceEffect(
      engine,
      { velocity: velocityWithVorticity },
      simWidth,
      simHeight,
      'nearest', // Use nearest for scalar fields
      precision
    );
    
    // 6. Pressure iteration
    this.pressureIterator = new PressureIterator(
      engine,
      { divergence: this.divergenceEffect },
      simWidth,
      simHeight,
      'nearest',
      precision,
      this.config.pressureIterations
    );
    
    // 7. Gradient subtraction (projection)
    this.projection = new GradientSubtractionEffect(
      engine,
      {
        velocity: velocityWithVorticity,
        pressure: this.pressureIterator,
      },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    
    // 8. Close velocity feedback loop
    this.velocityFeedback.setFeedbackSrc(this.projection);
    
    // ===== DYE PIPELINE =====
    
    // 9. Dye feedback loop
    const dyeInitial = new PassthruEffect(
      engine,
      { src: this.createInitialDye(simWidth, simHeight) },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    
    this.dyeFeedback = new FeedbackNode(
      engine,
      dyeInitial,
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    
    // 10. Dye advection
    this.dyeAdvection = new DyeAdvectionEffect(
      engine,
      {
        dye: this.dyeFeedback,
        velocity: this.projection, // Use projected velocity
      },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.dyeAdvection.setUniforms({
      timeStep: this.config.timeStep,
      dissipation: this.config.dyeDissipation,
    });
    
    // 11. Optional dye force injection
    if (inputs.dyeForces) {
      // TODO: add dye force application stage
    }
    
    // 12. Close dye feedback loop
    this.dyeFeedback.setFeedbackSrc(this.dyeAdvection);
  }
  
  private createBlackTexture(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    return canvas;
  }
  
  private createInitialDye(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    
    // Create initial pattern (e.g., central blob)
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.15;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const intensity = Math.max(0, 1.0 - dist / radius);
        
        const index = (y * width + x) * 4;
        imageData.data[index + 0] = intensity * 255; // R
        imageData.data[index + 1] = intensity * 200; // G
        imageData.data[index + 2] = intensity * 150; // B
        imageData.data[index + 3] = 255; // A
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
  
  // Public API (follows CustomShaderEffect pattern)
  
  setSrcs(inputs: Partial<FluidSimulationInputs>): void {
    if (inputs.forces !== undefined) {
      this.forceApplication.setSrcs({ forces: inputs.forces });
    }
    if (inputs.dyeForces !== undefined) {
      // TODO: set dye forces when that stage is implemented
    }
  }
  
  setUniforms(uniforms: Partial<FluidSimulationConfig>): void {
    // Update velocity parameters
    if (uniforms.velocityDissipation !== undefined) {
      this.velocityAdvection.setUniforms({ dissipation: uniforms.velocityDissipation });
      this.config.velocityDissipation = uniforms.velocityDissipation;
    }
    if (uniforms.timeStep !== undefined) {
      this.velocityAdvection.setUniforms({ timeStep: uniforms.timeStep });
      this.dyeAdvection.setUniforms({ timeStep: uniforms.timeStep });
      this.config.timeStep = uniforms.timeStep;
    }
    if (uniforms.forceStrength !== undefined) {
      this.forceApplication.setUniforms({ forceStrength: uniforms.forceStrength });
      this.config.forceStrength = uniforms.forceStrength;
    }
    
    // Update pressure parameters
    if (uniforms.pressureIterations !== undefined) {
      this.pressureIterator.setIterations(uniforms.pressureIterations);
      this.config.pressureIterations = uniforms.pressureIterations;
    }
    
    // Update dye parameters
    if (uniforms.dyeDissipation !== undefined) {
      this.dyeAdvection.setUniforms({ dissipation: uniforms.dyeDissipation });
      this.config.dyeDissipation = uniforms.dyeDissipation;
    }
    
    // Update vorticity parameters
    if (uniforms.enableVorticity !== undefined) {
      this.config.enableVorticity = uniforms.enableVorticity;
      // Would need to rebuild pipeline to add/remove vorticity stage
      console.warn('enableVorticity change requires pipeline rebuild (not yet implemented)');
    }
    if (uniforms.vorticityStrength !== undefined) {
      this.config.vorticityStrength = uniforms.vorticityStrength;
      // TODO: forward to vorticity effect when implemented
    }
  }
  
  // Render the entire pipeline
  renderAll(engine: BABYLON.Engine): void {
    // All effects are wired via feedback nodes and shader dependencies,
    // so we only need to trigger the final output rendering.
    // The dependency chain will automatically render all prerequisite stages.
    this.dyeAdvection.render(engine);
  }
  
  // Cleanup
  dispose(): void {
    this.velocityAdvection.dispose();
    this.forceApplication.dispose();
    this.divergenceEffect.dispose();
    this.pressureIterator.dispose();
    this.projection.dispose();
    this.dyeAdvection.dispose();
    this.velocityFeedback.dispose();
    this.dyeFeedback.dispose();
  }
}
```

### Usage Example

```typescript
// In LivecodeHolder.vue

// Create force canvas (as before)
const forceCanvas = document.getElementById('forceCanvas') as HTMLCanvasElement;

// Create fluid simulation wrapper
const fluidSim = new FluidSimulationEffect(
  fluidEngine,
  { forces: forceCanvas },
  {
    simWidth: 512,
    simHeight: 512,
    displayWidth: 1024,
    displayHeight: 1024,
    pressureIterations: 20,
    velocityDissipation: 0.83,
    dyeDissipation: 0.98,
    forceStrength: 6000,
    enableVorticity: true,
    vorticityStrength: 30,
  }
);

// Create display canvas painter
const display = new CanvasPaint(
  fluidEngine,
  { src: fluidSim.dye }, // Use dye output
  1024,
  1024,
  'linear',
  'half_float'
);

// Render loop
function render() {
  if (!state.paused) {
    fluidEngine.beginFrame();
    try {
      display.renderAll(fluidEngine as unknown as BABYLON.Engine);
      // This automatically triggers fluidSim.renderAll() via dependencies
    } finally {
      fluidEngine.endFrame();
    }
  }
  animationHandle = requestAnimationFrame(render);
}

// Runtime parameter updates (using standard setUniforms API)
watch(
  () => state.fluidParams.map(p => p.value.value),
  () => {
    fluidSim.setUniforms({
      velocityDissipation: state.fluidParams.find(p => p.name === 'velocityDissipation')?.value.value,
      dyeDissipation: state.fluidParams.find(p => p.name === 'dyeDissipation')?.value.value,
      forceStrength: state.fluidParams.find(p => p.name === 'forceStrength')?.value.value,
      pressureIterations: state.fluidParams.find(p => p.name === 'pressureIterations')?.value.value,
    });
  }
);
```

### Benefits

1. **Encapsulation**: All internal complexity hidden
2. **Easy to Use**: Single constructor call creates entire pipeline
3. **Configurable**: Comprehensive config object with sensible defaults
4. **Consistent API**: Uses standard `setUniforms()` / `setSrcs()` pattern like CustomShaderEffect
5. **Reusable**: Can be dropped into multiple projects
6. **Maintainable**: Changes to pipeline don't affect external code
7. **Debuggable**: Exposes intermediate outputs (pressure, divergence) for visualization
8. **Performance**: No overhead, just organizational wrapper

### Integration with Existing Code

```typescript
// Before (manual wiring):
const velocityFeedback = new FeedbackNode(...);
const velocityAdvection = new VelocityAdvectionEffect(...);
const forceApplication = new ForceApplicationEffect(...);
const divergence = new DivergenceEffect(...);
const pressure = new PressureIterator(...);
const projection = new GradientSubtractionEffect(...);
velocityFeedback.setFeedbackSrc(projection);
// ... more wiring ...

// After (wrapped):
const fluidSim = new FluidSimulationEffect(engine, { forces }, config);
```

### Testing the Wrapper

```typescript
// Test divergence minimization
function testDivergenceMinimization() {
  const fluidSim = new FluidSimulationEffect(engine, { forces }, {
    simWidth: 256,
    simHeight: 256,
    pressureIterations: 20,
  });
  
  // Apply some forces
  // ... draw on force canvas ...
  
  // Render several frames
  for (let i = 0; i < 60; i++) {
    fluidSim.renderAll(engine);
  }
  
  // Read back divergence field
  const divTexture = fluidSim.divergence as BABYLON.RenderTargetTexture;
  const pixels = new Float32Array(256 * 256 * 4);
  divTexture.readPixels(0, 0, 256, 256, pixels);
  
  // Compute average absolute divergence
  let sumAbsDiv = 0;
  for (let i = 0; i < 256 * 256; i++) {
    sumAbsDiv += Math.abs(pixels[i * 4]);
  }
  const avgDiv = sumAbsDiv / (256 * 256);
  
  console.log('Average divergence:', avgDiv);
  // Should be < 0.01 for proper incompressibility
  assert(avgDiv < 0.01, 'Divergence too high!');
}
```

### File Structure

```
src/rendering/
  postFX/
    velocityAdvection.fragFunc.wgsl
    forceApplication.fragFunc.wgsl
    divergence.fragFunc.wgsl
    pressureJacobi.fragFunc.wgsl
    gradientSubtraction.fragFunc.wgsl
    dyeAdvection.fragFunc.wgsl
  shaderFXBabylon.ts
    - PressureIterator class
    - FluidSimulationEffect class (new)
```

## Implementation Phases

### Phase 0: Wrapper Design (S effort, ~2h)
- [ ] Design FluidSimulationEffect interface
- [ ] Plan internal pipeline wiring
- [ ] Define configuration schema
- [ ] Create wrapper class skeleton

### Phase 1: Core Infrastructure (M effort, ~4h)
- [ ] Implement `PressureIterator` class in `shaderFXBabylon.ts`
- [ ] Create Jacobi shader WGSL file
- [ ] Test PressureIterator in isolation with dummy divergence input

### Phase 2: Basic Pipeline (M effort, ~3h)
- [ ] Create `velocityAdvection.fragFunc.wgsl`
- [ ] Create `forceApplication.fragFunc.wgsl`
- [ ] Create `divergence.fragFunc.wgsl`
- [ ] Create `gradientSubtraction.fragFunc.wgsl`
- [ ] Wire up velocity pipeline (advection → forces → divergence → pressure → projection)

### Phase 3: Dye Pipeline (S effort, ~2h)
- [ ] Create `dyeAdvection.fragFunc.wgsl`
- [ ] Wire up dye pipeline (advection → display)
- [ ] Separate dye from velocity

### Phase 4: Optional Enhancements (S effort each)
- [ ] Add curl computation shader
- [ ] Add vorticity confinement shader
- [ ] Add proper boundary conditions
- [ ] Tune parameters and iteration counts

### Phase 5: Wrapper Implementation (M effort, ~3h)
- [ ] Implement `FluidSimulationEffect` class
- [ ] Wire all internal effects in `buildPipeline()`
- [ ] Implement helper methods (`createBlackTexture`, `createInitialDye`)
- [ ] Implement public API methods (`setVelocityDissipation`, etc.)
- [ ] Test wrapper in isolation

### Phase 6: Integration (S effort, ~2h)
- [ ] Replace manual wiring in `LivecodeHolder.vue` with wrapper
- [ ] Connect UI sliders to wrapper's public API
- [ ] Test complete integration
- [ ] Verify all parameters update correctly

### Phase 7: Parameter Tuning (S effort, ~1-2h)
- [ ] Adjust Jacobi iteration count (start at 20)
- [ ] Tune dissipation values
- [ ] Adjust force strengths
- [ ] Match Pavel's visual quality

## Testing Strategy

1. **Test PressureIterator alone:**
   - Create artificial divergence field (e.g., point sources)
   - Verify pressure converges after N iterations
   - Visualize pressure field

2. **Test velocity pipeline:**
   - Apply forces and verify velocity updates
   - Check that projection makes velocity divergence-free
   - Measure divergence before/after projection (should approach 0)

3. **Test complete system:**
   - Compare side-by-side with Pavel's demo
   - Check stability over time
   - Verify no drift when idle

## Success Criteria

- [ ] Fluid stays stable over long periods
- [ ] No drift when no forces applied
- [ ] Swirls and vortices behave naturally
- [ ] Visual quality matches Pavel's reference
- [ ] Divergence magnitude < 0.01 after projection
- [ ] Memory usage reasonable (no N×buffers)

## Effort Estimate

| Phase | Effort | Time | Notes |
|-------|--------|------|-------|
| Phase 0: Wrapper Design | S | 2h | Interface & architecture planning |
| Phase 1: PressureIterator | M | 4h | Core iterative solver |
| Phase 2: Velocity Pipeline | M | 3h | Advection, forces, divergence, projection |
| Phase 3: Dye Pipeline | S | 2h | Dye advection & display |
| Phase 4: Optional Enhancements | S | 2-4h | Curl, vorticity, boundaries |
| Phase 5: Wrapper Implementation | M | 3h | FluidSimulationEffect class |
| Phase 6: Integration | S | 2h | Wire into LivecodeHolder.vue |
| Phase 7: Tuning | S | 1-2h | Parameter optimization |
| **Total** | **L-XL** | **19-22h** | **Spread over 3-4 days** |

### Recommended Sequence

**Day 1 (6-7h):**
- Phase 0: Design wrapper interface
- Phase 1: Implement PressureIterator
- Phase 2: Start velocity pipeline (advection, forces)

**Day 2 (6-7h):**
- Phase 2: Finish velocity pipeline (divergence, projection)
- Phase 3: Implement dye pipeline
- Test velocity + dye pipelines separately

**Day 3 (4-5h):**
- Phase 5: Implement wrapper class
- Phase 6: Integrate into LivecodeHolder.vue
- Phase 7: Initial parameter tuning

**Day 4 (Optional, 3-4h):**
- Phase 4: Add curl + vorticity
- Phase 7: Fine-tune parameters to match Pavel
- Test stability and performance
