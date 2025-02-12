<script setup lang="ts">
import { ref } from 'vue';
import { resolution } from './appState'

const resRef = ref(resolution)

</script>

<template>
  <div id="instructions">
    This page is best viewed on desktop in the Chrome browser.
  </div>
  <div id="canvasContainer" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}">
    <canvas id="p5Canvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
  </div>
  <div id="description">
  </div>
  <div id="debugInfo"></div>
</template>


<style scoped>

#instructions {
  margin-left: 30px;
  margin-bottom: 10px;
  margin-top: 30px;
}

#canvasContainer {
  background-color: black;
  position: relative;
  margin-left: 30px;
}

#p5Canvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  visibility: hidden;
}

#threeCanvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
  visibility: visible;
}
</style>