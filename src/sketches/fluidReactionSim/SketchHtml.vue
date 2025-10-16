<template>
  <div class="container">
    <canvas id="simulationCanvas" :width="width" :height="height"></canvas>
    <div class="instructions">
      <h2>Fluid + Reaction Diffusion Playground</h2>
      <p>Drag on the canvas to stir the fluid and seed the Gray–Scott reaction. Hold to inject more pigment.</p>
      <p>Press <strong>P</strong> to pause or resume the simulation.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'
import { appStateName, type FluidReactionAppState } from './appState'

const state = inject<FluidReactionAppState>(appStateName)!!
const width = computed(() => state.width)
const height = computed(() => state.height)
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: #08090f;
  color: #dde0ff;
  min-height: 100vh;
}

#simulationCanvas {
  border: 1px solid rgba(255, 255, 255, 0.2);
  width: min(90vw, 1024px);
  height: auto;
  aspect-ratio: attr(width) / attr(height);
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
  margin: 0;
  font-size: 1.3rem;
}
</style>
