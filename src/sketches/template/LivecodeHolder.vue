<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type PulseCircleAppState } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, keydownEvent } from '@/io/keyboardAndMouse';

const appState = inject<PulseCircleAppState>('appState')!!

let shaderGraphEndNode: ShaderEffect | undefined = undefined


onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    if (appState.p5Instance && appState.circles.list.length > 0) {


      const code = () => {




        
        keydownEvent((ev) => { if (ev.key === 'p') appState.paused = !appState.paused })
      }


      appState.codeStack.push(code)
      code()
    }
  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>