/**
 * Fluid Simulation Module
 * 
 * Complete incompressible fluid simulation implementation following Pavel Dogreat's
 * WebGL-Fluid-Simulation architecture with proper pressure projection.
 * 
 * Key components:
 * - PressureIterator: Efficient Jacobi solver with internal ping-pong (uses only 3 buffers)
 * - FluidSimulationEffect: Complete pipeline wrapper (velocity + dye + pressure projection)
 * 
 * Usage:
 * ```typescript
 * import { FluidSimulationEffect } from '@/rendering/fluidSimulation';
 * 
 * const fluid = new FluidSimulationEffect(engine, { forces: forceCanvas }, {
 *   simWidth: 512,
 *   simHeight: 512,
 *   pressureIterations: 20,
 *   pressure: 0.8,
 *   velocityDissipation: 0.98,
 *   dyeDissipation: 0.995,
 *   forceStrength: 6000,
 *   timeStep: 0.016,
 * });
 * 
 * // Access outputs
 * const dyeTexture = fluid.dye;
 * const velocityTexture = fluid.velocity;
 * 
 * // Update parameters
 * fluid.setUniforms({ pressureIterations: 25 });
 * 
 * // Render
 * fluid.renderAll(engine);
 * ```
 */

export { PressureIterator, type PressureIteratorInputs } from './PressureIterator';
export {
  FluidSimulationEffect,
  type FluidSimulationInputs,
  type FluidSimulationConfig,
} from './FluidSimulationEffect';
export {
  ScalarFieldDebugEffect,
  VelocityFieldDebugEffect,
  type ScalarFieldDebugUniforms,
  type VelocityFieldDebugUniforms,
} from './debugVisualization';
export { SplatEffect, type SplatUniforms, type SplatInputs } from './splat.frag.generated';
export { AddEffect, type AddInputs } from './add.frag.generated';
