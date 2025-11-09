<script setup lang="ts">
import { computed, ref } from 'vue'
import ShaderGraphUI from '@/components/ShaderGraphUI/ShaderGraphUI.vue'
import PopoutWindow from '@/components/PopoutWindow.vue'
import { shaderGraphEndNodeRef } from './appState'

const shaderGraphEffect = computed(() => shaderGraphEndNodeRef.value ?? null)
const canvasPopped = ref(false)
const controlsPopped = ref(false)
</script>

<template>
  <div class="sketch-layout">
    <div id="canvasContainer">
      <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
      <div id="divider"></div>
      <PopoutWindow 
        v-model="canvasPopped" 
        title="Canvas" 
        :width="1280" 
        :height="720"
        fullscreen-target="canvas"
      >
        <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
      </PopoutWindow>
    </div>
    
    <PopoutWindow 
      v-model="controlsPopped" 
      title="Controls" 
      :width="600" 
      :height="900"
      :fill="false"
    >
      <ShaderGraphUI :final-effect="shaderGraphEffect" />
    </PopoutWindow>
  </div>
  <div>
    click anywhere to start a loop. Press the "c" key to clear all loops. Press the "u" key to clear the last loop
  </div>
  <div>
    The y controls the pitch, and the x coordinate controls the loop speed
  </div>
  <div id="debugInfo"></div>
</template>


<style scoped>

.sketch-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

#canvasContainer {
  /* background-color: black; */
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

#p5Canvas {
  border: 1px solid black;
  /* position: absolute; */
  top: 0;
  left: 0;
  z-index: -1;
  /* visibility: hidden; */
  background-color: black;
}

#threeCanvas {
  border: 1px solid black;
  /* position: absolute; */
  /* top: 0; */
  /* left: 0; */
  visibility: visible;
  background-color: black;
}

#divider {
  width: 100%;
  height: 10px;
  background-color: white;
}

</style>
