<script setup lang="ts">
import { ref, inject, onMounted, onUnmounted, watch } from 'vue'
import type { TrackRuntime, FuncElement } from '../types'
import type { RenderScheduler } from '../renderScheduler'
import {
  TRACK_BG_COLOR,
  NUMBER_LINE_COLOR,
  NUMBER_POINT_COLOR,
  NUMBER_POINT_RADIUS,
  ENUM_TEXT_COLOR,
  ENUM_FONT_SIZE,
  FUNC_TEXT_COLOR,
  FUNC_FONT_SIZE,
} from '../constants'
import { timeToX, hashStringToColor, upperBound, lerp, clamp } from '../utils'

const props = defineProps<{
  track: TrackRuntime
  windowStart: number
  windowEnd: number
}>()

const scheduler = inject<RenderScheduler>('scheduler')!

const canvasRef = ref<HTMLCanvasElement | null>(null)
const canvasWidth = ref(0)
const canvasHeight = ref(0)
let unsubscribe: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null

function setupCanvas(): void {
  const canvas = canvasRef.value
  if (!canvas) return

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()

  canvasWidth.value = rect.width
  canvasHeight.value = rect.height

  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr

  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.scale(dpr, dpr)
  }
}

function draw(): void {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvasWidth.value
  const height = canvasHeight.value

  // Clear and fill background
  ctx.fillStyle = TRACK_BG_COLOR
  ctx.fillRect(0, 0, width, height)

  // Draw based on track type
  switch (props.track.def.fieldType) {
    case 'number':
      drawNumberTrack(ctx, width, height)
      break
    case 'enum':
      drawEnumTrack(ctx, width, height)
      break
    case 'func':
      drawFuncTrack(ctx, width, height)
      break
  }
}

function drawNumberTrack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const { times, elements, low, high } = props.track
  const { windowStart, windowEnd } = props

  if (times.length === 0) return

  const padding = 4
  const drawHeight = height - padding * 2

  // Helper to convert value to Y
  const valueToY = (v: number): number => {
    const normalized = (v - low) / (high - low)
    return padding + drawHeight * (1 - normalized)
  }

  // Helper to convert time to X
  const tToX = (t: number): number => timeToX(t, windowStart, windowEnd, width)

  // Evaluate value at a time (same logic as core.evaluateNumberTrack)
  const evalAt = (t: number): number => {
    const n = times.length
    const r = upperBound(times, t)
    const i1 = r - 1
    const i2 = r

    let value: number
    if (i1 < 0) {
      value = elements[0] as number
    } else if (i2 >= n) {
      value = elements[i1] as number
    } else {
      const t1 = times[i1]
      const t2 = times[i2]
      const v1 = elements[i1] as number
      const v2 = elements[i2] as number
      const alpha = (t - t1) / (t2 - t1)
      value = lerp(v1, v2, alpha)
    }

    return clamp(value, low, high)
  }

  // Draw line
  ctx.beginPath()
  ctx.strokeStyle = NUMBER_LINE_COLOR
  ctx.lineWidth = 2

  // Start from left edge (interpolated)
  const startValue = evalAt(windowStart)
  ctx.moveTo(0, valueToY(startValue))

  // Draw segments for visible points
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (t < windowStart) continue
    if (t > windowEnd) {
      // One more point at window end (interpolated)
      const endValue = evalAt(windowEnd)
      ctx.lineTo(width, valueToY(endValue))
      break
    }
    const v = elements[i] as number
    ctx.lineTo(tToX(t), valueToY(v))
  }

  // If we haven't drawn to the end yet
  const lastTime = times[times.length - 1]
  if (lastTime <= windowEnd) {
    const endValue = evalAt(windowEnd)
    ctx.lineTo(width, valueToY(endValue))
  }

  ctx.stroke()

  // Draw points
  ctx.fillStyle = NUMBER_POINT_COLOR
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (t < windowStart || t > windowEnd) continue

    const v = elements[i] as number
    const x = tToX(t)
    const y = valueToY(v)

    ctx.beginPath()
    ctx.arc(x, y, NUMBER_POINT_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawEnumTrack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const { times, elements } = props.track
  const { windowStart, windowEnd } = props

  if (times.length === 0) return

  const tToX = (t: number): number => timeToX(t, windowStart, windowEnd, width)

  // Find visible segments
  // Each enum value spans from its time to the next time (or end of window)
  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    const nextT = i < times.length - 1 ? times[i + 1] : windowEnd + 1
    const value = elements[i] as string

    // Skip if entirely before window
    if (nextT <= windowStart) continue
    // Stop if entirely after window
    if (t > windowEnd) break

    // Clamp segment to window
    const segStart = Math.max(t, windowStart)
    const segEnd = Math.min(nextT, windowEnd)

    const x1 = tToX(segStart)
    const x2 = tToX(segEnd)
    const segWidth = x2 - x1

    if (segWidth < 1) continue

    // Draw colored rectangle
    ctx.fillStyle = hashStringToColor(value)
    ctx.fillRect(x1, 2, segWidth, height - 4)

    // Draw text (vertical, rotated counterclockwise)
    if (segWidth > 12) {
      ctx.save()
      ctx.fillStyle = ENUM_TEXT_COLOR
      ctx.font = `${ENUM_FONT_SIZE}px system-ui, sans-serif`

      // Position at center of segment, rotate counterclockwise
      const textX = x1 + segWidth / 2
      const textY = height / 2

      ctx.translate(textX, textY)
      ctx.rotate(-Math.PI / 2)

      // Measure and clip text if needed
      const maxTextWidth = height - 8
      let displayText = value
      let textWidth = ctx.measureText(displayText).width
      while (textWidth > maxTextWidth && displayText.length > 3) {
        displayText = displayText.slice(0, -1)
        textWidth = ctx.measureText(displayText + '…').width
      }
      if (displayText !== value) {
        displayText += '…'
      }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(displayText, 0, 0)

      ctx.restore()
    }
  }

  // Handle case where first event is after windowStart
  if (times[0] > windowStart) {
    const x1 = 0
    const x2 = tToX(times[0])
    const firstValue = elements[0] as string

    ctx.fillStyle = hashStringToColor(firstValue)
    ctx.globalAlpha = 0.4
    ctx.fillRect(x1, 2, x2 - x1, height - 4)
    ctx.globalAlpha = 1.0
  }
}

