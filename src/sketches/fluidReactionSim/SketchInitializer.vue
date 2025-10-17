<script setup lang="ts">
import * as BABYLON from 'babylonjs'
import { inject, onMounted, onUnmounted } from 'vue'
import { appStateName, engineRef, type FluidReactionAppState } from './appState'

const state = inject<FluidReactionAppState>(appStateName)!!
let resizeHandler: (() => void) | undefined

onMounted(async () => {
  const fluidCanvas = document.getElementById('fluidCanvas') as HTMLCanvasElement | null
  const reactionCanvas = document.getElementById('reactionCanvas') as HTMLCanvasElement | null
  if (!fluidCanvas) {
    console.warn('fluid canvas missing')
    return
  }
  if (!reactionCanvas) {
    console.warn('reaction canvas missing')
    return
  }
  
  const fluidEngine = new BABYLON.WebGPUEngine(fluidCanvas, { antialias: true })
  await fluidEngine.initAsync()
  fluidEngine.resize()
  
  const reactionEngine = new BABYLON.WebGPUEngine(reactionCanvas, { antialias: true })
  await reactionEngine.initAsync()
  reactionEngine.resize()
  
  resizeHandler = () => {
    fluidEngine.resize()
    reactionEngine.resize()
  }
  window.addEventListener('resize', resizeHandler)
  state.fluidEngine = fluidEngine
  state.reactionEngine = reactionEngine
  engineRef.value = { fluid: fluidEngine, reaction: reactionEngine }
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = undefined
  }
  state.fluidEngine?.dispose()
  state.reactionEngine?.dispose()
  state.fluidEngine = undefined
  state.reactionEngine = undefined
  engineRef.value = undefined
})
</script>

<template>
  <div />
</template>
