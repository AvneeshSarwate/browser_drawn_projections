<script setup lang="ts">
import { ref } from 'vue';
import { resolution } from './appState'

const resRef = ref(resolution)
</script>

<template>
  <div id="canvasContainer" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}">
    <canvas id="p5Canvas" :width="resRef.width" :height="resRef.height"></canvas>
    <canvas id="threeCanvas" :width="resRef.width" :height="resRef.height"></canvas>
  </div>
  <!-- Description removed in favor of UI controls in LivecodeHolder.vue -->
  <div id="debugInfo" class="status-panel"></div>
</template>

<style scoped>
#canvasContainer {
  background-color: black;
  position: relative;
  margin: 0 auto;
}

#p5Canvas {
  border: 1px solid #333;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
}

#threeCanvas {
  border: 1px solid #333;
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  visibility: visible;
}

.status-panel {
  margin: 10px auto;
  max-width: 800px;
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}
</style>