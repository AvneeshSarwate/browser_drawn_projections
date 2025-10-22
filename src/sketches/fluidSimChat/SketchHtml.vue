<template>
  <div class="container">
    <div class="canvas-controls-wrapper">
      <div class="controls">
        <div class="control-group" v-for="param in fluidParams" :key="param.name">
          <label>{{ param.label }}</label>
          <input type="range" :min="param.min" :max="param.max" :step="param.step" v-model.number="param.value.value" />
          <input type="number" :min="param.min" :max="param.max" :step="param.step" v-model.number="param.value.value"
            class="value-input" />
        </div>
      </div>
      <div class="canvas-column">
        <div class="canvas-group">
          <div class="canvas-label">Fluid Simulation</div>
          <canvas id="fluidCanvas" :width="width" :height="height"></canvas>
        </div>
      </div>
    </div>

    <div class="instructions">
      <h2>Fluid Simulation Playground</h2>
      <p>Drag on the canvas to interact with the fluid.</p>
      <p>Press <strong>P</strong> to pause/resume. Press <strong>1-6</strong> or <strong>[ ]</strong> to cycle debug
        views.</p>

      <div class="debug-info">
        <h3>{{ currentDebugInfo.title }}</h3>
        <p>{{ currentDebugInfo.description }}</p>
      </div>

      <div class="debug-shortcuts">
        <strong>Quick Keys:</strong> 1-Dye | 2-Velocity | 3-Divergence | 4-Pressure | 5-Splat | 6-Splat Raw | [ ] Cycle
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, ref } from 'vue'
import { appStateName, type FluidReactionAppState, type FluidDebugMode } from './appState'

const state = inject<FluidReactionAppState>(appStateName)!!
const width = computed(() => state.width)
const height = computed(() => state.height)

const fluidParams = [
  { name: 'densityDissipation', label: 'Density Dissipation', min: 0.0, max: 1.0, step: 0.01, value: ref(1.0) },
  { name: 'velocityDissipation', label: 'Velocity Dissipation', min: 0.0, max: 4.0, step: 0.05, value: ref(0.2) },
  { name: 'pressure', label: 'Pressure Damping', min: 0.0, max: 1.0, step: 0.01, value: ref(0.8) },
  { name: 'pressureIterations', label: 'Pressure Iterations', min: 1, max: 80, step: 1, value: ref(20) },
  { name: 'curl', label: 'Vorticity', min: 0, max: 60, step: 1, value: ref(30) },
  { name: 'splatRadius', label: 'Splat Radius', min: 0.01, max: 1.0, step: 0.01, value: ref(0.25) },
  { name: 'forceStrength', label: 'Splat Force', min: 0, max: 20000, step: 100, value: ref(6000) },
  { name: 'dyeInjectionStrength', label: 'Dye Injection', min: 0.0, max: 2.0, step: 0.01, value: ref(0.65) },
]

// Export params so LivecodeHolder can access them
state.fluidParams = fluidParams

// Debug mode descriptions with more context
const debugModeDescriptions: Record<FluidDebugMode, { title: string; description: string }> = {
  dye: {
    title: 'Dye Visualization',
    description: 'This view shows colored "dye" particles being carried along by the fluid flow. The dye doesn\'t affect the fluid itself—it\'s a passive tracer that reveals the motion and swirling patterns (vortices) in the flow. As you drag, the dye gets pulled along the velocity field through a process called advection, showing you exactly how the fluid is moving. Watch how the colors mix and swirl together, creating beautiful patterns that demonstrate the fluid\'s turbulent behavior.',
  },
  velocity: {
    title: 'Velocity Field',
    description: 'This visualization shows the fluid\'s velocity at every point—both its direction and speed. Brighter or more saturated colors indicate faster-moving fluid, while the hue or vector direction shows which way it\'s flowing. This is the fundamental quantity in fluid simulation: it tells you where the fluid is going and how quickly. When you drag, you\'re directly modifying this velocity field by adding momentum. The velocity field then carries itself forward through self-advection.',
  },
  divergence: {
    title: 'Divergence Field',
    description: 'Divergence measures whether velocity is "spreading out" (diverging) or "squeezing in" (converging) at each point. Positive values (bright areas) mean fluid is spreading out like a source, while negative values (dark areas) mean it\'s being compressed like a sink. For an incompressible fluid like water, divergence should be zero everywhere—the simulation enforces this by computing pressure. If you see non-zero divergence, it means the pressure solver needs to "push back" to keep the fluid from compressing or expanding.',
  },
  pressure: {
    title: 'Pressure Field',
    description: 'Pressure is the invisible force that prevents the fluid from compressing. When velocity tries to create divergence (compression or expansion), the simulation solves for pressure and uses it to correct the velocity back to an incompressible state. High pressure (bright) pushes fluid outward, low pressure (dark) pulls it inward. This is computed using the Poisson equation and creates the "squishy" behavior you expect from liquids. Pressure is what makes fluid flow around obstacles and creates the characteristic swirling patterns.',
  },
  splat: {
    title: 'Applied Forces (Splat)',
    description: 'This shows the actual forces being applied to the fluid during the current frame, typically from your mouse or touch input. When you drag, you\'re adding momentum (velocity) at a specific location, creating a "splat" of force. The color and direction encode both the strength and direction of the impulse. This force is then added to the existing velocity field before the simulation computes the next time step. The splat uses a Gaussian (bell curve) shape to create a smooth, localized push.',
  },
  splatRaw: {
    title: 'Raw Splat Impulse',
    description: 'This shows the pure Gaussian "blob" shape of your input before it\'s converted into a directional force. It\'s a smooth, circular falloff centered on your click or drag position—essentially the spatial influence function. The raw splat represents "how much" force to apply at each point near your input, independent of direction. When this gets multiplied by your drag direction and added to the velocity field, it becomes the directional splat you see in the previous view.',
  },
}

const currentDebugInfo = computed(() => debugModeDescriptions[state.debugMode.value])
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  padding: 20px;
  background: #08090f;
  color: #dde0ff;
  min-height: 100vh;
}



.canvas-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.canvas-label {
  font-size: 0.9rem;
  color: #aaa;
  text-align: center;
}

canvas {
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: crosshair;
  touch-action: none;
  background: black;
}

.instructions {
  max-width: 800px;
  font-size: 0.95rem;
  line-height: 1.4;
  text-align: center;
}

.instructions h2 {
  margin: 0 0 10px 0;
  font-size: 1.3rem;
}

.debug-info {
  margin: 20px 0;
  padding: 15px 20px;
  background: rgba(102, 122, 255, 0.1);
  border-left: 3px solid #667aff;
  border-radius: 6px;
  text-align: left;
}

.debug-info h3 {
  margin: 0 0 10px 0;
  font-size: 1.1rem;
  color: #99aaff;
}

.debug-info p {
  margin: 0;
  line-height: 1.6;
  font-size: 0.95rem;
}

.debug-shortcuts {
  margin-top: 15px;
  font-size: 0.85rem;
  color: #aaa;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.canvas-controls-wrapper {
  display: flex;
  gap: 15px;
  align-items: flex-start;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  min-width: 200px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-group label {
  font-size: 0.85rem;
  color: #aaa;
}

.control-group input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #667aff;
  border-radius: 50%;
  cursor: pointer;
}

.control-group input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #667aff;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.value-input {
  width: 100%;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #dde0ff;
  font-size: 0.85rem;
}

.canvas-column {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
</style>
