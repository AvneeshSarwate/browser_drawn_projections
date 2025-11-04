<script setup lang="ts">
import * as BABYLON from 'babylonjs'
import { inject, onMounted, onUnmounted, ref } from 'vue'
import { appStateName, engineRef, type FluidReactionAppState } from './appState'

const state = inject<FluidReactionAppState>(appStateName)!!
let resizeHandler: (() => void) | undefined
const showWebGPUWarning = ref(false)

async function checkWebGPUSupport(): Promise<boolean> {
  if (!navigator.gpu) {
    return false
  }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

onMounted(async () => {
  const fluidCanvas = document.getElementById('fluidCanvas') as HTMLCanvasElement | null
  if (!fluidCanvas) {
    console.warn('fluid canvas missing')
    return
  }
  
  const hasWebGPU = await checkWebGPUSupport()
  if (!hasWebGPU) {
    showWebGPUWarning.value = true
    console.error('WebGPU is not supported in this browser')
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
  <div v-if="showWebGPUWarning" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;">
    <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 500px; text-align: center;">
      <h2 style="margin-top: 0; color: #d32f2f;">WebGPU Not Supported</h2>
      <p style="margin: 1rem 0; color: #333;">
        This sketch requires WebGPU, which is not supported in your current browser.
      </p>
      <p style="margin: 1rem 0; color: #666; font-size: 0.9rem;">
        Please try using a recent version of Chrome, Edge, or another browser with WebGPU support.
      </p>
      <button @click="showWebGPUWarning = false" style="padding: 0.5rem 1.5rem; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">
        Close
      </button>
    </div>
  </div>
</template>
