import * as BABYLON from 'babylonjs';
import {
  CustomShaderEffect,
  type MaterialHandles,
  type RenderPrecision,
  type ShaderSource,
  createPassthruMaterial,
} from '../shaderFXBabylon';
import { createPressureJacobiMaterial } from './pressureJacobi.frag.generated';
import { createPressureDampMaterial, type PressureDampUniforms } from './pressureDamp.frag.generated';

export interface PressureIteratorInputs {
  divergence: ShaderSource;
  initialPressure?: ShaderSource;
}

/**
 * PressureIterator: Efficiently solves the pressure Poisson equation using Jacobi iterations.
 * 
 * This class runs N Jacobi iterations internally with only 2 ping-pong buffers,
 * avoiding the memory overhead of N separate FeedbackNode loops (which would require 40+ buffers).
 * 
 * Key features:
 * - Memory efficient: uses only 3 RTTs total (2 internal ping-pong + 1 stable output)
 * - Configurable iteration count (default: 20)
 * - Proper buffer swapping within a single frame
 * - Stable output texture for downstream consumers
 */
export class PressureIterator extends CustomShaderEffect<
  Record<string, never>,
  PressureIteratorInputs
> {
  effectName = 'PressureIterator';
  
  private iterations: number;
  private pressureRT0!: BABYLON.RenderTargetTexture;
  private pressureRT1!: BABYLON.RenderTargetTexture;
  private jacobiMaterial: MaterialHandles<Record<string, never>, string>;
  private copyMaterial: MaterialHandles<Record<string, never>, string>;
  private dampMaterial: MaterialHandles<PressureDampUniforms, string>;
  private pressureDamping = 0.8;
  private hasPreviousPressure = false;
  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: PressureIteratorInputs,
    width: number,
    height: number,
    sampleMode: 'nearest' | 'linear' = 'nearest',
    precision: RenderPrecision = 'half_float',
    iterations: number = 20
  ) {
    super(engine, inputs, {
      factory: createPressureJacobiMaterial,
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
    
    // Create material for final copy to stable output
    this.copyMaterial = createPassthruMaterial(this.scene, { 
      name: 'PressureCopyMaterial' 
    });
    this.dampMaterial = createPressureDampMaterial(this.scene, { name: 'PressureDampMaterial' });
    this.dampMaterial.setUniforms({ scale: this.pressureDamping });
    
    this.allocatePingPongBuffers();
  }

  /**
   * Update the number of Jacobi iterations to run.
   * More iterations = better convergence but slower.
   */
  setIterations(n: number): void {
    this.iterations = Math.max(1, Math.floor(n));
  }

  private allocatePingPongBuffers(): void {
    this.pressureRT0?.dispose();
    this.pressureRT1?.dispose();
    
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
    this.hasPreviousPressure = false;
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
    target.renderList = [this.quad];
    this.quad.material = material.material;
    this.quad.isVisible = true;
    
    target.render(true);
    
    this.quad.isVisible = false;
    target.renderList = null;
  }

  private clearTarget(target: BABYLON.RenderTargetTexture, value: number): void {
    const previousRenderList = target.renderList;
    const previousClearColor = target.clearColor ? target.clearColor.clone() : undefined;
    const clearColor = new BABYLON.Color4(value, value, value, 1);
    target.clearColor = clearColor;
    target.renderList = null;
    target.render(true);
    target.renderList = previousRenderList;
    target.clearColor = previousClearColor ?? new BABYLON.Color4(0, 0, 0, 0);
  }

  private resolveTextureSource(source: ShaderSource): BABYLON.BaseTexture | undefined {
    // Only handle BaseTexture directly for initial pressure seeding
    // Canvas sources are not supported for initial pressure (pressure starts at 0 by default)
    if (source instanceof BABYLON.BaseTexture) {
      return source;
    }
    return undefined;
  }

  override render(engine: BABYLON.Engine): void {
    const resolved = this.resolveInputTextures();
    const divergence = resolved.divergence as BABYLON.BaseTexture;
    
    this.ensureSizeMatch();
    
    const sampler = this.sampler ?? this.defaultSampler;
    
    let readBuffer = this.pressureRT0;
    let writeBuffer = this.pressureRT1;
    
    if (this.hasPreviousPressure && this.pressureDamping > 0) {
      this.dampMaterial.setUniforms({ scale: this.pressureDamping });
      this.dampMaterial.setTexture('src', this.output);
      this.dampMaterial.setTextureSampler('src', sampler);
      this.renderToTarget(readBuffer, this.dampMaterial);
    } else {
      this.clearTarget(readBuffer, 0.0);
    }
    this.clearTarget(writeBuffer, 0.0);
    
    // Optional: seed with initial pressure
    if (this.inputs.initialPressure) {
      const initialPressure = this.resolveTextureSource(
        this.inputs.initialPressure
      );
      
      if (initialPressure) {
        this.copyMaterial.setTexture('src', initialPressure);
        this.copyMaterial.setTextureSampler('src', sampler);
        this.renderToTarget(readBuffer, this.copyMaterial);
      }
    }
    
    // Run N Jacobi iterations with ping-pong swapping
    for (let i = 0; i < this.iterations; i++) {
      this.jacobiMaterial.setTexture('pressure', readBuffer);
      this.jacobiMaterial.setTextureSampler('pressure', sampler);
      this.jacobiMaterial.setTexture('divergence', divergence);
      this.jacobiMaterial.setTextureSampler('divergence', sampler);
      
      this.renderToTarget(writeBuffer, this.jacobiMaterial);
      
      // Swap buffers for next iteration
      const temp = readBuffer;
      readBuffer = writeBuffer;
      writeBuffer = temp;
    }
    
    // Copy final result to stable output RTT
    // (readBuffer now contains the converged pressure field)
    this.copyMaterial.setTexture('src', readBuffer);
    this.copyMaterial.setTextureSampler('src', sampler);
    this.renderToTarget(this.output, this.copyMaterial);
    this.hasPreviousPressure = true;
  }

  override dispose(): void {
    this.pressureRT0?.dispose();
    this.pressureRT1?.dispose();
    this.dampMaterial.material.dispose(true, false);
    super.dispose();
  }

  setDamping(value: number): void {
    this.pressureDamping = Math.min(Math.max(value, 0), 1);
    this.dampMaterial.setUniforms({ scale: this.pressureDamping });
  }

  override setSrcs(inputs: Partial<PressureIteratorInputs>): void {
    if (inputs.divergence !== undefined) {
      this.inputs.divergence = inputs.divergence;
    }
    if (inputs.initialPressure !== undefined) {
      this.inputs.initialPressure = inputs.initialPressure;
    }
  }

  override setUniforms(_uniforms: Record<string, unknown>): void {
    // No uniforms needed for pressure iteration
  }

  override updateUniforms(): void {
    // No uniforms to update
  }
}
