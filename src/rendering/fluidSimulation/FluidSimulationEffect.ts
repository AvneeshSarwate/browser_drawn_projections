import * as BABYLON from 'babylonjs';
import {
  PassthruEffect,
  FeedbackNode,
  type RenderPrecision,
  type ShaderSource,
} from '../shaderFXBabylon';
import { VelocityAdvectionEffect } from './velocityAdvection.frag.generated';
import { ForceApplicationEffect } from './forceApplication.frag.generated';
import { CurlEffect } from './curl.frag.generated';
import { VorticityConfinementEffect } from './vorticityConfinement.frag.generated';
import { DivergenceEffect } from './divergence.frag.generated';
import { GradientSubtractionEffect } from './gradientSubtraction.frag.generated';
import { DyeForceApplicationEffect } from './dyeForceApplication.frag.generated';
import { DyeAdvectionEffect } from './dyeAdvection.frag.generated';
import { PressureIterator } from './PressureIterator';

export interface FluidSimulationInputs {
  forces: ShaderSource;
  dyeForces?: ShaderSource;
}

export interface FluidSimulationConfig {
  simWidth: number;
  simHeight: number;
  displayWidth?: number;
  displayHeight?: number;
  pressureIterations: number;
  pressure: number;
  velocityDissipation: number;
  dyeDissipation: number;
  forceStrength: number;
  timeStep: number;
  enableVorticity?: boolean;
  vorticityStrength?: number;
  dyeInjectionStrength?: number;
}

/**
 * FluidSimulationEffect: Complete incompressible fluid simulation wrapper.
 * 
 * Encapsulates the entire fluid simulation pipeline following Pavel Dogreat's
 * architecture with proper pressure projection for incompressible flow.
 * 
 * Pipeline stages:
 * 1. Velocity advection (semi-Lagrangian)
 * 2. Force application (mouse input)
 * 3. Divergence computation
 * 4. Pressure solve (Jacobi iterations)
 * 5. Gradient subtraction (projection to divergence-free)
 * 6. Dye advection (for visualization)
 * 
 * Public API:
 * - velocity, dye, pressure, divergence getters for output access
 * - setSrcs() for updating input textures
 * - setUniforms() for runtime parameter updates
 * - renderAll() to execute the pipeline
 * - dispose() for cleanup
 */
export class FluidSimulationEffect {
  private engine: BABYLON.WebGPUEngine;
  private config: FluidSimulationConfig;
  
  // Velocity pipeline components
  private velocityFeedback: FeedbackNode;
  private velocityAdvection: VelocityAdvectionEffect;
  private forceApplication: ForceApplicationEffect;
  private curlEffect: CurlEffect;
  private vorticityEffect: VorticityConfinementEffect;
  private divergenceEffect: DivergenceEffect;
  private pressureIterator: PressureIterator;
  private projection: GradientSubtractionEffect;
  
  // Dye pipeline components
  private dyeFeedback: FeedbackNode;
  private dyeForceApplication: DyeForceApplicationEffect;
  private dyeAdvection: DyeAdvectionEffect;
  private currentTimeStep: number;
  
  /** Projected velocity field (divergence-free) */
  public get velocity(): BABYLON.RenderTargetTexture {
    return this.projection.output;
  }
  
  /** Advected dye field for visualization */
  public get dye(): BABYLON.RenderTargetTexture {
    return this.dyeAdvection.output;
  }
  
  /** Converged pressure field (for debugging) */
  public get pressure(): BABYLON.RenderTargetTexture {
    return this.pressureIterator.output;
  }
  
