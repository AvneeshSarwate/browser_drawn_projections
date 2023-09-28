<script setup lang="ts">
import { globalStore, commandHistory, type AppState } from './stores/stores';
import SketchInitializer from './components/SketchInitializer.vue';
import LivecodeHolder from './components/LivecodeHolder.vue';
import { provide } from 'vue';


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
  <LivecodeHolder></LivecodeHolder>
</template>

<style scoped>

#controlContainer {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 1;
}

#p5Canvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
  z-index: -1;
}

#threeCanvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
}

</style>
