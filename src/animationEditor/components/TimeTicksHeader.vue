<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  TIME_TICKS_HEIGHT,
  MIN_TICK_SPACING,
  TICK_COLOR,
  TICK_LABEL_COLOR,
  TICK_HEIGHT,
} from '../constants'
import { calculateTickValues, formatTime, timeToX } from '../utils'

const props = defineProps<{
  windowStart: number
  windowEnd: number
}>()

const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

// Observe container width
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

// Compute tick positions
const ticks = computed(() => {
  if (containerWidth.value <= 0) return []

  const values = calculateTickValues(
    props.windowStart,
    props.windowEnd,
    containerWidth.value,
    MIN_TICK_SPACING
  )

  return values.map(t => ({
    time: t,
    x: timeToX(t, props.windowStart, props.windowEnd, containerWidth.value),
    label: formatTime(t),
  }))
})
</script>

<template>
  <div class="time-ticks-header" ref="containerRef">
    <div
      v-for="tick in ticks"
      :key="tick.time"
      class="tick"
      :style="{ left: tick.x + 'px' }"
    >
      <div class="tick-mark"></div>
      <div class="tick-label">{{ tick.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.time-ticks-header {
  position: relative;
  height: v-bind('TIME_TICKS_HEIGHT + "px"');
  background: #141618;
  border-bottom: 1px solid #2a2d30;
}

.tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tick-mark {
  width: 1px;
  height: v-bind('TICK_HEIGHT + "px"');
  background: v-bind('TICK_COLOR');
}

.tick-label {
  font-size: 10px;
  color: v-bind('TICK_LABEL_COLOR');
  margin-top: 2px;
  white-space: nowrap;
}
</style>
