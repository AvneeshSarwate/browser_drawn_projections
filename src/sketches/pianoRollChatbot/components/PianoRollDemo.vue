<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as Tone from 'tone'
import PianoRollRoot from './pianoRoll/PianoRollRoot.vue'
import ClaudeChat from './ClaudeChat.vue'
import TransformWorkbench from './TransformWorkbench.vue'
import { createTransformRegistry } from '../composables/useTransformRegistry'
import type { NoteDataInput, PianoRollState } from './pianoRoll/pianoRollState'
import type { TimelineNote, TimelineState } from '../types/timeline'
import { MIDIManager } from './pianoRoll/midiManager'

const START_DELAY = 0.05

const defaultNotes: NoteDataInput[] = [
  { id: 'note-1', pitch: 60, position: 0, duration: 1, velocity: 110 },
  { id: 'note-2', pitch: 64, position: 0, duration: 1, velocity: 105 },
  { id: 'note-3', pitch: 67, position: 0, duration: 1, velocity: 108 },
  { id: 'note-4', pitch: 72, position: 0, duration: 1, velocity: 102 },
  { id: 'note-5', pitch: 60, position: 2, duration: 1.5, velocity: 110 },
  { id: 'note-6', pitch: 67, position: 2, duration: 1.5, velocity: 108 },
  { id: 'note-7', pitch: 74, position: 2, duration: 1.5, velocity: 104 },
  { id: 'note-8', pitch: 62, position: 4, duration: 0.5, velocity: 99 },
  { id: 'note-9', pitch: 65, position: 4.5, duration: 0.5, velocity: 98 },
  { id: 'note-10', pitch: 69, position: 5, duration: 1, velocity: 101 },
  { id: 'note-11', pitch: 72, position: 6, duration: 1, velocity: 102 },
  { id: 'note-12', pitch: 79, position: 6.5, duration: 0.75, velocity: 96 }
]

type PianoRollRootInstance = InstanceType<typeof PianoRollRoot> & {
  setNotes(notes: NoteDataInput[]): void
  setLivePlayheadPosition(position: number): void
  getPlayStartPosition(): number
  fitZoomToNotes(): void
}

interface ScheduledEvent {
  note: TimelineNote
  duration: number
  velocity: number
}

interface TimedScheduledEvent extends ScheduledEvent {
  time: number
}

const pianoRollRef = ref<PianoRollRootInstance | null>(null)

const timelineState = reactive<TimelineState>({
  notes: [],
  playheadPosition: 0,
  queuePosition: 0,
  grid: {
    maxLength: 16,
    timeSignature: 4,
    subdivision: 16
  }
})

const isPlaying = ref(false)
const statusLabel = computed(() => (isPlaying.value ? 'Playing' : 'Stopped'))
const hasNotes = computed(() => timelineState.notes.length > 0)
const queueDisplay = computed(() => timelineState.queuePosition.toFixed(2))

const midiEnabled = ref(false)
const midiDevices = ref<Array<{ id: string, name: string }>>([])
const selectedMidiDevice = ref<string>('')
let midiManager: MIDIManager | null = null
const activeMidiNotes = new Set<number>()

let synth: Tone.PolySynth<Tone.Synth> | null = null
let part: Tone.Part<TimedScheduledEvent> | null = null
let rafId: number | null = null
let stopScheduleId: number | null = null
let playbackStartPosition = 0

const quarterNoteSeconds = () => 60 / Tone.Transport.bpm.value
const quartersPerSecond = () => Tone.Transport.bpm.value / 60

const clearAnimation = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

const setLivePlayhead = (position: number) => {
  timelineState.playheadPosition = position
  pianoRollRef.value?.setLivePlayheadPosition(position)
}

const syncQueuePosition = (position: number) => {
  timelineState.queuePosition = position
  if (!isPlaying.value) {
    setLivePlayhead(position)
  }
}

const clearTransportSchedules = () => {
  if (stopScheduleId !== null) {
    Tone.Transport.clear(stopScheduleId)
    stopScheduleId = null
  }
  Tone.Transport.cancel()
}

const stopPlayback = (resetToQueue = true) => {
  if (!isPlaying.value && !part) {
    return
  }

  Tone.Transport.stop()
  clearTransportSchedules()

  if (part) {
    part.stop(0)
    part.dispose()
    part = null
  }

  clearAnimation()
  isPlaying.value = false

  // Send MIDI note off for any active notes
  if (midiManager) {
    activeMidiNotes.forEach(pitch => {
      midiManager?.sendNoteOff(pitch)
    })
    activeMidiNotes.clear()
  }

  if (resetToQueue) {
    const target = pianoRollRef.value?.getPlayStartPosition?.() ?? timelineState.queuePosition ?? 0
    setLivePlayhead(target)
  }
}

