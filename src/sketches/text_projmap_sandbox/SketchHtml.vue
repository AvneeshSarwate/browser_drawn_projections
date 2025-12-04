<script setup lang="ts">
import { ref } from 'vue';
import { resolution } from './appState'
import PopoutWindow from '@/components/PopoutWindow.vue'

const resRef = ref(resolution)

const dpr = window.devicePixelRatio || 1
const popped = ref(false)
</script>

<template>
  <div class="canvas-page">
    <PopoutWindow
      v-model="popped"
      title="Canvas"
      :width="resRef.width * 2 + 24"
      :height="resRef.height + 40"
    >
      <div id="canvasContainer">
        <div class="canvas-wrap">
          <div class="label">p5.js</div>
          <canvas
            id="p5Canvas"
            :width="resRef.width * dpr"
            :height="resRef.height * dpr"
            :style="{ width: resRef.width + 'px', height: resRef.height + 'px' }"
            abitrary-prop="somethi"
          ></canvas>
        </div>
        <div class="canvas-wrap">
          <div class="label">BabylonJS</div>
          <canvas
            id="threeCanvas"
            :width="resRef.width * dpr"
            :height="resRef.height * dpr"
            :style="{ width: resRef.width + 'px', height: resRef.height + 'px' }"
            abitrary-prop="somethi"
          ></canvas>
        </div>
      </div>
    </PopoutWindow>
    <div id="description">
      <p>Press D to enter draw mode</p>
      <p>Press S to add a circle</p>
      <p>Press F to animate the circle arrangement</p>
    </div>
    <div id="debugInfo"></div>
  </div>
</template>


<style scoped>
.canvas-page {
  /* min-height: 100vh; */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
}

#canvasContainer {
  display: flex;
  gap: 12px;
  background-color: #0d0d0d;
  padding: 8px;
  border: 1px solid #222;
  border-radius: 6px;
}

.canvas-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.label {
  color: #ccc;
  font-size: 12px;
  letter-spacing: 0.5px;
}

#canvasContainer canvas {
  display: block;
  border: 1px solid #444;
  background: #111;
}
</style>
