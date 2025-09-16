<script setup lang="ts">
import { inject, onMounted, onUnmounted } from 'vue'
import CanvasRoot from './canvas/CanvasRoot.vue'
import StrokeLaunchControls from './StrokeLaunchControls.vue'
import { appStateName, type TemplateAppState } from './appState'
import { updateGPUStrokes } from './strokeLauncher'

const appState = inject<TemplateAppState>(appStateName)!!

onMounted(() => {
  appState.freehandDataUpdateCallback = updateGPUStrokes
})

onUnmounted(() => {
  if (appState.freehandDataUpdateCallback === updateGPUStrokes) {
    appState.freehandDataUpdateCallback = undefined
  }
})
</script>

<template>
  <CanvasRoot />
  <StrokeLaunchControls />
</template>
