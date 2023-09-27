<script setup lang="ts">
import { createP5Sketch } from '@/rendering/rendering';
import { type AppState } from '@/stores/stores';
import { inject, onMounted, onUnmounted } from 'vue';


const appState = inject('appState') as AppState  


onMounted(() => {
  //explanation - the closest you can get to removing a p5 instance without removing the underlying canvas
  appState.p5Instance?.noLoop() 

  const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
  const p5Instance = createP5Sketch(p5Canvas, () => appState)
  p5Instance.disableFriendlyErrors = true //explanation - for performance
  appState.p5Instance = p5Instance
})

onUnmounted(() => {

})


</script>

<template>
  <div></div> 
  <!-- explanation: moving canvas to App.vue and outside of this component allows us
  to hot-reload the sketch itself without recreating the canvas element and 
  causing a flicker. -->
</template>

<style scoped>



#p5Canvas {
  border: 1px solid black;
  width: 100%;
  height: 100%;
}
</style>