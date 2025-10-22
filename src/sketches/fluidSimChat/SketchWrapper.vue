<script setup lang="ts">
import { provide } from 'vue'
import SketchHtml from './SketchHtml.vue'
import SketchInitializer from './SketchInitializer.vue'
import LivecodeHolder from './LivecodeHolder.vue'
import { appState, appStateName } from './appState'
import { createScreenshotStore, screenshotStoreKey } from './useScreenshots'

provide(appStateName, appState)

const screenshotStore = createScreenshotStore({
  getCanvas: () => {
    const canvas = appState.fluidEngine?.getRenderingCanvas()
    if (canvas) {
      return canvas
    }
    if (typeof window !== 'undefined') {
      return document.getElementById('fluidCanvas') as HTMLCanvasElement | null
    }
    return null
  },
  getDebugMode: () => appState.debugMode.value,
  getParameters: () => appState.fluidParams || [],
  ensureFreshFrame: () => {
    if (appState.paused) {
      appState.shaderDrawFunc?.()
    }
  }
})

provide(screenshotStoreKey, screenshotStore)
</script>

<template>
  <SketchHtml />
  <SketchInitializer />
  <LivecodeHolder />
</template>
