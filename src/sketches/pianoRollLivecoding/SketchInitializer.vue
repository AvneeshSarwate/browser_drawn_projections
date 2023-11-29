<script setup lang="ts">
import { createP5Sketch } from './p5Sketch';
import { appStateName, type ClickAVAppState } from './appState';
import type p5 from 'p5';
import * as THREE from 'three';
import { inject, onMounted, onUnmounted } from 'vue';


const appState = inject<ClickAVAppState>(appStateName)!!

const neutralizeSketch = (instance: p5) => {
  instance.noLoop()
  instance.draw = () => { }
  instance.mousePressed = () => { }
  instance.mouseReleased = () => { }
  instance.mouseDragged = () => { }
  instance.mouseMoved = () => { }
  instance.keyPressed = () => { }
  instance.keyReleased = () => { }
  instance.keyTyped = () => { }
  instance.windowResized = () => { }
  instance.doubleClicked = () => { }
  instance.mouseWheel = () => { }
  instance.touchStarted = () => { }
  instance.touchMoved = () => { }
  instance.touchEnded = () => { }
  instance.deviceMoved = () => { }
  instance.deviceTurned = () => { }
  instance.deviceShaken = () => { }
  instance.preload = () => { }
  instance.setup = () => { }
}


onMounted(() => {
  //explanation - the closest you can get to removing a p5 instance without removing the underlying canvas
  if(appState.p5Instance) neutralizeSketch(appState.p5Instance)

  const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
  const p5Instance = createP5Sketch(p5Canvas, () => appState)
  p5Instance.disableFriendlyErrors = true //explanation - for performance
  appState.p5Instance = p5Instance

  appState.threeRenderer = new THREE.WebGLRenderer({canvas: document.getElementById('threeCanvas') as HTMLCanvasElement})
})

onUnmounted(() => {
  if (appState.p5Instance) {
    neutralizeSketch(appState.p5Instance)
    document.getElementsByClassName('frameRateStats')[0].remove() 
  }
})


</script>

<template>
  <div></div> 
  <!-- explanation: moving canvas to App.vue and outside of this component allows us
  to hot-reload the sketch itself without recreating the canvas element and 
  causing a flicker. -->
</template>

<style scoped></style>@/stores/undoCommands