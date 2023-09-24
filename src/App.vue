<script setup lang="ts">
import { globalStore, commandHistory, type AppState } from './stores/stores';
import RenderCanvas from './components/RenderCanvas.vue';
import LivecodeHolder from './components/LivecodeHolder.vue';
import { provide } from 'vue';
import type LivecodeHolderVue from './components/LivecodeHolder.vue';


const checkStore = globalStore()

const appState = checkStore.appStateRef as AppState

provide('appState', appState)

</script>

<template>
  <RenderCanvas ></RenderCanvas>
  <LivecodeHolder></LivecodeHolder>
  <button @click="commandHistory.undo">Undo</button>
  <button @click="commandHistory.redo">Redo</button>
</template>

<style scoped></style>
