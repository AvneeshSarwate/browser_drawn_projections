<script setup lang="ts">
import SketchHtml from './SketchHtml.vue';
import SketchInitializer from './SketchInitializer.vue';
import { HandwritingTool, appStateName, globalStore } from '@/components/handwritingTool';
import { provide } from 'vue';


// Get the reactive store
const store = globalStore();
// Provide the reactive appState reference
provide(appStateName, store.appStateRef);

</script>

<template>
  <SketchHtml></SketchHtml>
  <SketchInitializer></SketchInitializer>
  <HandwritingTool></HandwritingTool>
</template>