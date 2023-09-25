<script setup lang="ts">
import { Region, type AppState } from '@/stores/stores';
import p5 from 'p5';
import { inject, onMounted, onUnmounted } from 'vue';
import * as a from '@/rendering/planeAnimations'


const appState = inject('appState') as AppState  

const reg = (i: number) => appState.regions.list[i]
const cornerPts = (reg: Region, p5: p5) => {
  reg.points.list.forEach(p => {
    p5.circle(p.x, p.y, 10)
  })
}

const aseq = (animations: a.AnimationSegment[]) => {
  return new a.AnimationSeq(animations)
}


onMounted(() => {
  try {
    if (appState.p5Instance && appState.regions.list.length > 0) {
      // reg(0).draw2 = cornerPts
      const lr = a.lrLine(2.52)
      const zi = a.zoomIn(2.52)
      const zo = a.zoomOut(2.52)
      const dots = new a.PerimiterDots(reg(0), 10).anim(2.52)
      reg(0).animationSeq = aseq([zo, zi, lr, dots])
      // reg(0).animationSeq = undefined
    }
  } catch (e) {
    console.log(e)
  }

})

onUnmounted(() => {

})


</script>

<template>
  <div></div>
</template>

<style scoped></style>