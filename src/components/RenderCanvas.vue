<script setup lang="ts">
import { createP5Sketch } from '@/rendering/rendering';
import { Region, type AppState } from '@/stores/stores';
import p5 from 'p5';
import { inject, onMounted, onUnmounted } from 'vue';


const appState = inject('appState') as AppState  

const reg = (i: number) => appState.regions.list[i]


onMounted(() => {

  const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
  const p5Instance = createP5Sketch(p5Canvas, () => appState)
  // reg(0).draw2 = (reg: Region, p5: p5) => {
  //   reg.points.list.forEach(p => {
  //     p5.circle(p.x, p.y, 10)
  //   })
  // }

})

onUnmounted(() => {

})


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