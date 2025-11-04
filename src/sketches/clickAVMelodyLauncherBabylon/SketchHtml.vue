<script setup lang="ts">
import { computed } from 'vue'
import ShaderGraphUI from '@/components/ShaderGraphUI/ShaderGraphUI.vue'
import { shaderGraphEndNodeRef } from './appState'

const shaderGraphEffect = computed(() => shaderGraphEndNodeRef.value ?? null)
</script>

<template>
  <div class="sketch-layout">
    <div id="canvasContainer">
      <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
      <div id="divider"></div>
      <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    </div>
    <div class="ui-panel">
      <ShaderGraphUI v-if="shaderGraphEffect" :final-effect="shaderGraphEffect" />
      <div v-else class="ui-placeholder">Shader graph loading…</div>
    </div>
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
  gap: 1rem;
  align-items: flex-start;
}

#canvasContainer {
  background-color: black;
  flex: 1;
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
}

#threeCanvas {
  border: 1px solid black;
  /* position: absolute; */
  /* top: 0; */
  /* left: 0; */
  visibility: visible;
}

#divider {
  width: 100%;
  height: 10px;
  background-color: white;
}

.ui-panel {
  width: 380px;
  max-width: 380px;
  border: 1px solid #1f1f1f;
  border-radius: 8px;
  background: #101010;
  padding: 0.75rem;
  color: #f0f0f0;
  min-height: 400px;
}

.ui-panel :deep(.shader-graph-ui) {
  height: 100%;
}

.ui-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-style: italic;
}
</style>
