<template>
  <div class="container">
    <div class="columns-wrapper">
      <div class="column">
        <div class="label">Fluid Simulation</div>
        <div class="canvas-controls-wrapper">
          <div class="controls">
            <div class="control-group" v-for="param in fluidParams" :key="param.name">
              <label>{{ param.label }}</label>
              <input 
                type="range" 
                :min="param.min" 
                :max="param.max" 
                :step="param.step"
                v-model.number="param.value.value"
              />
              <input 
                type="number" 
                :min="param.min" 
                :max="param.max" 
                :step="param.step"
                v-model.number="param.value.value"
                class="value-input"
              />
            </div>
          </div>
          <div class="canvas-column">
            <div class="canvas-group">
              <div class="canvas-label">Input (Force Field)</div>
              <canvas id="forceCanvas" :width="width" :height="height"></canvas>
            </div>
            <div class="canvas-group">
              <div class="canvas-label">Simulation Output</div>
              <canvas id="fluidCanvas" :width="width" :height="height"></canvas>
            </div>
          </div>
        </div>
      </div>
      
      <div class="column">
        <div class="label">Reaction Diffusion</div>
        <div class="canvas-controls-wrapper">
          <div class="controls">
            <div class="control-group" v-for="param in reactionParams" :key="param.name">
              <label>{{ param.label }}</label>
              <input 
                type="range" 
                :min="param.min" 
                :max="param.max" 
                :step="param.step"
                v-model.number="param.value.value"
              />
              <input 
                type="number" 
                :min="param.min" 
                :max="param.max" 
                :step="param.step"
                v-model.number="param.value.value"
                class="value-input"
              />
            </div>
          </div>
          <div class="canvas-column">
            <div class="canvas-group">
              <div class="canvas-label">Input (Seed)</div>
              <canvas id="reactionSeedCanvas" :width="width" :height="height"></canvas>
            </div>
            <div class="canvas-group">
              <div class="canvas-label">Simulation Output</div>
              <canvas id="reactionCanvas" :width="width" :height="height"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="instructions">
      <h2>Fluid + Reaction Diffusion Playground</h2>
      <p>Drag on the INPUT canvases to interact. Left: stir fluid forces. Right: seed reaction patterns.</p>
      <p>Press <strong>P</strong> to pause/resume.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, ref } from 'vue'
import { appStateName, type FluidReactionAppState } from './appState'

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

const reactionParams = [
  { name: 'feed', label: 'Feed Rate', min: 0.01, max: 0.1, step: 0.001, value: ref(0.055) },
  { name: 'kill', label: 'Kill Rate', min: 0.01, max: 0.1, step: 0.001, value: ref(0.062) },
  { name: 'diffRateA', label: 'Diffusion A', min: 0.1, max: 2, step: 0.1, value: ref(1.0) },
  { name: 'diffRateB', label: 'Diffusion B', min: 0.1, max: 2, step: 0.1, value: ref(0.5) },
  { name: 'deltaT', label: 'Time Step', min: 0.1, max: 2, step: 0.1, value: ref(1.0) },
]

// Export params so LivecodeHolder can access them
state.fluidParams = fluidParams
state.reactionParams = reactionParams
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

.columns-wrapper {
  display: flex;
  gap: 30px;
  flex-wrap: wrap;
  justify-content: center;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.label {
  font-size: 1.2rem;
  font-weight: bold;
  text-align: center;
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
  max-width: 720px;
  font-size: 0.95rem;
  line-height: 1.4;
  text-align: center;
}

.instructions h2 {
  margin: 0 0 10px 0;
  font-size: 1.3rem;
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
