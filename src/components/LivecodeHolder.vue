<script setup lang="ts">
import { Region, type AppState } from '@/stores/stores';
import p5 from 'p5';
import { inject, onMounted, onUnmounted } from 'vue';


const appState = inject('appState') as AppState  

const reg = (i: number) => appState.regions.list[i]


onMounted(() => {
  if (appState.p5Instance) {
    reg(0).draw2 = (reg: Region, p5: p5) => {
      reg.points.list.forEach(p => {
        p5.circle(p.x, p.y, 10)
      })
    }
    // reg(0).draw2 = undefined
  }

})

onUnmounted(() => {

})


</script>

<template>
  <div></div>
</template>

<style scoped></style>