  /** Velocity divergence field (for debugging/verification) */
  public get divergence(): BABYLON.RenderTargetTexture {
    return this.divergenceEffect.output;
  }

  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: FluidSimulationInputs,
    config: FluidSimulationConfig
  ) {
    this.engine = engine;
    this.config = config;
    if (this.config.enableVorticity === undefined) {
      this.config.enableVorticity = true;
    }
    if (this.config.vorticityStrength === undefined) {
      this.config.vorticityStrength = 30;
    }
    if (this.config.dyeInjectionStrength === undefined) {
      this.config.dyeInjectionStrength = 0.65;
    }
    if (this.config.pressure === undefined) {
      this.config.pressure = 0.8;
    }
    this.currentTimeStep = config.timeStep;
    
    const { simWidth, simHeight } = config;
    const sampleMode: 'nearest' | 'linear' = 'linear';
    const precision: RenderPrecision = 'half_float';
    
    // ===== VELOCITY PIPELINE =====
    
    // 1. Initialize velocity feedback loop
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
    
    // 2. Velocity advection (semi-Lagrangian backtrace)
    this.velocityAdvection = new VelocityAdvectionEffect(
      engine,
      { velocity: this.velocityFeedback },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.velocityAdvection.setUniforms({
      timeStep: config.timeStep,
      dissipation: 1.0,
    });
    
    // 3. Apply external forces from mouse/canvas
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
      forceStrength: config.forceStrength,
    });
    
    // 3b. Curl + vorticity confinement to reinforce swirling motion
    this.curlEffect = new CurlEffect(
      engine,
      { velocity: this.forceApplication },
      simWidth,
      simHeight,
      'nearest',
      precision
    );
    this.vorticityEffect = new VorticityConfinementEffect(
      engine,
      {
        velocity: this.forceApplication,
        curl: this.curlEffect,
      },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.vorticityEffect.setUniforms({
      curlStrength: this.config.enableVorticity ? (this.config.vorticityStrength ?? 0) : 0,
      timeStep: this.config.timeStep,
    });
    
    const velocityWithVorticity = this.vorticityEffect;
    
    // 4. Compute velocity divergence
    this.divergenceEffect = new DivergenceEffect(
      engine,
      { velocity: velocityWithVorticity },
      simWidth,
      simHeight,
      'nearest', // Use nearest sampling for scalar fields
      precision
    );
    
    // 5. Solve for pressure using Jacobi iterations
    this.pressureIterator = new PressureIterator(
      engine,
      { divergence: this.divergenceEffect },
      simWidth,
      simHeight,
      'nearest',
      precision,
      config.pressureIterations
    );
    this.pressureIterator.setDamping(this.config.pressure);
    
    // 6. Subtract pressure gradient (projection to divergence-free)
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
    
    // Close velocity feedback loop with projected velocity
    this.velocityFeedback.setFeedbackSrc(this.projection);
    
    // ===== DYE PIPELINE =====
    
    // 7. Initialize dye feedback loop
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
    
    this.dyeForceApplication = new DyeForceApplicationEffect(
      engine,
      {
        dye: this.dyeFeedback,
        forces: inputs.dyeForces ?? inputs.forces,
      },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.dyeForceApplication.setUniforms({
      injectionStrength: this.config.dyeInjectionStrength ?? 0,
    });

    // 8. Advect dye using projected velocity field
    this.dyeAdvection = new DyeAdvectionEffect(
      engine,
      {
        dye: this.dyeForceApplication,
        velocity: this.projection,
      },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.dyeAdvection.setUniforms({
      timeStep: config.timeStep,
      dissipation: 1.0,
    });
    
    // Close dye feedback loop
    this.dyeFeedback.setFeedbackSrc(this.dyeAdvection);
    this.updateForFrame(this.currentTimeStep);
  }

  updateForFrame(dt: number): void {
    const clampedDt = Math.max(1e-4, dt);
    this.currentTimeStep = clampedDt;
    this.config.timeStep = clampedDt;
    const velocityDecay = 1 / (1 + this.config.velocityDissipation * clampedDt);
    const dyeDecay = 1 / (1 + this.config.dyeDissipation * clampedDt);
    this.velocityAdvection.setUniforms({ timeStep: clampedDt, dissipation: velocityDecay });
    this.dyeAdvection.setUniforms({ timeStep: clampedDt, dissipation: dyeDecay });
    const curlStrength = (this.config.enableVorticity ?? true) ? (this.config.vorticityStrength ?? 0) : 0;
    this.vorticityEffect.setUniforms({ curlStrength, timeStep: clampedDt });
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
    
    // Create central blob of dye
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
  
  /**
   * Update input textures (forces, dye injection, etc.)
   */
  setSrcs(inputs: Partial<FluidSimulationInputs>): void {
    if (inputs.forces !== undefined) {
      this.forceApplication.setSrcs({ forces: inputs.forces });
      if (inputs.dyeForces === undefined) {
        this.dyeForceApplication.setSrcs({ forces: inputs.forces });
      }
    }
    if (inputs.dyeForces !== undefined) {
      this.dyeForceApplication.setSrcs({ forces: inputs.dyeForces });
    }
  }
  
  /**
   * Update simulation parameters at runtime
   */
  setUniforms(uniforms: Partial<FluidSimulationConfig>): void {
    let refreshFrameState = false;
    if (uniforms.velocityDissipation !== undefined) {
      this.config.velocityDissipation = uniforms.velocityDissipation;
      refreshFrameState = true;
    }
    if (uniforms.timeStep !== undefined) {
      this.config.timeStep = uniforms.timeStep;
      this.updateForFrame(uniforms.timeStep);
    }
    if (uniforms.forceStrength !== undefined) {
      this.forceApplication.setUniforms({ forceStrength: uniforms.forceStrength });
      this.config.forceStrength = uniforms.forceStrength;
    }
    if (uniforms.pressureIterations !== undefined) {
      this.pressureIterator.setIterations(uniforms.pressureIterations);
      this.config.pressureIterations = uniforms.pressureIterations;
    }
    if (uniforms.dyeDissipation !== undefined) {
      this.config.dyeDissipation = uniforms.dyeDissipation;
      refreshFrameState = true;
    }
    if (uniforms.pressure !== undefined) {
      this.config.pressure = uniforms.pressure;
      this.pressureIterator.setDamping(uniforms.pressure);
    }
    if (uniforms.vorticityStrength !== undefined) {
      this.config.vorticityStrength = uniforms.vorticityStrength;
      this.vorticityEffect.setUniforms({
        curlStrength: (this.config.enableVorticity ?? true) ? uniforms.vorticityStrength : 0,
        timeStep: this.currentTimeStep,
      });
    }
    if (uniforms.enableVorticity !== undefined) {
      this.config.enableVorticity = uniforms.enableVorticity;
      this.vorticityEffect.setUniforms({
        curlStrength: uniforms.enableVorticity ? (this.config.vorticityStrength ?? 0) : 0,
        timeStep: this.currentTimeStep,
      });
    }
    if (uniforms.dyeInjectionStrength !== undefined) {
      this.config.dyeInjectionStrength = uniforms.dyeInjectionStrength;
      this.dyeForceApplication.setUniforms({ injectionStrength: uniforms.dyeInjectionStrength });
    }
    if (refreshFrameState) {
      this.updateForFrame(this.currentTimeStep);
    }
  }
  
  /**
   * Render the entire fluid simulation pipeline
   */
  renderAll(engine: BABYLON.Engine): void {
    // Rendering dyeAdvection triggers all upstream dependencies:
    // dyeAdvection depends on projection
    // projection depends on pressureIterator and vorticityEffect
    // vorticityEffect depends on forceApplication and curlEffect
    // curlEffect depends on forceApplication
    // pressureIterator depends on divergence
    // divergence depends on vorticityEffect
    // forceApplication depends on velocityAdvection
    // velocityAdvection depends on velocityFeedback
    this.dyeAdvection.renderAll(engine);
  }
  
  /**
   * Dispose all internal resources
   */
  dispose(): void {
    this.velocityAdvection.dispose();
    this.forceApplication.dispose();
    this.curlEffect.dispose();
    this.vorticityEffect.dispose();
    this.divergenceEffect.dispose();
    this.pressureIterator.dispose();
    this.projection.dispose();
    this.dyeAdvection.dispose();
    this.velocityFeedback.dispose();
    this.dyeFeedback.dispose();
    this.dyeForceApplication.dispose();
  }
}
