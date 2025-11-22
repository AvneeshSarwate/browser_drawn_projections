<script setup lang="ts">
import SketchHtml from './SketchHtml.vue';
import SketchInitializer from './SketchInitializer.vue';
import LivecodeHolder from './LivecodeHolder.vue';

import { provide } from 'vue';
import { appState, appStateName } from './appState';


provide(appStateName, appState)

/*
// Get the reactive store
const store = globalStore();
// Provide the reactive appState reference
provide(appStateName, store.appStateRef);
*/


</script>

<template>
  <SketchHtml></SketchHtml>
  <SketchInitializer></SketchInitializer>
  <LivecodeHolder></LivecodeHolder>
</template>