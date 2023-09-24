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
  appState.p5Instance = p5Instance
})

onUnmounted(() => {

})


</script>

<template>
  <canvas id="p5Canvas" width="1280" height="720"></canvas>
</template>

<style scoped>



#p5Canvas {
  border: 1px solid black;
  width: 100%;
  height: 100%;
}
</style>