const scheduleAnimation = () => {
  clearAnimation()
  const update = () => {
    if (!isPlaying.value) return
    const elapsedSeconds = Tone.Transport.seconds
    const currentQuarter = playbackStartPosition + elapsedSeconds * quartersPerSecond()
    setLivePlayhead(currentQuarter)
    rafId = requestAnimationFrame(update)
  }
  rafId = requestAnimationFrame(update)
}

const startPlayback = async () => {
  if (!hasNotes.value) return

  synth ??= new Tone.PolySynth(Tone.Synth).toDestination()

  await Tone.start()

  if (isPlaying.value) {
    stopPlayback(false)
  }

  playbackStartPosition = pianoRollRef.value?.getPlayStartPosition?.() ?? timelineState.queuePosition
  const activeNotes = timelineState.notes
    .filter((note) => note.position + note.duration > playbackStartPosition)
    .map((note) => ({
      note,
      offset: Math.max(0, note.position - playbackStartPosition)
    }))

  if (!activeNotes.length) {
    setLivePlayhead(playbackStartPosition)
    return
  }

  const quarterSeconds = quarterNoteSeconds()
  const scheduledEvents = activeNotes.map<TimedScheduledEvent>((entry) => {
    const velocity = Math.max(0, Math.min(1, (entry.note.velocity ?? 100) / 127))
    return {
      note: entry.note,
      time: entry.offset * quarterSeconds,
      velocity,
      duration: Math.max(entry.note.duration, 0.0625) * quarterSeconds
    }
  })

  if (part) {
    part.stop(0)
    part.dispose()
    part = null
  }

  clearTransportSchedules()

  part = new Tone.Part<TimedScheduledEvent>((time, event) => {
    // Only play built-in synth if MIDI output is disabled
    if (!midiEnabled.value) {
      const noteName = Tone.Frequency(event.note.pitch, 'midi').toNote()
      synth?.triggerAttackRelease(noteName, event.duration, time, event.velocity)
    }
    
    // Send MIDI note on
    if (midiEnabled.value && midiManager) {
      const pitch = event.note.pitch
      midiManager.sendNoteOn(pitch, event.velocity)
      activeMidiNotes.add(pitch)
      
      // Schedule MIDI note off
      const manager = midiManager
      Tone.Transport.scheduleOnce(() => {
        manager?.sendNoteOff(pitch)
        activeMidiNotes.delete(pitch)
      }, `+${event.duration}`)
    }
  }, scheduledEvents)

  part.start(0)

  Tone.Transport.stop()
  Tone.Transport.position = 0
  Tone.Transport.start(`+${START_DELAY.toFixed(3)}`)

  isPlaying.value = true
  setLivePlayhead(playbackStartPosition)

  const playbackDuration = scheduledEvents.reduce((end, event) => Math.max(end, event.time + event.duration), 0)

  stopScheduleId = Tone.Transport.scheduleOnce(() => {
    stopPlayback()
  }, playbackDuration + 0.1)

  scheduleAnimation()
}

const handlePlayClick = () => {
  startPlayback().catch((error) => console.error(error))
}

const handleStopClick = () => {
  stopPlayback()
}

const handleStateSync = (state: PianoRollState) => {
  const notes: TimelineNote[] = Array.from(state.notes.values())
    .map((note) => ({
      id: note.id,
      pitch: note.pitch,
      position: note.position,
      duration: note.duration,
      velocity: note.velocity,
      selected: state.selection.selectedIds.has(note.id)
    }))
    .sort((a, b) => a.position - b.position)

  timelineState.notes = notes
  timelineState.grid.maxLength = state.grid.maxLength
  timelineState.grid.timeSignature = state.grid.timeSignature
  timelineState.grid.subdivision = state.grid.subdivision

  syncQueuePosition(state.queuePlayhead.position)

  stopPlayback()
}

const getNotes = (): NoteDataInput[] => {
  return timelineState.notes.map(n => ({
    id: n.id,
    pitch: n.pitch,
    position: n.position,
    duration: n.duration,
    velocity: n.velocity ?? 100,
    selected: n.selected
  }))
}

const setNotesViaRef = (notes: NoteDataInput[]) => {
  pianoRollRef.value?.setNotes(notes)
}

const getGrid = () => ({
  maxLength: timelineState.grid.maxLength,
  timeSignature: timelineState.grid.timeSignature,
  subdivision: timelineState.grid.subdivision
})

const transformRegistry = createTransformRegistry({
  getNotes,
  setNotes: setNotesViaRef,
  getGrid
})

