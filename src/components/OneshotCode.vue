<script setup lang="ts">
import { type DevelopmentAppState } from '@/sketches/devTest/developmentAppState';
import { inject, onMounted } from 'vue';


const appState = inject<DevelopmentAppState>('appState')!!


onMounted(() => {
  try {
    if (appState.p5Instance && appState.regions.list.length > 0) {


      console.log("one shot action 3")

    }
  } catch (e) {
    console.log(e)
  }

})


</script>

<template>
  <div></div>
</template>

<style scoped></style>