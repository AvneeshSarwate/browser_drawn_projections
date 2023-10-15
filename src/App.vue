<script setup lang="ts">
import { commandHistory } from './stores/undoCommands';
import { provide } from 'vue';
import OneshotCode from './components/OneshotCode.vue';
import { globalStore } from './stores/stateInitializer';
import type { DevelopmentAppState } from './sketches/devTest/developmentAppState';
import SketchWrapper from './sketches/devTest/SketchWrapper.vue';


const store = globalStore()

const appState = store.appStateRef as DevelopmentAppState

provide('appState', appState)

</script>

<template>
  <div id="controlContainer">
    <button @click="commandHistory.undo">Undo</button>
    <button @click="commandHistory.redo">Redo</button>
  </div>
  
  <SketchWrapper></SketchWrapper>

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


</style>
