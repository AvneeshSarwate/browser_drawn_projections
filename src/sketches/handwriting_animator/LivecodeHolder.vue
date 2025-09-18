<script setup lang="ts">
import { inject } from 'vue'
import CanvasRoot from './canvas/CanvasRoot.vue'
import StrokeLaunchControls from './StrokeLaunchControls.vue'
import { appStateName, type TemplateAppState } from './appState'
import { updateGPUStrokes } from './strokeLauncher'
import type { CanvasRuntimeState } from './canvas/canvasState'

const appState = inject<TemplateAppState>(appStateName)!!

const syncCanvasState = (state: CanvasRuntimeState) => {
  appState.freehandStateString = state.freehand.serializedState
  appState.freehandRenderData = state.freehand.bakedRenderData
  appState.freehandGroupMap = state.freehand.bakedGroupMap
  appState.polygonStateString = state.polygon.serializedState
  appState.polygonRenderData = state.polygon.bakedRenderData
  updateGPUStrokes()
}
</script>

<template>
  <CanvasRoot :sync-state="syncCanvasState" />
  <StrokeLaunchControls />
</template>