function drawFuncTrack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const { times, elements } = props.track
  const { windowStart, windowEnd } = props

  if (times.length === 0) return

  const tToX = (t: number): number => timeToX(t, windowStart, windowEnd, width)

  // Draw each func marker
  const markerWidth = 24 // Width of each marker

  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (t < windowStart || t > windowEnd) continue

    const func = elements[i] as FuncElement
    const x = tToX(t)

    // Draw colored rectangle centered on time
    const halfWidth = markerWidth / 2
    ctx.fillStyle = hashStringToColor(func.funcName)
    ctx.fillRect(x - halfWidth, 2, markerWidth, height - 4)

    // Draw vertical line at exact time
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()

    // Draw text (vertical, rotated counterclockwise)
    ctx.save()
    ctx.fillStyle = FUNC_TEXT_COLOR
    ctx.font = `${FUNC_FONT_SIZE}px system-ui, sans-serif`

    ctx.translate(x, height / 2)
    ctx.rotate(-Math.PI / 2)

    // Clip text if needed
    const maxTextWidth = height - 8
    let displayText = func.funcName
    let textWidth = ctx.measureText(displayText).width
    while (textWidth > maxTextWidth && displayText.length > 3) {
      displayText = displayText.slice(0, -1)
      textWidth = ctx.measureText(displayText + '…').width
    }
    if (displayText !== func.funcName) {
      displayText += '…'
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(displayText, 0, 0)

    ctx.restore()
  }
}

onMounted(() => {
  // Set up resize observer
  resizeObserver = new ResizeObserver(() => {
    setupCanvas()
    draw()
  })

  if (canvasRef.value) {
    resizeObserver.observe(canvasRef.value)
  }

  // Initial setup
  setupCanvas()
  draw()

  // Subscribe to scheduler
  unsubscribe = scheduler.subscribe(draw)
})

onUnmounted(() => {
  unsubscribe?.()
  resizeObserver?.disconnect()
})

// Redraw when track changes (for virtualization reuse)
watch(() => props.track.id, () => {
  draw()
})
</script>

<template>
  <canvas ref="canvasRef" class="track-canvas"></canvas>
</template>

<style scoped>
.track-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
