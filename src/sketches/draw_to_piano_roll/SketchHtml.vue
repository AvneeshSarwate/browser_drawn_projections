<script setup lang="ts">
import { ref } from 'vue';
import { resolution } from './appState'

const resRef = ref(resolution)

</script>

<template>
  <div class="sketch-container">
    <div id="canvasContainer" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}">
      <canvas id="p5Canvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
      <canvas id="threeCanvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
    </div>
    <div id="description">
      <p>Draw notes in the canvas to create melodies in the piano roll</p>
    </div>
    <div id="debugInfo"></div>
  </div>
</template>

<style scoped>
.sketch-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

#canvasContainer {
  background-color: black;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

#p5Canvas {
  border: none;
  top: 0;
  left: 0;
  z-index: -1;
  visibility: hidden;
}

#threeCanvas {
  border: none;
  position: absolute;
  top: 0;
  left: 0;
  visibility: visible;
}

#description {
  text-align: center;
  color: #4a5568;
  font-size: 0.85rem;
  font-weight: 500;
  margin: 0;
}

#description p {
  margin: 0;
  padding: 0;
}

#debugInfo {
  min-height: 0;
}
</style>