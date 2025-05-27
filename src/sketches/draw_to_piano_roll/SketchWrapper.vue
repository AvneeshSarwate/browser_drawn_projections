<script setup lang="ts">
import SketchHtml from './SketchHtml.vue';
import SketchInitializer from './SketchInitializer.vue';
import LivecodeHolder from './LivecodeHolder.vue';
import { provide } from 'vue';
import { appStateName, globalStore } from './appState';


// Get the reactive store
const store = globalStore();
// Provide the reactive appState reference
provide(appStateName, store.appStateRef);

</script>

<template>
  <div class="page-container">
    <div class="content-wrapper">
      <div class="canvas-section">
        <SketchHtml></SketchHtml>
      </div>
      <div class="controls-section">
        <LivecodeHolder></LivecodeHolder>
      </div>
    </div>
    <SketchInitializer></SketchInitializer>
  </div>
</template>

<style scoped>
.page-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 0.5rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.content-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

.canvas-section {
  background: white;
  border-radius: 8px;
  padding: 0.75rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.controls-section {
  width: 100%;
  max-width: 1000px;
  background: white;
  border-radius: 8px;
  padding: 0.75rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* Responsive design */
@media (max-width: 768px) {
  .page-container {
    padding: 0.25rem;
  }
  
  .canvas-section,
  .controls-section {
    padding: 0.5rem;
  }
}
</style>