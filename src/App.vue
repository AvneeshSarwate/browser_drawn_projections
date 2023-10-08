<script setup lang="ts">
import { globalStore, commandHistory, type AppState } from './stores/stores';
import SketchInitializer from './components/SketchInitializer.vue';
import LivecodeHolder from './components/LivecodeHolder.vue';
import { provide } from 'vue';
import OneshotCode from './components/OneshotCode.vue';


const checkStore = globalStore()

const appState = checkStore.appStateRef as AppState

provide('appState', appState)

</script>

<template>
  <div id="controlContainer">
    <button @click="commandHistory.undo">Undo</button>
    <button @click="commandHistory.redo">Redo</button>
  </div>
  <div>
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <SketchInitializer ></SketchInitializer>
  
  <!-- used for defining "persistent things" aka node graph of stuff -->
  <LivecodeHolder></LivecodeHolder>
  
  <!-- used for used for inspection and fixes -->
  <OneshotCode></OneshotCode>
</template>

<style scoped>

#controlContainer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
  visibility: hidden;
}

#p5Canvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
  /* visibility: hidden; */
}

#threeCanvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
}

</style>
