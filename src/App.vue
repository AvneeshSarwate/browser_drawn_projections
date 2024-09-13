<script setup lang="ts">
import { commandHistory } from './stores/undoCommands';
import OneshotCode from './components/OneshotCode.vue';
import { getUrlSketch, type sketchNames } from './stores/stateInitializer';
import { RouterView } from 'vue-router'


const sketchStates: Record<sketchNames, any> = {
  notInSet: "notInSet"
}

const comp = sketchStates[getUrlSketch()]


const isRouterComp = comp === "notInSet"
console.log("isRouterComp", isRouterComp, comp)


</script>

<template>
  <!-- <div id="controlContainer">
    <button @click="commandHistory.undo">Undo</button>
    <button @click="commandHistory.redo">Redo</button>
  </div> -->
  
  <!-- <DevSketch></DevSketch> -->

    <div v-if="!isRouterComp">
      No page at this path!
    </div>
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