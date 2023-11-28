<script setup lang="ts">
import { commandHistory } from './stores/undoCommands';
import { provide } from 'vue';
import OneshotCode from './components/OneshotCode.vue';
import { globalStore, getUrlSketch, type sketchNames } from './stores/stateInitializer';
import TonePianoSequencer from './sketches/tonePianoSequencer/SketchWrapper.vue';
import Three5Example from './sketches/three5Example/SketchWrapper.vue';
import ClickAVMelodyLauncher from './sketches/clickAVMelodyLauncher/SketchWrapper.vue';
import PianoRollMelodyLauncher from './sketches/pianoRollMelodyLauncher/SketchWrapper.vue';
import PianoRollLivecoding from './sketches/pianoRollLivecoding/SketchWrapper.vue';
import { RouterView } from 'vue-router'


const sketchStates: Record<sketchNames, any> = {
  three5Example: Three5Example,
  clickAVMelodyLauncher: ClickAVMelodyLauncher,
  pianoRollMelodyLauncher: PianoRollMelodyLauncher,
  pianoRollLivecoding: PianoRollLivecoding,
  notInSet: "notInSet"
}

const comp = sketchStates[getUrlSketch()]

const store = globalStore()

const appState = store.appStateRef

const isRouterComp = comp === "notInSet"
console.log("isRouterComp", isRouterComp, comp)

if(!isRouterComp) {
  provide('appState', appState)
}

</script>

<template>
  <div id="controlContainer">
    <button @click="commandHistory.undo">Undo</button>
    <button @click="commandHistory.redo">Redo</button>
  </div>
  
  <!-- <DevSketch></DevSketch> -->

  <component v-if="!isRouterComp" :is="comp"></component>
  <RouterView v-else></RouterView>

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