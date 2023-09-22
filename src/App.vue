<script setup lang="ts">
import { useCheckBoxStore, type AppState } from './stores/stores';
import RenderCanvas from './components/RenderCanvas.vue';
import { provide } from 'vue';


const checkStore = useCheckBoxStore()

const appState = checkStore.appStateRef as AppState

provide('appState', appState)

</script>

<template>
  <RenderCanvas ></RenderCanvas>
</template>

<style scoped></style>