onMounted(async () => {
  Tone.Transport.loop = false
  Tone.Transport.bpm.value = 120

  // Initialize MIDI
  try {
    midiManager = new MIDIManager()
    await midiManager.initialize()
    midiDevices.value = midiManager.getAvailableDevices()
    
    if (midiDevices.value.length > 0) {
      selectedMidiDevice.value = midiDevices.value[0]?.id || ''
      if (selectedMidiDevice.value) {
        midiManager.selectDevice(selectedMidiDevice.value)
      }
    }
  } catch (error) {
    console.warn('MIDI not available:', error)
  }

  nextTick(() => {
    if (!pianoRollRef.value) return
    pianoRollRef.value.setNotes(defaultNotes)
    pianoRollRef.value.fitZoomToNotes()
    syncQueuePosition(pianoRollRef.value.getPlayStartPosition?.() ?? 0)
  })
})

onBeforeUnmount(() => {
  stopPlayback(false)
  clearTransportSchedules()
  synth?.dispose()
  synth = null
  midiManager?.disconnect()
  midiManager = null
})

watch(midiEnabled, (enabled) => {
  midiManager?.setEnabled(enabled)
})

watch(selectedMidiDevice, (deviceId) => {
  if (deviceId && midiManager) {
    midiManager.selectDevice(deviceId)
  }
})
</script>

<template>
  <div class="layout">
    <div class="piano-roll-row">
      <section class="piano-roll-card">
        <div class="controls">
          <button
            class="play-toggle"
            :class="{ playing: isPlaying }"
            @click="isPlaying ? handleStopClick() : handlePlayClick()"
            :disabled="!isPlaying && !hasNotes"
            :aria-pressed="isPlaying"
            :title="isPlaying ? 'Stop' : 'Play'"
          >
            {{ isPlaying ? 'Stop' : 'Play' }}
          </button>
          <span class="status" :class="{ playing: isPlaying }">{{ statusLabel }}</span>
          <span class="separator">|</span>
          <label class="midi-control">
            <input type="checkbox" v-model="midiEnabled" :disabled="midiDevices.length === 0" />
            MIDI Out
          </label>
          <label v-if="midiDevices.length > 0" class="midi-control">
            Device:
            <select v-model="selectedMidiDevice" :disabled="!midiEnabled">
              <option v-for="device in midiDevices" :key="device.id" :value="device.id">
                {{ device.name }}
              </option>
            </select>
          </label>
        </div>
        <p class="note">Use the green queue playhead inside the roll to choose a start point, then press play.</p>
        <p class="meta">Queue start (quarter notes): <span>{{ queueDisplay }}</span></p>

        <PianoRollRoot
          ref="pianoRollRef"
          :width="600"
          :height="340"
          :show-control-panel="true"
          :interactive="true"
          :sync-state="handleStateSync"
        />
      </section>
    </div>

    <div class="bottom-row">
      <section class="transform-card">
        <TransformWorkbench :registry="transformRegistry" />
      </section>

      <section class="chatbot-card">
        <ClaudeChat 
          :get-notes="getNotes" 
          :set-notes="setNotesViaRef" 
          :get-grid="getGrid"
          :registry="transformRegistry"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.piano-roll-row {
  display: flex;
  justify-content: center;
}

.bottom-row {
  display: flex;
  gap: 24px;
  padding: 0 24px;
}

section {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 14px;
  box-shadow: none;
  padding: 20px;
  box-sizing: border-box;
}

.transform-card,
.chatbot-card {
  flex: 1;
  min-width: 0;
}

.piano-roll-card,
.chatbot-card,
.transform-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.midi-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.midi-control input[type="checkbox"] {
  -webkit-appearance: checkbox;
  appearance: auto;
  width: 16px;
  height: 16px;
  margin: 0 6px 0 0;
}

.midi-control select {
  -webkit-appearance: menulist;
  appearance: auto;
  width: auto;
  min-width: 160px;
  padding: 6px 10px;
}

.play-toggle {
  -webkit-appearance: none;
  appearance: none;
  background: var(--c-primary);
  color: #fff;
  border: 1px solid var(--c-primary);
  border-radius: 10px;
  padding: 8px 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.play-toggle:hover:not(:disabled) { 
  background: var(--c-primary-600); 
}

.play-toggle:active:not(:disabled) { 
  background: var(--c-primary-700); 
}

.play-toggle:focus-visible { 
  outline: none; 
  box-shadow: 0 0 0 3px rgba(197, 139, 84, 0.25);
}

.play-toggle.playing {
  background: var(--c-danger);
  border-color: var(--c-danger);
}

.play-toggle.playing:hover { 
  filter: brightness(0.95); 
}

.play-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  font-weight: 600;
  color: var(--c-text-muted);
}

.status.playing {
  color: var(--c-success);
}

.note {
  margin: 0;
  color: #4d5268;
  font-size: 0.95rem;
}

.meta {
  margin: 0;
  color: #2f7f48;
  font-weight: 600;
}

.meta span {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .bottom-row {
    flex-direction: column;
    padding: 0;
  }
}
</style>
