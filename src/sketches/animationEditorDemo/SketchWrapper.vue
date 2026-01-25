<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { AnimationEditorView } from '@/animationEditor'
import type { TrackDef } from '@/animationEditor'

const editorRef = ref<InstanceType<typeof AnimationEditorView> | null>(null)
const currentTime = ref(0)

// Demo state - controlled by track callbacks
const numberSliderValue = ref(0)
const numberSliderValue2 = ref(0)
const numberSliderValue3 = ref(0)
const enumDisplayValue = ref('')
const funcTriggerLog = ref('')

// Mock data for testing
const mockNumberTrack: TrackDef = {
  name: 'object1.position.x',
  fieldType: 'number',
  data: [
    { time: 0, element: 0.2 },
    { time: 2, element: 0.8 },
    { time: 4, element: 0.3 },
    { time: 6, element: 0.9 },
    { time: 8, element: 0.5 },
  ],
  low: 0,
  high: 1,
  updateNumber: (v) => {
    numberSliderValue.value = v
  },
}

const mockNumberTrack2: TrackDef = {
  name: 'object1.position.y',
  fieldType: 'number',
  data: [
    { time: 0, element: 0.5 },
    { time: 2, element: 0.1 },
    { time: 4, element: 0.7 },
    { time: 6, element: 0.4 },
    { time: 8, element: 0.9 },
  ],
  low: 0,
  high: 1,
  updateNumber: (v) => {
    numberSliderValue2.value = v
  },
}

const mockNumberTrack3: TrackDef = {
  name: 'object1.rotation',
  fieldType: 'number',
  data: [
    { time: 0, element: 0 },
    { time: 2.5, element: 0.25 },
    { time: 5, element: 0.75 },
    { time: 7.5, element: 1 },
  ],
  low: 0,
  high: 1,
  updateNumber: (v) => {
    numberSliderValue3.value = v
  },
}

const mockEnumTrack: TrackDef = {
  name: 'object1.state',
  fieldType: 'enum',
  data: [
    { time: 0, element: 'idle' },
    { time: 2.5, element: 'walking' },
    { time: 5, element: 'running' },
    { time: 7.5, element: 'jumping' },
  ],
  updateEnum: (v) => {
    enumDisplayValue.value = v
  },
}

const mockFuncTrack: TrackDef = {
  name: 'events.triggers',
  fieldType: 'func',
  data: [
    { time: 1, element: { funcName: 'playSound', args: ['beep'] } },
    { time: 3, element: { funcName: 'spawnParticle', args: [100, 200] } },
    { time: 5.5, element: { funcName: 'flash', args: [] } },
    { time: 8, element: { funcName: 'playSound', args: ['boom'] } },
  ],
  updateFunc: (funcName, ...args) => {
    const argsStr = args.map(a => JSON.stringify(a)).join(', ')
    funcTriggerLog.value = `${funcName}(${argsStr}) @ ${Date.now()}`
  },
}

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.addTrack(mockNumberTrack)
    editorRef.value.addTrack(mockNumberTrack2)
    editorRef.value.addTrack(mockNumberTrack3)
    editorRef.value.addTrack(mockEnumTrack)
    editorRef.value.addTrack(mockFuncTrack)
  }
})

function onSliderInput(e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  currentTime.value = value
  editorRef.value?.scrubToTime(value)
}
</script>

<template>
  <div class="app">
    <!-- Demo display panel -->
    <div class="demo-panel">
      <div class="demo-item">
        <label>Position X:</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="numberSliderValue"
          disabled
          class="demo-slider"
        />
        <span class="demo-value">{{ numberSliderValue.toFixed(3) }}</span>
      </div>
      <div class="demo-item">
        <label>Position Y:</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="numberSliderValue2"
          disabled
          class="demo-slider"
        />
        <span class="demo-value">{{ numberSliderValue2.toFixed(3) }}</span>
      </div>
      <div class="demo-item">
        <label>Rotation:</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          :value="numberSliderValue3"
          disabled
          class="demo-slider"
        />
        <span class="demo-value">{{ numberSliderValue3.toFixed(3) }}</span>
      </div>
      <div class="demo-item">
        <label>Enum Track Output:</label>
        <div class="enum-display">{{ enumDisplayValue || '(none)' }}</div>
      </div>
      <div class="demo-item">
        <label>Func Track Trigger:</label>
        <div class="func-display">{{ funcTriggerLog || '(no trigger yet)' }}</div>
      </div>
    </div>

    <!-- Scrub controls -->
    <div class="controls">
      <label class="time-label">
        Time: {{ currentTime.toFixed(2) }}
      </label>
      <input
        type="range"
        min="0"
        max="10"
        step="0.01"
        :value="currentTime"
        @input="onSliderInput"
        class="time-slider"
      />
    </div>

    <!-- Animation editor -->
    <div class="editor-container">
      <AnimationEditorView
        ref="editorRef"
        :duration="10"
      />
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d0d1a;
}

.demo-panel {
  display: flex;
  /* flex-direction: column; */
  max-width: 1000px;
  gap: 24px;
  padding: 12px 16px;
  background: #12122a;
  border-bottom: 1px solid #333;
  flex-wrap: wrap;
}

.demo-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.demo-item label {
  color: #888;
  font-family: system-ui, sans-serif;
  font-size: 12px;
  white-space: nowrap;
}

.demo-slider {
  width: 120px;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: #333;
  border-radius: 3px;
  outline: none;
}

.demo-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #4cc9f0;
  border-radius: 50%;
}

.demo-value {
  color: #4cc9f0;
  font-family: monospace;
  font-size: 12px;
  min-width: 50px;
}

.enum-display {
  background: #1a1a2e;
  padding: 4px 12px;
  border-radius: 4px;
  color: #f0a500;
  font-family: monospace;
  font-size: 12px;
  min-width: 80px;
  text-align: center;
}

.func-display {
  background: #1a1a2e;
  padding: 4px 12px;
  border-radius: 4px;
  color: #f72585;
  font-family: monospace;
  font-size: 11px;
  min-width: 200px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: #1a1a2e;
  border-bottom: 1px solid #333;
}

.time-label {
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  min-width: 100px;
}

.time-slider {
  flex: 1;
  height: 8px;
  -webkit-appearance: none;
  appearance: none;
  background: #333;
  border-radius: 4px;
  outline: none;
}

.time-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #7b2cbf;
  border-radius: 50%;
  cursor: pointer;
}

.time-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #7b2cbf;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.editor-container {
  width: 1000px;
  height: 600px;
  flex: 1;
  overflow: hidden;
}
</style>
