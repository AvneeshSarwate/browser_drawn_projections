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
import * as Tone from 'tone';
import { getFMSynthChain, TONE_AUDIO_START } from '@/music/synths';
import { m2f } from '@/music/mpeSynth';
import { AbletonClip, abletonNoteToPianoRollNote, pianoRollNoteToAbletonNote, scaleTransposeMPE } from '@/io/abletonClips';
import { MIDI_READY, midiOutputs, getMPEDevice } from '@/io/midi';
import { playMPEClip, type ClipPlaybackHandle } from '@/io/mpePlayback';

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
const midiOutputNames = ref<string[]>([])
const selectedMidiOutput = ref<string>('')
const activePlayback = ref<{ handle: ClipPlaybackHandle; context: CancelablePromisePoxy<any> } | null>(null)
const activePlaybackContext = ref<CancelablePromisePoxy<any> | null>(null)
const activeSynthPlayback = ref<CancelablePromisePoxy<any> | null>(null)
const slideDebugPitch = ref<number | null>(null)
const slideDebugFreq = ref<number | null>(null)

const fmChain = getFMSynthChain({ monophonic: true })
const fmSynth = fmChain.instrument as Tone.FMSynth

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

const refreshMidiOutputs = () => {
  midiOutputNames.value = Array.from(midiOutputs.keys())
  if (!selectedMidiOutput.value || !midiOutputs.has(selectedMidiOutput.value)) {
    selectedMidiOutput.value = midiOutputNames.value[0] ?? ''
  }
}

const configureMpeOutput = async (outputName: string, pitchBendRange = 48) => {
  const output = midiOutputs.get(outputName)
  if (!output) return false
  try {
    // Lower zone with 15 member channels (standard MPE), no upper zone
    await output.initializeMPE(15, 0, 10)
    for (let channel = 1; channel <= 16; channel += 1) {
      await output.setPitchBendSensitivity(pitchBendRange, 0, channel, 10)
    }
    return true
  } catch (err) {
    console.warn('Failed to configure MPE output', err)
    return false
  }
}

const buildClipFromNotes = (notes: Array<[string, NoteData]>) => {
  const abletonNotes = notes.map(([id, note]) => {
    const abletonNote = pianoRollNoteToAbletonNote(note)
    return {
      ...abletonNote,
      noteId: id
    }
  })
  const duration = notes.reduce((maxEnd, [, note]) => {
    const end = note.position + note.duration
    return Math.max(maxEnd, end)
  }, 0)
  return new AbletonClip('piano-roll', duration, abletonNotes)
}

const stopPianoRollPlayback = () => {
  const playback = activePlayback.value
  if (playback) {
    playback.handle.cancel()
    playback.context.cancel()
  }
  activePlaybackContext.value?.cancel()
  activePlayback.value = null
  activePlaybackContext.value = null
}

const stopSynthPlayback = () => {
  activeSynthPlayback.value?.cancel()
  activeSynthPlayback.value = null
  slideDebugPitch.value = null
  slideDebugFreq.value = null
  try {
    fmSynth.triggerRelease()
    const now = Tone.now()
    if (fmSynth.frequency?.cancelAndHoldAtTime) {
      fmSynth.frequency.cancelAndHoldAtTime(now)
    } else if (fmSynth.frequency?.cancelScheduledValues) {
      fmSynth.frequency.cancelScheduledValues(now)
    }
  } catch (err) {
    console.warn('Failed to stop synth playback', err)
  }
}

const stopAllPlayback = () => {
  stopPianoRollPlayback()
  stopSynthPlayback()
}

const normalizeMpePoints = (points: MpePitchPoint[] | undefined): MpePitchPoint[] => {
  if (!points || points.length === 0) {
    return [
      { time: 0, pitchOffset: 0 },
      { time: 1, pitchOffset: 0 }
    ]
  }
  const sorted = [...points].sort((a, b) => a.time - b.time)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const anchored: MpePitchPoint[] = [...sorted]
  if (first.time > 0) {
    anchored.unshift({ time: 0, pitchOffset: first.pitchOffset })
  }
  if (last.time < 1) {
    anchored.push({ time: 1, pitchOffset: last.pitchOffset })
  }
  return anchored
}

const getPitchOffsetAt = (points: MpePitchPoint[], normTime: number) => {
  if (points.length === 0) return 0
  const clamped = Math.max(0, Math.min(1, normTime))
  if (clamped <= points[0].time) return points[0].pitchOffset
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i]
    const next = points[i + 1]
    if (clamped <= next.time) {
      const span = next.time - current.time
      if (span <= 0) return next.pitchOffset
      const t = (clamped - current.time) / span
      return current.pitchOffset + t * (next.pitchOffset - current.pitchOffset)
    }
  }
  return points[points.length - 1].pitchOffset
}

