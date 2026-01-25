<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import Konva from 'konva'
import type { TrackRuntime, EditorAction, FuncElementData } from '../types'
import {
  FUNC_LANE_HEIGHT,
  EDIT_LANE_BG_COLOR,
  EDIT_MARKER_WIDTH,
  EDIT_MARKER_BAR_WIDTH,
  SELECTION_COLOR,
  SELECTION_STROKE_WIDTH,
  FRONT_TRACK_OPACITY,
  REFERENCE_TRACK_OPACITY,
} from '../constants'
import { timeToX, xToTime, clamp, hashStringToColor } from '../utils'

const props = defineProps<{
  tracks: TrackRuntime[]
  frontTrackId: string | undefined
  windowStart: number
  windowEnd: number
  selectedElementId: string | undefined
  selectedTrackId: string | undefined
  renderVersion: number
}>()

const emit = defineEmits<{
  action: [action: EditorAction]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let stage: Konva.Stage | null = null
let layer: Konva.Layer | null = null
let resizeObserver: ResizeObserver | null = null

const elementNodes = new Map<string, Konva.Group>()

let dragTrack: TrackRuntime | null = null

const width = ref(0)
const height = FUNC_LANE_HEIGHT

const frontTrack = computed(() => {
  if (!props.frontTrackId) return undefined
  return props.tracks.find(t => t.id === props.frontTrackId)
})

function timeToXLocal(t: number): number {
  return timeToX(t, props.windowStart, props.windowEnd, width.value)
}

function xToTimeLocal(x: number): number {
  return xToTime(x, props.windowStart, props.windowEnd, width.value)
}

function rebuildScene() {
  if (!layer || !stage) return

  layer.destroyChildren()
  elementNodes.clear()

  const w = width.value
  if (w <= 0) return

  // Draw reference tracks first
  for (const track of props.tracks) {
    if (track.id === props.frontTrackId) continue
    drawTrackMarkers(track, false)
  }

  // Draw front track last
  if (frontTrack.value) {
    drawTrackMarkers(frontTrack.value, true)
  }

  layer.batchDraw()
}

function drawTrackMarkers(track: TrackRuntime, isFront: boolean) {
  const elements = track.elementData as FuncElementData[]
  const markerHeight = height * 0.7
  const markerY = (height - markerHeight) / 2

  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i]
    if (elem.time < props.windowStart || elem.time > props.windowEnd) continue

    const x = timeToXLocal(elem.time)
    const isSelected = elem.id === props.selectedElementId && track.id === props.selectedTrackId
    const color = hashStringToColor(elem.value.funcName)

    const group = new Konva.Group({
      x,
      y: 0,
      draggable: isFront,
    })

    // Colored bar
    const bar = new Konva.Rect({
      x: -EDIT_MARKER_BAR_WIDTH / 2,
      y: markerY,
      width: EDIT_MARKER_BAR_WIDTH,
      height: markerHeight,
      fill: color,
      opacity: isFront ? FRONT_TRACK_OPACITY : REFERENCE_TRACK_OPACITY,
      cornerRadius: 3,
      stroke: isSelected ? SELECTION_COLOR : undefined,
      strokeWidth: isSelected ? SELECTION_STROKE_WIDTH : 0,
    })
    group.add(bar)

    // Vertical line at exact time
    const line = new Konva.Line({
      points: [0, 0, 0, height],
      stroke: 'rgba(255,255,255,0.5)',
      strokeWidth: EDIT_MARKER_WIDTH,
      opacity: isFront ? 0.7 : 0.3,
    })
    group.add(line)

    // Text (vertical) - show funcName
    const text = new Konva.Text({
      x: 0,
      y: height / 2,
      text: elem.value.funcName || 'func',
      fontSize: 10,
      fill: '#fff',
      rotation: -90,
      offsetX: 0,
      offsetY: 0,
    })
    text.offsetX(text.width() / 2)
    text.offsetY(-3)
    group.add(text)

    if (isFront) {
      group.setAttr('elementId', elem.id)

      group.on('click', (e) => {
        if (e.evt.shiftKey) {
          emit('action', { type: 'FUNC/DELETE', trackId: track.id, elementId: elem.id })
        } else {
          emit('action', { type: 'ELEMENT/SELECT', fieldType: 'func', trackId: track.id, elementId: elem.id })
        }
      })

      group.on('dragstart', () => {
        dragTrack = track
        emit('action', { type: 'ELEMENT/SELECT', fieldType: 'func', trackId: track.id, elementId: elem.id })
      })

      group.on('dragmove', () => {
        // Restrict to X only
        group.y(0)

        let t = xToTimeLocal(group.x())
        t = clamp(t, props.windowStart, props.windowEnd)
        group.x(timeToXLocal(t))

        emit('action', {
          type: 'FUNC/DRAG_PREVIEW',
          trackId: track.id,
          elementId: elem.id,
          time: t,
        })
      })

      group.on('dragend', () => {
        let t = xToTimeLocal(group.x())
        t = clamp(t, props.windowStart, props.windowEnd)

        emit('action', {
          type: 'FUNC/DRAG_END',
          trackId: track.id,
          elementId: elem.id,
          time: t,
        })

        dragTrack = null
      })

      elementNodes.set(elem.id, group)
    }

    layer!.add(group)
  }
}

function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
  if (e.target !== stage && e.target !== layer) return
  if (!frontTrack.value) return

  const pos = stage!.getPointerPosition()
  if (!pos) return

  const t = clamp(xToTimeLocal(pos.x), props.windowStart, props.windowEnd)

  emit('action', {
    type: 'FUNC/ADD',
    trackId: frontTrack.value.id,
    time: t,
  })
}

function getSelectedElementPosition(): { x: number; y: number } | null {
  if (!props.selectedElementId || !props.selectedTrackId) return null
  const node = elementNodes.get(props.selectedElementId)
  if (!node) return null
  return { x: node.x(), y: height / 2 }
}

onMounted(() => {
  if (!containerRef.value) return

  stage = new Konva.Stage({
    container: containerRef.value,
    width: containerRef.value.clientWidth,
    height: height,
  })

  layer = new Konva.Layer()
  stage.add(layer)

  stage.on('click', handleStageClick)

  resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      width.value = entry.contentRect.width
      if (stage) {
        stage.width(width.value)
        rebuildScene()
      }
    }
  })
  resizeObserver.observe(containerRef.value)

  width.value = containerRef.value.clientWidth
  rebuildScene()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  stage?.destroy()
})

watch(
  () => [props.renderVersion, props.windowStart, props.windowEnd, props.frontTrackId, props.tracks.length],
  () => rebuildScene(),
  { deep: false }
)

watch(
  () => [props.selectedElementId, props.selectedTrackId],
  () => rebuildScene()
)

defineExpose({
  getSelectedElementPosition,
})
</script>

<template>
  <div class="func-lane">
    <div ref="containerRef" class="lane-canvas"></div>
  </div>
</template>

<style scoped>
.func-lane {
  height: v-bind('FUNC_LANE_HEIGHT + "px"');
  background: v-bind('EDIT_LANE_BG_COLOR');
  border-bottom: 1px solid #2a2d30;
  display: flex;
}

.lane-canvas {
  flex: 1;
  position: relative;
}
</style>
