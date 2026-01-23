<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import PianoRollRoot from '@/pianoRoll/PianoRollRoot.vue';
import type { MpePitchPoint, NoteData, NoteDataInput } from '@/pianoRoll/pianoRollState';
import { Scale } from '@/music/scale';
import { abletonNoteToPianoRollNote, pianoRollNoteToAbletonNote, scaleTransposeMPE } from '@/io/abletonClips';

const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []
const initialNotes: Array<[string, NoteData]> = [
  ['note-1', { id: 'note-1', pitch: 60, position: 0, duration: 1, velocity: 100 }],
  ['note-2', { id: 'note-2', pitch: 64, position: 0, duration: 1, velocity: 100 }],
  ['note-3', { id: 'note-3', pitch: 67, position: 0, duration: 1, velocity: 100 }],
  ['note-4', { id: 'note-4', pitch: 72, position: 2, duration: 1.5, velocity: 96 }],
  ['note-5', { id: 'note-5', pitch: 69, position: 3.5, duration: 0.5, velocity: 92 }]
]
type PianoRollRootInstance = InstanceType<typeof PianoRollRoot> & {
  setNotes(notes: NoteDataInput[]): void
}

const pianoRollRef = ref<PianoRollRootInstance | null>(null)
const latestNotes = ref<Array<[string, NoteData]>>(initialNotes)

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

const handleNotesUpdate = (notes: Array<[string, NoteData]>) => {
  latestNotes.value = notes
}

const transposeDownScale = () => {
  const scale = new Scale()
  const updatedNotes = latestNotes.value.map(([id, note]) => {
    const abletonNote = pianoRollNoteToAbletonNote(note)
    const transposed = scaleTransposeMPE(abletonNote, -1, scale)
    const pianoRollNote = abletonNoteToPianoRollNote(transposed, id)
    return {
      ...pianoRollNote,
      id
    }
  })

  pianoRollRef.value?.setNotes(updatedNotes)
}

const convertToSlides = (notes: Array<[string, NoteData]>, slideDurationBeats = 0.1): NoteDataInput[] => {
  if (notes.length === 0) return []

  const sortedNotes = [...notes]
    .map(([id, note]) => ({ id, note }))
    .sort((a, b) => {
      const posDelta = a.note.position - b.note.position
      if (posDelta !== 0) return posDelta
      return a.note.pitch - b.note.pitch
    })

  const baseEntry = sortedNotes[0]
  const baseNote = baseEntry.note
  const baseStart = baseNote.position
  const basePitch = baseNote.pitch
  const baseVelocity = baseNote.velocity ?? 100
  const endTime = sortedNotes.reduce((maxEnd, entry) => {
    const noteEnd = entry.note.position + entry.note.duration
    return Math.max(maxEnd, noteEnd)
  }, baseStart + baseNote.duration)
  const totalDuration = Math.max(endTime - baseStart, baseNote.duration)

  if (sortedNotes.length === 1 || totalDuration <= 0) {
    return [{
      id: baseEntry.id,
      pitch: basePitch,
      position: baseStart,
      duration: totalDuration > 0 ? totalDuration : baseNote.duration,
      velocity: baseVelocity,
      metadata: baseNote.metadata
    }]
  }

  const safeSlideDuration = Math.max(0, slideDurationBeats)
  const epsilon = 1e-6
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const toNormalizedTime = (absoluteTime: number) => {
    if (totalDuration <= 0) return 0
    return clamp((absoluteTime - baseStart) / totalDuration, 0, 1)
  }

  const points: MpePitchPoint[] = []
  points.push({ time: 0, pitchOffset: 0 })

  for (let i = 0; i < sortedNotes.length - 1; i += 1) {
    const current = sortedNotes[i].note
    const next = sortedNotes[i + 1].note
    const currentStart = current.position
    const nextStart = next.position
    const currentOffset = current.pitch - basePitch
    const nextOffset = next.pitch - basePitch
    const halfTime = currentStart + (nextStart - currentStart) / 2
    const slideStartAbsolute = Math.max(nextStart - safeSlideDuration, halfTime)
    const slideStart = toNormalizedTime(slideStartAbsolute)
    const nextTime = toNormalizedTime(nextStart)

    if (slideStart < nextTime - epsilon) {
      points.push({ time: slideStart, pitchOffset: currentOffset })
    }
    points.push({ time: nextTime, pitchOffset: nextOffset })
  }

  const lastOffset = sortedNotes[sortedNotes.length - 1].note.pitch - basePitch
  const endTimeNormalized = toNormalizedTime(endTime)
  if (endTimeNormalized > 0) {
    const lastPoint = points[points.length - 1]
    if (!lastPoint || Math.abs(lastPoint.time - endTimeNormalized) > epsilon) {
      points.push({ time: endTimeNormalized, pitchOffset: lastOffset })
    } else {
      lastPoint.pitchOffset = lastOffset
    }
  }

  const sortedPoints = points
    .slice()
    .sort((a, b) => a.time - b.time)
    .reduce((acc, point) => {
      const prev = acc[acc.length - 1]
      if (prev && Math.abs(prev.time - point.time) <= epsilon) {
        acc[acc.length - 1] = point
      } else {
        acc.push(point)
      }
      return acc
    }, [] as MpePitchPoint[])

  return [{
    id: baseEntry.id,
    pitch: basePitch,
    position: baseStart,
    duration: totalDuration,
    velocity: baseVelocity,
    mpePitch: { points: sortedPoints },
    metadata: baseNote.metadata
  }]
}

const handleConvertToSlides = () => {
  const updatedNotes = convertToSlides(latestNotes.value, 0.1)
  pianoRollRef.value?.setNotes(updatedNotes)
}

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    

    
    appState.drawFunctions.push((p: p5) => {
      // console.log("drawing circles", appState.circles.list.length)

    })

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })

  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <div>
    <button @click="transposeDownScale">Transpose down 1 scale degree</button>
    <button @click="handleConvertToSlides">Convert to slides</button>
    <PianoRollRoot ref="pianoRollRef" :initial-notes="initialNotes" @notes-update="handleNotesUpdate" />
  </div>
</template>

<style scoped></style>
