<script setup lang="ts">
import { computed } from 'vue'
import { PLAYHEAD_COLOR, PLAYHEAD_WIDTH } from '../constants'
import { timeToX } from '../utils'

const props = defineProps<{
  currentTime: number
  windowStart: number
  windowEnd: number
  canvasWidth: number
  leftOffset: number
}>()

const isVisible = computed(() => {
  return props.currentTime >= props.windowStart && props.currentTime <= props.windowEnd
})

const xPosition = computed(() => {
  return props.leftOffset + timeToX(
    props.currentTime,
    props.windowStart,
    props.windowEnd,
    props.canvasWidth
  )
})
</script>

<template>
  <div
    v-if="isVisible"
    class="playhead"
    :style="{ left: xPosition + 'px' }"
  ></div>
</template>

<style scoped>
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: v-bind('PLAYHEAD_WIDTH + "px"');
  background: v-bind('PLAYHEAD_COLOR');
  pointer-events: none;
  z-index: 10;
  transform: translateX(-50%);
}
</style>
