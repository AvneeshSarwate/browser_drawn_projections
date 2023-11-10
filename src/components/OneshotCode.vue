<script setup lang="ts">
import { type TemplateAppState } from '@/sketches/template/appState';
import { inject, onMounted } from 'vue';


// const appState = inject<PulseCircleAppState>('appState')!!


onMounted(() => {
  try {

    console.log("one shot action 3")
      
  } catch (e) {
    console.log(e)
  }

})


</script>

<template>
  <div></div>
</template>

<style scoped></style>