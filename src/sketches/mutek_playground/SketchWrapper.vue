<script setup lang="ts">
import SketchHtml from './SketchHtml.vue';
import SketchInitializer from './SketchInitializer.vue';
import LivecodeHolder from './LivecodeHolder.vue';
import { provide } from 'vue';
import { appState, appStateName } from './appState';


provide(appStateName, appState)

</script>

<template>
  <SketchHtml></SketchHtml>
  <SketchInitializer></SketchInitializer>
  <LivecodeHolder></LivecodeHolder>
</template>

<style>
body {
  background-color: rgb(186, 186, 186);
}
</style>