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
  <div id="controlContainer">
    <button @click="commandHistory.undo">Undo</button>
    <button @click="commandHistory.redo">Redo</button>
  </div>
  
  <!-- <DevSketch></DevSketch> -->


  <div>
    We are <a href="http://www.avneeshsarwate.com/">Avneesh Sarwate</a> and <a href="https://www.acrosspolyethylene.com/">Sumanth Srinivasan</a>
  </div>

  <br>

  <div>
    We are building tools for creating art in the browser. The source code and early experiments are here
    <a href="https://github.com/avneeshsarwate/browser_drawn_projections">here</a>
  </div>

  <br>

  <div>
    If you want to read about the motivation and design of the library, you can read about it <a href="https://docs.google.com/presentation/d/1SzhiWNNl4-cxMOKpqOuUeGhP_3eecu0_Rg3aw3Hg2Kg">here</a>
  </div>
  
  <br>

  <div>
    Below is a set of demos for the creative coding library being developed. They may be incomplete or buggy, but hopefully interesting nonetheless. And they will improve over time.
    For the time being, they are best viewed on a desktop/laptop in the Chrome browser.
  </div>
  
  <br>

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