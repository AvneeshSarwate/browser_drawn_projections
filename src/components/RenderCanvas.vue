<script setup lang="ts">
import type { AppState } from '@/stores/stores';
import { inject, onMounted, onUnmounted } from 'vue';

onMounted(() => {

})

onUnmounted(() => {

})

//todo - separate playhead and canvas into diff components
//so you can hot reload playhead without reloading canvas.
//Could also link render initialization to mounting of this component?


const appState = inject('appState') as AppState  

</script>

<template>
  <div id="playerContainer">
    <span id="canvasContainer">
      <div style="width: 100px;"> &ThickSpace; </div>
      <canvas id="p5Canvas" width="1280" height="720"></canvas>
    </span>
  </div>
</template>

<style scoped>
#renderCanvas {
  border: 1px solid black;
  width: 100%;
  height: 100%;
}

#playheadContainer {
  position: relative;
  width: 100%;
  height: 20px;
  background-color: #ccc;
}

#playhead {
  position: absolute;
  top: 0;
  left: 0;
  width: 10px;
  height: 100%;
  background-color: #f00;
}

#playerContainer {
  position: relative;
}

#p5Canvas {
  border: 1px solid black;
  width: 100%;
  height: 100%;
}

#canvasContainer {
  display: flex;
  flex-direction: row;
  background-color: rgb(0, 0, 0);
}
</style>