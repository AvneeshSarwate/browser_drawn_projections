<script setup lang="ts">
import { ref } from 'vue';
import { resolution } from '@/components/handwritingTool'

const resRef = ref(resolution)

</script>

<template>
  <div id="canvasContainer" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}">
    <canvas id="p5Canvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
  </div>
  <div id="description">
    <p>Press D to enter draw mode</p>
    <p>Press S to add a circle</p>
    <p>Press F to animate the circle arrangement</p>
  </div>
  <div id="debugInfo"></div>
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