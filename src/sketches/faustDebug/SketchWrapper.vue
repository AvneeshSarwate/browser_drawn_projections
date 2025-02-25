<script setup lang="ts">
import LivecodeHolder from './LivecodeHolder.vue';
import { provide } from 'vue';
import { appState, appStateName } from './appState';


provide(appStateName, appState)

</script>

<template>
  <LivecodeHolder></LivecodeHolder>
</template>