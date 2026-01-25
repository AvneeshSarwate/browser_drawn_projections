<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  TIME_RIBBON_HEIGHT,
  TIME_TICKS_HEIGHT,
  NAME_COLUMN_WIDTH,
  RIBBON_BG_COLOR,
  RIBBON_VIEWPORT_COLOR,
  RIBBON_HANDLE_COLOR,
  RIBBON_HANDLE_WIDTH,
  MIN_TICK_SPACING,
  TICK_COLOR,
  TICK_LABEL_COLOR,
  TICK_HEIGHT,
} from '../constants'
import { calculateTickValues, formatTime, timeToX } from '../utils'

const props = withDefaults(defineProps<{
  duration: number
  windowStart: number
  windowEnd: number
  spacerWidth?: number
}>(), {
  spacerWidth: NAME_COLUMN_WIDTH,
})

const emit = defineEmits<{
  'update:windowStart': [value: number]
  'update:windowEnd': [value: number]
}>()

const ribbonRef = ref<HTMLElement | null>(null)
const ticksRef = ref<HTMLElement | null>(null)
const isDragging = ref<'viewport' | 'start' | 'end' | null>(null)
const dragStartX = ref(0)
const dragStartWindowStart = ref(0)
const dragStartWindowEnd = ref(0)
const ticksWidth = ref(0)

// Resize observer for ticks
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (ticksRef.value) {
    ticksWidth.value = ticksRef.value.clientWidth
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        ticksWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(ticksRef.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

// Computed positions as percentages
const viewportLeftPercent = computed(() => {
  return (props.windowStart / props.duration) * 100
})

const viewportWidthPercent = computed(() => {
  return ((props.windowEnd - props.windowStart) / props.duration) * 100
})

// Compute tick positions
const ticks = computed(() => {
  if (ticksWidth.value <= 0) return []

  const values = calculateTickValues(
    props.windowStart,
    props.windowEnd,
    ticksWidth.value,
    MIN_TICK_SPACING
  )

  return values.map(t => ({
    time: t,
    x: timeToX(t, props.windowStart, props.windowEnd, ticksWidth.value),
    label: formatTime(t),
  }))
})

function getRibbonWidth(): number {
  return ribbonRef.value?.clientWidth ?? 0
}

function xToTime(x: number): number {
  const width = getRibbonWidth()
  if (width <= 0) return 0
  return (x / width) * props.duration
}

function onMouseDown(e: MouseEvent, type: 'viewport' | 'start' | 'end') {
  e.preventDefault()
  isDragging.value = type
  dragStartX.value = e.clientX
  dragStartWindowStart.value = props.windowStart
  dragStartWindowEnd.value = props.windowEnd

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value || !ribbonRef.value) return

  const deltaX = e.clientX - dragStartX.value
  const deltaTime = xToTime(deltaX)

  const minWindow = 0.1 // Minimum window size

  if (isDragging.value === 'viewport') {
    // Drag entire viewport
    let newStart = dragStartWindowStart.value + deltaTime
    let newEnd = dragStartWindowEnd.value + deltaTime

    // Clamp to bounds
    if (newStart < 0) {
      newEnd -= newStart
      newStart = 0
    }
    if (newEnd > props.duration) {
      newStart -= (newEnd - props.duration)
      newEnd = props.duration
    }

    newStart = Math.max(0, newStart)
    newEnd = Math.min(props.duration, newEnd)

    emit('update:windowStart', newStart)
    emit('update:windowEnd', newEnd)
  } else if (isDragging.value === 'start') {
    // Drag start handle
    let newStart = dragStartWindowStart.value + deltaTime
    newStart = Math.max(0, Math.min(newStart, props.windowEnd - minWindow))
    emit('update:windowStart', newStart)
  } else if (isDragging.value === 'end') {
    // Drag end handle
    let newEnd = dragStartWindowEnd.value + deltaTime
    newEnd = Math.min(props.duration, Math.max(newEnd, props.windowStart + minWindow))
    emit('update:windowEnd', newEnd)
  }
}

function onMouseUp() {
  isDragging.value = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}
</script>

<template>
  <div class="time-ribbon-wrapper">
    <!-- Viewport selector row -->
    <div class="time-ribbon-container">
      <div class="name-spacer"></div>
      <div class="ribbon" ref="ribbonRef">
        <!-- Viewport selector -->
        <div
          class="viewport"
          :style="{
            left: viewportLeftPercent + '%',
            width: viewportWidthPercent + '%',
          }"
          @mousedown="onMouseDown($event, 'viewport')"
        >
          <!-- Start handle -->
          <div
            class="handle handle-start"
            @mousedown.stop="onMouseDown($event, 'start')"
          ></div>
          <!-- End handle -->
          <div
            class="handle handle-end"
            @mousedown.stop="onMouseDown($event, 'end')"
          ></div>
        </div>
      </div>
    </div>

    <!-- Time ticks row -->
    <div class="time-ticks-container">
      <div class="name-spacer ticks-spacer"></div>
      <div class="ticks-area" ref="ticksRef">
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
    </div>
  </div>
</template>

<style scoped>
.time-ribbon-wrapper {
  display: flex;
  flex-direction: column;
  background: v-bind('RIBBON_BG_COLOR');
}

.time-ribbon-container {
  display: flex;
  height: v-bind('TIME_RIBBON_HEIGHT + "px"');
}

.time-ticks-container {
  display: flex;
  height: v-bind('TIME_TICKS_HEIGHT + "px"');
  border-bottom: 1px solid #2a2d30;
}

.name-spacer {
  width: v-bind('spacerWidth + "px"');
  min-width: v-bind('spacerWidth + "px"');
  background: #141618;
}

.ticks-spacer {
  border-bottom: 1px solid #2a2d30;
}

.ribbon {
  flex: 1;
  position: relative;
  background: v-bind('RIBBON_BG_COLOR');
  border-bottom: 1px solid #2a2d30;
}

.ticks-area {
  flex: 1;
  position: relative;
  background: #141618;
}

.viewport {
  position: absolute;
  top: 4px;
  bottom: 4px;
  background: v-bind('RIBBON_VIEWPORT_COLOR');
  border-radius: 4px;
  cursor: grab;
}

.viewport:active {
  cursor: grabbing;
}

.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: v-bind('RIBBON_HANDLE_WIDTH + "px"');
  background: v-bind('RIBBON_HANDLE_COLOR');
  cursor: ew-resize;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.handle:hover {
  opacity: 1;
}

.handle-start {
  left: 0;
  border-radius: 4px 0 0 4px;
}

.handle-end {
  right: 0;
  border-radius: 0 4px 4px 0;
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
