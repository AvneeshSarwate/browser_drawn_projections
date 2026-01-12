<script setup lang="ts">
import { ref } from 'vue';
import { resolution } from './appState'
import PopoutWindow from '@/components/PopoutWindow.vue'

const resRef = ref(resolution)

const dpr = window.devicePixelRatio || 1
const popped = ref(false)
const poppedControls = ref(false)
</script>

<template>
  <div class="canvas-page">
    <PopoutWindow v-model="popped" title="Canvas" :width="resRef.width" :height="resRef.height">
      <div id="canvasContainer" :style="{
        width: popped ? '100%' : resRef.width + 'px',
        height: popped ? '100%' : resRef.height + 'px'
      }">
        <canvas id="p5Canvas" :width="resRef.width * dpr" :height="resRef.height * dpr" :style="{
          width: popped ? '100%' : resRef.width + 'px',
          height: popped ? '100%' : resRef.height + 'px'
        }" abitrary-prop="somethi"></canvas>
        <canvas id="threeCanvas" :width="resRef.width * dpr" :height="resRef.height * dpr" :style="{
          width: popped ? '100%' : resRef.width + 'px',
          height: popped ? '100%' : resRef.height + 'px'
        }" abitrary-prop="somethi"></canvas>
      </div>
    </PopoutWindow>
    <PopoutWindow v-model="poppedControls" title="Controls">
      <div id="slider-controls-target"></div>
    </PopoutWindow>
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
  position: relative;
  background-color: black;
  display: inline-block;
}

#canvasContainer canvas {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
}

#p5Canvas {
  border: 1px solid black;
  z-index: 0;
  visibility: hidden;
}

#threeCanvas {
  border: 1px solid black;
  z-index: 1;
  visibility: visible;
}

#slider-controls-target {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 8px;
  min-width: 850px;
}
</style>
