import * as BABYLON from 'babylonjs';
import {
  PassthruEffect,
  FeedbackNode,
  type RenderPrecision,
} from '../shaderFXBabylon';
import { VelocityAdvectionEffect } from './velocityAdvection.frag.generated';
import { CurlEffect } from './curl.frag.generated';
import { VorticityConfinementEffect } from './vorticityConfinement.frag.generated';
import { DivergenceEffect } from './divergence.frag.generated';
import { GradientSubtractionEffect } from './gradientSubtraction.frag.generated';
import { DyeAdvectionEffect } from './dyeAdvection.frag.generated';
import { PressureIterator } from './PressureIterator';
import { SplatUnifiedEffect } from './splat_unified.frag.generated';

export interface FluidSimulationInputs {}

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
  private curlEffect: CurlEffect;
  private vorticityEffect: VorticityConfinementEffect;
  private divergenceEffect: DivergenceEffect;
  private pressureIterator: PressureIterator;
  private projection: GradientSubtractionEffect;
  private velocitySplatUnified: SplatUnifiedEffect;
  
  // Dye pipeline components
  private dyeFeedback: FeedbackNode;
  private dyeAdvection: DyeAdvectionEffect;
  private dyeSplatUnified: SplatUnifiedEffect;
  private currentTimeStep: number;
  private readonly aspectRatio: number;
  
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

  /** Latest velocity splat contribution (for debugging) */
  public get splat(): BABYLON.RenderTargetTexture {
    return this.velocitySplatUnified.output;
  }

  /** Debug: Dye feedback output */
  public get dyeFeedbackDebug(): BABYLON.RenderTargetTexture {
    return this.dyeFeedback.output;
  }

  /** Debug: Dye splat output */
  public get dyeSplatDebug(): BABYLON.RenderTargetTexture {
    return this.dyeSplatUnified.output;
  }

  constructor(
    engine: BABYLON.WebGPUEngine,
    _inputs: FluidSimulationInputs | undefined,
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
    this.aspectRatio = config.simWidth / config.simHeight;
    
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
    
    // Unified splat nodes - support passthrough and additive modes
    this.velocitySplatUnified = new SplatUnifiedEffect(
      engine,
      { base: this.velocityFeedback },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.velocitySplatUnified.setUniforms({
      mode: 0,
      strength: 1.0,
      point: [0.5, 0.5],
      color: [0, 0, 0],
      radius: 0.01,
      aspectRatio: this.aspectRatio,
    });
    
    // 2. Velocity advection (semi-Lagrangian backtrace)
    this.velocityAdvection = new VelocityAdvectionEffect(
      engine,
      { velocity: this.velocitySplatUnified },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.velocityAdvection.setUniforms({
      timeStep: config.timeStep,
      dissipation: 1.0,
    });
    
    // 3. Curl + vorticity confinement to reinforce swirling motion
    this.curlEffect = new CurlEffect(
      engine,
      { velocity: this.velocityAdvection },
      simWidth,
      simHeight,
      'nearest',
      precision
    );
    this.vorticityEffect = new VorticityConfinementEffect(
      engine,
      {
        velocity: this.velocityAdvection,
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

    this.dyeSplatUnified = new SplatUnifiedEffect(
      engine,
      { base: this.dyeFeedback },
      simWidth,
      simHeight,
      sampleMode,
      precision
    );
    this.dyeSplatUnified.setUniforms({
      mode: 0,
      strength: 1.0,
      point: [0.5, 0.5],
      color: [0, 0, 0],
      radius: 0.01,
      aspectRatio: this.aspectRatio,
    });
    
    // 8. Advect dye using projected velocity field
    this.dyeAdvection = new DyeAdvectionEffect(
      engine,
      {
        dye: this.dyeSplatUnified,
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

  applySplat(params: {
    point: [number, number];
    velocityDelta: [number, number];
    dyeColor: [number, number, number];
    radius: number;
  }): void {
    const [px, py] = params.point;
    const [dvx, dvy] = params.velocityDelta;
    const forceScale = this.config.forceStrength ?? 6000;
    const scaledVelocity: [number, number, number] = [dvx * forceScale, dvy * forceScale, 0];
    const [dr, dg, db] = params.dyeColor;
    const scaledColor: [number, number, number] = [dr, dg, db];
    const radius = Math.max(1e-5, params.radius);
    const aspect = this.aspectRatio;

    // Set unified splat uniforms to additive mode (mode=1)
    this.velocitySplatUnified.setUniforms({
      mode: 1,
      point: [px, py],
      color: scaledVelocity,
      radius,
      aspectRatio: aspect,
    });
    
    this.dyeSplatUnified.setUniforms({
      mode: 1,
      point: [px, py],
      color: scaledColor,
      radius,
      aspectRatio: aspect,
    });
  }
  
  /**
   * Update input textures (forces, dye injection, etc.)
   */
  setSrcs(inputs: Partial<FluidSimulationInputs>): void {
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
    // vorticityEffect depends on velocityAdvection and curlEffect
    // curlEffect depends on velocityAdvection
    // pressureIterator depends on divergence
    // divergence depends on vorticityEffect
    // velocityAdvection depends on velocityFeedback
    this.dyeAdvection.renderAll(engine);
    
    // Reset splat mode to passthrough after rendering
    this.velocitySplatUnified.setUniforms({ mode: 0 });
    this.dyeSplatUnified.setUniforms({ mode: 0 });
  }
  
  /**
   * Dispose all internal resources
   */
  dispose(): void {
    this.velocityAdvection.dispose();
    this.curlEffect.dispose();
    this.vorticityEffect.dispose();
    this.divergenceEffect.dispose();
    this.pressureIterator.dispose();
    this.projection.dispose();
    this.dyeAdvection.dispose();
    this.velocityFeedback.dispose();
    this.dyeFeedback.dispose();
    this.velocitySplatUnified.dispose();
    this.dyeSplatUnified.dispose();
  }
}
