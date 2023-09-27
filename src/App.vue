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
  <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  <SketchInitializer ></SketchInitializer>
  <LivecodeHolder></LivecodeHolder>
  <button @click="commandHistory.undo">Undo</button>
  <button @click="commandHistory.redo">Redo</button>
</template>

<style scoped>

#p5Canvas {
  border: 1px solid black;
  width: 100%;
  height: 100%;
}

</style>
