<template>
  <div class="container">
    <div class="columns-wrapper">
      <div class="column">
        <div class="label">Fluid Simulation</div>
        <div class="canvas-group">
          <div class="canvas-label">Input (Force Field)</div>
          <canvas id="forceCanvas" :width="width" :height="height"></canvas>
        </div>
        <div class="canvas-group">
          <div class="canvas-label">Simulation Output</div>
          <canvas id="fluidCanvas" :width="width" :height="height"></canvas>
        </div>
      </div>
      
      <div class="column">
        <div class="label">Reaction Diffusion</div>
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
    
    <div class="instructions">
      <h2>Fluid + Reaction Diffusion Playground</h2>
      <p>Drag on the INPUT canvases to interact. Left: stir fluid forces. Right: seed reaction patterns.</p>
      <p>Press <strong>P</strong> to pause/resume.</p>
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
</style>
