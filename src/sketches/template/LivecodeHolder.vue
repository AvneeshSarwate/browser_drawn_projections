<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type PulseCircleAppState } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, type ShaderEffect } from '@/rendering/shaderFX';



//todo componentization - have each sketch just own their own livecoding and sketchinitialize view componets?

const appState = inject<PulseCircleAppState>('appState')!!

let shaderGraphEndNode: ShaderEffect | undefined = undefined



onMounted(() => {
  try {
    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    if (appState.p5Instance && appState.circles.list.length > 0) {


      const code = () => {
        
      }


      //can access this from browser console as well to rerun code
      appState.codeStack.push(code)
      code()
    }
  } catch (e) {
    console.log(e)
  }

})



onUnmounted(() => {
  console.log("disposing fx")
  shaderGraphEndNode?.disposeAll()
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>