<script setup lang="ts">
import { inject, ref } from 'vue';
import { appStateName, type TemplateAppState } from './appState'


const appState = inject<TemplateAppState>(appStateName)!!

//get size of window
const windowWidth = window.innerWidth
const windowHeight = window.innerHeight

appState.resolution = { width: windowWidth, height: windowHeight }

const resRef = ref({ width: windowWidth, height: windowHeight })

</script>

<template>
  <div id="canvasContainer" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}">
    <canvas id="p5Canvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
  </div>
</template>


<style scoped>
#canvasContainer {
  background-color: black;
}

#p5Canvas {
  border: 1px solid black;
  /* position: absolute; */
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