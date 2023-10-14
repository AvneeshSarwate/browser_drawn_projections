<script setup lang="ts">
import { type AppState } from '@/stores/stores';
import { inject, onMounted } from 'vue';


const appState = inject('appState') as AppState  


onMounted(() => {
  try {
    if (appState.p5Instance && appState.regions.list.length > 0) {


      console.log("one shot action 2")

    }
  } catch (e) {
    console.log(e)
  }

})


</script>

<template>
  <div></div>
</template>

<style scoped></style>@/stores/undoCommands