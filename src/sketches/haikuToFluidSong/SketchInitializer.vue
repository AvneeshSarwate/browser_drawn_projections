<script setup lang="ts">
import * as BABYLON from 'babylonjs'
import { inject, onMounted, onUnmounted } from 'vue'
import { appStateName, engineRef, type FluidReactionAppState } from './appState'

const state = inject<FluidReactionAppState>(appStateName)!!
let resizeHandler: (() => void) | undefined

onMounted(async () => {
  const fluidCanvas = document.getElementById('fluidCanvas') as HTMLCanvasElement | null
  if (!fluidCanvas) {
    console.warn('fluid canvas missing')
    return
  }
  
  const fluidEngine = new BABYLON.WebGPUEngine(fluidCanvas, { 
    antialias: true,
    adaptToDeviceRatio: false,
    limitDeviceRatio: 1.0
  })
  await fluidEngine.initAsync()
  fluidEngine.resize() // Initial resize needed for proper WebGPU setup
  // NOTE: No window resize listener - render size stays fixed, CSS handles display scaling
  
  state.fluidEngine = fluidEngine
  engineRef.value = { fluid: fluidEngine }
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = undefined
  }
  state.fluidEngine?.dispose()
  state.fluidEngine = undefined
  engineRef.value = undefined
})
</script>

<template>
  <div />
</template>