const playSlideNoteOnSynth = async (ctx: TimeContext, note: NoteData) => {
  const basePitch = note.pitch
  const velocity = (note.velocity ?? 100) / 127
  const durationBeats = note.duration ?? 0
  if (durationBeats <= 0) return

  const points = normalizeMpePoints(note.mpePitch?.points)
  const durationSec = durationBeats * 60 / ctx.bpm
  const initialOffset = getPitchOffsetAt(points, 0)

  fmSynth.triggerAttack(m2f(basePitch + initialOffset), undefined, velocity)
  const now = Tone.now()
  if (fmSynth.frequency?.cancelAndHoldAtTime) {
    fmSynth.frequency.cancelAndHoldAtTime(now)
  } else if (fmSynth.frequency?.cancelScheduledValues) {
    fmSynth.frequency.cancelScheduledValues(now)
  }

  const startProgTime = ctx.progTime
  try {
    while (true) {
      const elapsedSec = ctx.progTime - startProgTime
      if (elapsedSec >= durationSec) break
      const normTime = durationSec > 0 ? elapsedSec / durationSec : 1
      const pitchOffset = getPitchOffsetAt(points, normTime)
      const pitch = basePitch + pitchOffset
      const freq = m2f(pitch)
      slideDebugPitch.value = pitch
      slideDebugFreq.value = freq
      fmSynth.frequency.setValueAtTime(freq, Tone.now())
      await ctx.waitSec(1 / 60)
    }
    const finalOffset = getPitchOffsetAt(points, 1)
    const finalPitch = basePitch + finalOffset
    slideDebugPitch.value = finalPitch
    slideDebugFreq.value = m2f(finalPitch)
    fmSynth.frequency.setValueAtTime(slideDebugFreq.value, Tone.now())
  } finally {
    fmSynth.triggerRelease()
  }
}

const playPianoRollSlidesSynth = async () => {
  await TONE_AUDIO_START
  stopSynthPlayback()

  const sortedNotes = [...latestNotes.value]
    .map(([, note]) => note)
    .sort((a, b) => {
      const posDelta = a.position - b.position
      if (posDelta !== 0) return posDelta
      return a.pitch - b.pitch
    })

  if (sortedNotes.length === 0) {
    console.warn('No notes to play')
    return
  }

  activeSynthPlayback.value = launch(async (ctx) => {
    for (const note of sortedNotes) {
      const currentBeats = ctx.progBeats
      const noteStart = note.position ?? 0
      if (noteStart > currentBeats) {
        await ctx.wait(noteStart - currentBeats)
      }
      await playSlideNoteOnSynth(ctx, note)
    }
  })
}

