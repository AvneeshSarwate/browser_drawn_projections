<script setup lang="ts">
import { provide } from 'vue'
import SketchHtml from './SketchHtml.vue'
import SketchInitializer from './SketchInitializer.vue'
import LivecodeHolder from './LivecodeHolder.vue'
import { appState, appStateName } from './appState'

provide(appStateName, appState)
</script>

<template>
  <SketchHtml />
  <SketchInitializer />
  <LivecodeHolder />
</template>
