<script setup lang="ts">
import * as BABYLON from 'babylonjs'
import { inject, onMounted, onUnmounted } from 'vue'
import { appStateName, type FluidReactionAppState } from './appState'

const state = inject<FluidReactionAppState>(appStateName)!!
let resizeHandler: (() => void) | undefined

onMounted(async () => {
  const canvas = document.getElementById('simulationCanvas') as HTMLCanvasElement | null
  if (!canvas) {
    console.warn('simulation canvas missing')
    return
  }
  const engine = new BABYLON.WebGPUEngine(canvas, { antialias: true })
  await engine.initAsync()
  engine.resize()
  resizeHandler = () => engine.resize()
  window.addEventListener('resize', resizeHandler)
  state.engine = engine
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = undefined
  }
  state.engine?.dispose()
  state.engine = undefined
})
</script>

<template>
  <div />
</template>
