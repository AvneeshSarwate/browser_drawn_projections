<script setup lang="ts">
import { commandHistory } from './stores/undoCommands';
import { provide } from 'vue';
import OneshotCode from './components/OneshotCode.vue';
import { globalStore, getUrlSketch, type sketchNames } from './stores/stateInitializer';
import DevSketch from './sketches/devTest/SketchWrapper.vue';
import TemplateSketch from './sketches/template/SketchWrapper.vue';
import TonePianoSequencer from './sketches/tonePianoSequencer/SketchWrapper.vue';


const sketchStates: Record<sketchNames, any> = {
  devTest: DevSketch,
  template: TemplateSketch,
  tonePianoSequencer: TonePianoSequencer,
}

const comp = sketchStates[getUrlSketch()]

const store = globalStore()

const appState = store.appStateRef

provide('appState', appState)

</script>

<template>
  <div id="controlContainer">
    <button @click="commandHistory.undo">Undo</button>
    <button @click="commandHistory.redo">Redo</button>
  </div>
  
  <!-- <DevSketch></DevSketch> -->
  <component :is="comp"></component>

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