const playPianoRoll = async () => {
  await MIDI_READY
  refreshMidiOutputs()

  if (!selectedMidiOutput.value) {
    console.warn('No MIDI output selected')
    return
  }

  const configured = await configureMpeOutput(selectedMidiOutput.value, 48)
  if (!configured) {
    console.warn('Unable to configure MPE output')
  }

  const device = getMPEDevice(selectedMidiOutput.value, { zone: 'lower' })
  if (!device) {
    console.warn('Failed to create MPE device')
    return
  }

  stopPianoRollPlayback()

  const clip = buildClipFromNotes(latestNotes.value)
  if (clip.notes.length === 0 || clip.duration <= 0) {
    console.warn('No notes to play')
    return
  }

  const context = launch(async (ctx) => {
    const handle = playMPEClip(clip, ctx, device, { pitchBendRange: 48 })
    activePlayback.value = { handle, context }
    await handle.promise
    activePlayback.value = null
  })
  activePlaybackContext.value = context
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

const randomInRange = (min: number, max: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return lo + Math.random() * (hi - lo)
}

const buildSlideNoteFromSequence = (
  sequence: Array<{ id: string; note: NoteData }>,
  slideDurations: number[],
  fallbackSlideDuration = 0.1
): NoteDataInput => {
  const baseEntry = sequence[0]
  const baseNote = baseEntry.note
  const baseStart = baseNote.position
  const basePitch = baseNote.pitch
  const baseVelocity = baseNote.velocity ?? 100
  const endTime = sequence.reduce((maxEnd, entry) => {
    const noteEnd = entry.note.position + entry.note.duration
    return Math.max(maxEnd, noteEnd)
  }, baseStart + baseNote.duration)
  const totalDuration = Math.max(endTime - baseStart, baseNote.duration)

  const safeSlideDuration = Math.max(0, fallbackSlideDuration)
  const epsilon = 1e-6
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const toNormalizedTime = (absoluteTime: number) => {
    if (totalDuration <= 0) return 0
    return clamp((absoluteTime - baseStart) / totalDuration, 0, 1)
  }

  const points: MpePitchPoint[] = []
  points.push({ time: 0, pitchOffset: 0 })

  for (let i = 0; i < sequence.length - 1; i += 1) {
    const current = sequence[i].note
    const next = sequence[i + 1].note
    const currentStart = current.position
    const nextStart = next.position
    const currentOffset = current.pitch - basePitch
    const nextOffset = next.pitch - basePitch
    const halfTime = currentStart + (nextStart - currentStart) / 2
    const slideDuration = slideDurations[i] ?? safeSlideDuration
    const slideStartAbsolute = Math.max(nextStart - slideDuration, halfTime)
    const slideStart = toNormalizedTime(slideStartAbsolute)
    const nextTime = toNormalizedTime(nextStart)

    if (slideStart < nextTime - epsilon) {
      points.push({ time: slideStart, pitchOffset: currentOffset })
    }
    points.push({ time: nextTime, pitchOffset: nextOffset })
  }

  const lastOffset = sequence[sequence.length - 1].note.pitch - basePitch
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

  return {
    id: baseEntry.id,
    pitch: basePitch,
    position: baseStart,
    duration: totalDuration,
    velocity: baseVelocity,
    mpePitch: { points: sortedPoints },
    metadata: baseNote.metadata
  }
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

const convertToSmartSlides = (
  notes: Array<[string, NoteData]>,
  closeThreshold: number,
  joinProbability: number
): NoteDataInput[] => {
  if (notes.length === 0) return []

  const sortedNotes = [...notes]
    .map(([id, note]) => ({ id, note }))
    .sort((a, b) => {
      const posDelta = a.note.position - b.note.position
      if (posDelta !== 0) return posDelta
      return a.note.pitch - b.note.pitch
    })

  const safeThreshold = Math.max(0, closeThreshold)
  const safeProbability = Math.max(0, Math.min(1, joinProbability))
  const closeSlideDuration = randomInRange(0.03, Math.max(0.03, Math.min(0.25, safeThreshold * 0.9)))
  const randomSlideDuration = () => randomInRange(0.03, 0.25)

  const groups: Array<{ notes: Array<{ id: string; note: NoteData }>; slideDurations: number[] }> = []
  let currentGroup = { notes: [sortedNotes[0]], slideDurations: [] as number[] }

  for (let i = 0; i < sortedNotes.length - 1; i += 1) {
    const current = sortedNotes[i].note
    const next = sortedNotes[i + 1].note
    const gap = next.position - current.position

    let join = false
    let slideDuration = 0.1
    if (gap <= safeThreshold) {
      join = true
      slideDuration = closeSlideDuration
    } else if (Math.random() < safeProbability) {
      join = true
      slideDuration = randomSlideDuration()
    }

    if (join) {
      currentGroup.notes.push(sortedNotes[i + 1])
      currentGroup.slideDurations.push(slideDuration)
    } else {
      groups.push(currentGroup)
      currentGroup = { notes: [sortedNotes[i + 1]], slideDurations: [] }
    }
  }
  groups.push(currentGroup)

  return groups.flatMap(group => {
    if (group.notes.length === 1) {
      const entry = group.notes[0]
      return [{
        id: entry.id,
        pitch: entry.note.pitch,
        position: entry.note.position,
        duration: entry.note.duration,
        velocity: entry.note.velocity,
        mpePitch: entry.note.mpePitch,
        metadata: entry.note.metadata
      }]
    }
    return [buildSlideNoteFromSequence(group.notes, group.slideDurations, 0.1)]
  })
}

const handleConvertToSlides = () => {
  const updatedNotes = convertToSlides(latestNotes.value, 0.1)
  pianoRollRef.value?.setNotes(updatedNotes)
}

const smartSmoothThreshold = ref(0.25)
const smartSmoothProbability = ref(0.3)

const handleSmartSmooth = () => {
  const updatedNotes = convertToSmartSlides(
    latestNotes.value,
    Number(smartSmoothThreshold.value),
    Number(smartSmoothProbability.value)
  )
  pianoRollRef.value?.setNotes(updatedNotes)
}

onMounted(() => {
  try {
    MIDI_READY.then(() => {
      refreshMidiOutputs()
    })

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
  stopPianoRollPlayback()
  stopSynthPlayback()
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
    <div>
      <label>
        MIDI Output:
        <select v-model="selectedMidiOutput">
          <option v-for="name in midiOutputNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <button @click="refreshMidiOutputs">Refresh MIDI Outputs</button>
      <button @click="playPianoRoll">Play Piano Roll</button>
      <button @click="playPianoRollSlidesSynth">Play FM Slides</button>
      <button @click="stopAllPlayback">Stop</button>
    </div>
    <div>
      <label>
        Smart smooth threshold (beats):
        <input type="number" step="0.01" min="0" v-model.number="smartSmoothThreshold" />
      </label>
      <label>
        Join probability:
        <input type="number" step="0.05" min="0" max="1" v-model.number="smartSmoothProbability" />
      </label>
      <button @click="handleSmartSmooth">Apply smart smooth</button>
    </div>
    <div>
      <div>Slide pitch (base + offset): {{ slideDebugPitch ?? '-' }}</div>
      <div>Slide freq (m2f): {{ slideDebugFreq ?? '-' }}</div>
    </div>
    <PianoRollRoot ref="pianoRollRef" :initial-notes="initialNotes" @notes-update="handleNotesUpdate" />
  </div>
</template>

<style scoped></style>
