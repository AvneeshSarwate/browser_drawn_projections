<script setup lang="ts">
import { createP5Sketch } from './p5Sketch';
import { appStateName, type TemplateAppState } from './appState';
import type p5 from 'p5';
import * as THREE from 'three';
import { inject, onMounted, onUnmounted } from 'vue';

//@ts-ignore
import Stats from '@/rendering/Stats';


const appState = inject<TemplateAppState>(appStateName)!!

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
  const stats = new Stats();
  stats.showPanel(1); // 0: fps, 1: ms, 2: mb, 3+: custom
  appState.stats = stats
  // document.body.appendChild(stats.dom);

  document.body.style.backgroundColor = "rgb(0, 0, 0, 0)"
  const inTDQueryParam = new URLSearchParams(window.location.search).get("inTD")
  if(inTDQueryParam === "true") {
    const canvasContainer = document.getElementById('canvasContainer')
    if(canvasContainer) {
      canvasContainer.style.backgroundColor = "rgb(0, 0, 0, 0)"
      console.log("setting canvasContainer background color to black")
    } else {
      document.body.appendChild(stats.dom);
    }
  }

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
  }
  document.getElementsByClassName('frameRateStats')[0]?.remove()

  //todo hotreload - for cleaning up threeRenderer, anything more than calling dispose()?
  appState.threeRenderer?.dispose()
  
})


</script>

<template>
  <div></div> 
  <!-- explanation: moving canvas to App.vue and outside of this component allows us
  to hot-reload the sketch itself without recreating the canvas element and 
  causing a flicker. -->
</template>

<style scoped></style>@/stores/undoCommands