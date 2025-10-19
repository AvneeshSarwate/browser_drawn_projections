# Fluid Reaction Sim – Analysis Log

- Reviewed the original WebGL implementation in `src/sketches/fluidReactionSim/pavelFluid.js` to map the sequence of velocity/dye passes and confirm that `splat()` writes directly into the shared double-FBO targets before the simulation step.
- Traced the WebGPU port in `src/rendering/fluidSimulation/FluidSimulationEffect.ts`, noting how the feedback graph is assembled with `FeedbackNode`, `VelocityAdvectionEffect`, and the `SplatEffect` → `AddEffect` chain.
- Identified that the `FeedbackNode` swaps back to the projection texture after its first render each frame, so the second request for `velocityAdvection` (triggered via the curl pass) samples the pre-splat state, preventing divergence/pressure from ever seeing the injected momentum.
- Observed that the port’s `AddEffect` re-adds the already-composited splat texture, doubling the base velocity field instead of matching the original “write once, swap buffers” behavior.
- Compiled comparison notes to summarize the pass-network mismatches and explain why the splat debug output is decoupled from the main simulation textures.
