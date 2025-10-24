<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import P5 from 'p5'
import type { TimelineState } from '../types/timeline'

const props = defineProps<{
  state: TimelineState
}>()

const containerRef = ref<HTMLDivElement>()
let sketch: P5 | null = null

const createSketch = (root: HTMLDivElement) => {
  sketch = new P5((p) => {
    const padding = 24

    const drawTimelineBackground = () => {
      p.fill(244)
      p.rect(padding, padding, p.width - padding * 2, p.height - padding * 2, 12)
    }

    const drawNotes = (state: TimelineState) => {
      const { notes } = state
      if (!notes.length) {
        p.fill(80)
        p.textAlign(p.CENTER, p.CENTER)
        p.text('Add notes in the piano roll to mirror them here.', p.width / 2, p.height / 2)
        return
      }

      const maxPos = notes.reduce((max, note) => Math.max(max, note.position + note.duration), 4)
      const minPos = notes.reduce((min, note) => Math.min(min, note.position), 0)
      const span = Math.max(maxPos - minPos, 4)

      const firstNote = notes[0]!
      const minPitch = notes.reduce((min, note) => Math.min(min, note.pitch), firstNote.pitch)
      const maxPitch = notes.reduce((max, note) => Math.max(max, note.pitch), firstNote.pitch)
      const pitchRange = Math.max(maxPitch - minPitch, 1)

      const innerWidth = p.width - padding * 2
      const timelineHeight = p.height - padding * 2
      const quartToPixels = innerWidth / span
      const noteHeight = Math.max(timelineHeight / Math.min(pitchRange + 1, 24), 6)
      const usableHeight = Math.max(timelineHeight - noteHeight, 0)

      notes.forEach((note) => {
        const velocity = Math.min(1, Math.max(0.2, (note.velocity ?? 100) / 127))
        const brightness = 160 + velocity * 70
        const x = padding + (note.position - minPos) * quartToPixels
        const pitchRatio = (note.pitch - minPitch) / pitchRange
        const y = padding + usableHeight - pitchRatio * usableHeight
        const w = Math.max(note.duration * quartToPixels, 3)

        p.fill(255, 120, 140, brightness)
        p.rect(x, y, w, noteHeight, 6)
      })
    }

    const drawIndicators = (state: TimelineState) => {
      const { queuePosition, playheadPosition, notes } = state
      if (!notes.length) return

      const maxPos = notes.reduce((max, note) => Math.max(max, note.position + note.duration), 4)
      const minPos = notes.reduce((min, note) => Math.min(min, note.position), 0)
      const span = Math.max(maxPos - minPos, 4)
      const innerWidth = p.width - padding * 2
      const quartToPixels = innerWidth / span
      const offset = padding - minPos * quartToPixels

      p.strokeWeight(2)

      p.stroke(0, 180, 90)
      p.line(offset + queuePosition * quartToPixels, padding, offset + queuePosition * quartToPixels, p.height - padding)

      p.stroke(255, 136, 0)
      p.line(offset + playheadPosition * quartToPixels, padding, offset + playheadPosition * quartToPixels, p.height - padding)

      p.noStroke()
    }

    const drawLabels = (state: TimelineState) => {
      p.fill(40)
      p.textAlign(p.LEFT, p.BOTTOM)
      const labelBaseY = p.height - padding / 2 + 8
      p.text(`Notes: ${state.notes.length}`, padding + 6, labelBaseY)
      p.text(
        `Playhead: ${state.playheadPosition.toFixed(2)} • Queue: ${state.queuePosition.toFixed(2)}`,
        padding + 6,
        labelBaseY - 16
      )
    }

    p.setup = () => {
      const canvas = p.createCanvas(560, 260)
      canvas.parent(root)
      p.frameRate(60)
      p.textFont('Inter, sans-serif')
      p.textSize(12)
      p.noStroke()
    }

    p.draw = () => {
      p.clear()
      p.background(235)
      const state = props.state
      drawTimelineBackground()
      drawNotes(state)
      drawIndicators(state)
      drawLabels(state)
    }
  }, root)
}

onMounted(() => {
  if (containerRef.value) {
    createSketch(containerRef.value)
  }
})

onBeforeUnmount(() => {
  sketch?.remove()
  sketch = null
})
</script>

<template>
  <div ref="containerRef" class="timeline-container"></div>
</template>

<style scoped>
.timeline-container canvas {
  display: block;
  width: 100%;
  max-width: 640px;
  border-radius: 12px;
  margin: 0 auto;
  box-shadow: inset 0 0 0 1px rgba(48, 53, 83, 0.12);
}
</style>
