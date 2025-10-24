<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { createPianoRollState, type PianoRollState, type NoteData, type NoteDataInput } from './pianoRollState'
import {
  initializeLayers,
  setupEventHandlers,
  renderGrid,
  renderVisibleNotes,
  renderResizeHandles,
  updateQueuePlayheadPosition,
  updateLivePlayheadPosition
} from './pianoRollCore'
import { executeOverlapChanges } from './pianoRollUtils'
import {
  applyHorizontalZoom,
  applyVerticalZoom,
  fitZoomToNotes as fitZoomToNotesHelper,
  getHorizontalViewportRange,
  getVerticalViewportRange,
  updateScrollBounds
} from './pianoRollViewport'
import {
  HorizontalScrollbarController,
  VerticalScrollbarController,
  type HorizontalDragMode,
  type VerticalDragMode
} from './pianoRollScrollbars'
import { createCommandHandlers } from './pianoRollCommands'
import { createKeyboardController } from './pianoRollKeyboard'
import { StageManager } from './pianoRollStageManager'

const props = withDefaults(defineProps<{
  width?: number
  height?: number
  initialNotes?: Array<[string, NoteData]>
  syncState?: (state: PianoRollState) => void
  showControlPanel?: boolean
  interactive?: boolean
}>(), {
  width: 640,
  height: 360,
  initialNotes: () => [],
  showControlPanel: true,
  interactive: true
})

const emit = defineEmits<{
  (event: 'notes-update', notes: Array<[string, NoteData]>): void
}>()

const state: PianoRollState = createPianoRollState()

state.viewport = reactive(state.viewport) as PianoRollState['viewport']
state.grid = reactive(state.grid) as PianoRollState['grid']

// Refs
const konvaContainer = ref<HTMLDivElement>()
const horizontalTrack = ref<HTMLDivElement>()
const verticalTrack = ref<HTMLDivElement>()
const canUndo = ref(false)
const canRedo = ref(false)
const gridSubdivision = ref(state.grid.subdivision)

// Computed properties
const noteCount = ref(state.notes.size)
const selectionCount = ref(state.selection.selectedIds.size)
const isInteractive = computed(() => props.interactive)
const showControlPanel = computed(() => props.showControlPanel)

const syncUiCounters = () => {
  noteCount.value = state.notes.size
  selectionCount.value = state.selection.selectedIds.size
}

const notifyViewportChange = () => {
  props.syncState?.(state)
}

const fitZoomToNotes = (startAtTimeZero = false) => {
  fitZoomToNotesHelper(state, props.width, props.height, notifyViewportChange, startAtTimeZero)
}

const enforceScrollBounds = () => {
  updateScrollBounds(state, props.width, props.height, notifyViewportChange)
}

const applyHorizontalZoomWithState = (newQuarterNoteWidth: number, newStartQuarter: number) => {
  applyHorizontalZoom(state, newQuarterNoteWidth, newStartQuarter, props.width, props.height, notifyViewportChange)
}

const applyVerticalZoomWithState = (newNoteHeight: number, newTopIndex: number) => {
  applyVerticalZoom(state, newNoteHeight, newTopIndex, props.width, props.height, notifyViewportChange)
}

const getHorizontalViewportRangeWithState = () => getHorizontalViewportRange(state, props.width)
const getVerticalViewportRangeWithState = () => getVerticalViewportRange(state, props.height)

const horizontalScrollbar = new HorizontalScrollbarController({
  state,
  horizontalTrack,
  isInteractive: () => props.interactive,
  getViewportRange: getHorizontalViewportRangeWithState,
  applyHorizontalZoom: applyHorizontalZoomWithState,
  enforceScrollBounds,
  notifyViewportChange,
  getFallbackWidth: () => props.width
})

const verticalScrollbar = new VerticalScrollbarController({
  state,
  verticalTrack,
  isInteractive: () => props.interactive,
  getViewportRange: getVerticalViewportRangeWithState,
  applyVerticalZoom: applyVerticalZoomWithState,
  enforceScrollBounds,
  notifyViewportChange,
  getFallbackHeight: () => props.height
})

const horizontalThumbStyle = computed(() => horizontalScrollbar.getThumbStyle())
const verticalThumbStyle = computed(() => verticalScrollbar.getThumbStyle())

const startHorizontalDrag = (mode: HorizontalDragMode, event: PointerEvent) => {
  horizontalScrollbar.startDrag(mode, event)
}

const stopHorizontalDrag = () => {
  horizontalScrollbar.stopDrag()
}

const startVerticalDrag = (mode: VerticalDragMode, event: PointerEvent) => {
  verticalScrollbar.startDrag(mode, event)
}

const stopVerticalDrag = () => {
  verticalScrollbar.stopDrag()
}

const onHorizontalTrackPointerDown = (event: PointerEvent) => {
  horizontalScrollbar.onTrackPointerDown(event)
}

const onVerticalTrackPointerDown = (event: PointerEvent) => {
  verticalScrollbar.onTrackPointerDown(event)
}

// Watch grid subdivision changes
watch(gridSubdivision, (newValue) => {
  state.grid.subdivision = newValue
  state.needsRedraw = true
  props.syncState?.(state)
})

const emitStateUpdate = () => {
  syncUiCounters()
  emit('notes-update', Array.from(state.notes.entries()))
  props.syncState?.(state)
}

state.notifyExternalChange = () => {
  emitStateUpdate()
}

const {
  undo,
  redo,
  deleteSelected,
  updateCommandStackButtons,
  handleCommandStackUpdate
} = createCommandHandlers({
  state,
  canUndo,
  canRedo,
  emitStateUpdate
})

const keyboardController = createKeyboardController({
  state,
  isInteractive: () => props.interactive,
  undo,
  redo,
  deleteSelected,
  updateCommandStackButtons,
  executeOverlapChanges,
  getContainer: () => konvaContainer.value || null
})

const stageManager = new StageManager({
  state,
  konvaContainer,
  initializeLayers,
  setupEventHandlers,
  renderGrid,
  renderVisibleNotes,
  renderResizeHandles,
  updateQueuePlayheadPosition,
  updateLivePlayheadPosition,
  handleCommandStackUpdate,
  syncUiCounters,
  enforceScrollBounds,
  attachKeyboard: () => keyboardController.attach(),
  detachKeyboard: () => keyboardController.detach()
})

onMounted(() => {
  stageManager.mount({
    width: props.width,
    height: props.height,
    interactive: props.interactive,
    initialNotes: props.initialNotes ?? []
  })
})

onUnmounted(() => {
  stopHorizontalDrag()
  stopVerticalDrag()
  stageManager.unmount()
})

watch(() => props.interactive, (interactive) => {
  stageManager.setInteractive(interactive)
  if (!interactive) {
    stopHorizontalDrag()
    stopVerticalDrag()
  }
})

watch(() => props.width, (newWidth) => {
  stageManager.resize(newWidth, props.height)
})

watch(() => props.height, (newHeight) => {
  stageManager.resize(props.width, newHeight)
})

// Expose methods for web component API
const setNotes = (notes: NoteDataInput[]) => {
  state.command.stack?.executeCommand('Set Notes', () => {
    const usedIds = new Set<string>()

    state.notes.clear()

    notes.forEach((noteInput, index) => {
      // Generate unique ID if missing or duplicate
      let id = noteInput.id || `note_${Date.now()}_${index}`
      while (usedIds.has(id)) {
        id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }
      usedIds.add(id)

      // Add default velocity if missing
      const note: NoteData = {
        ...noteInput,
        id,
        velocity: noteInput.velocity ?? 100
      }

      state.notes.set(id, note)
    })

    state.needsRedraw = true
  })
  
  updateCommandStackButtons()
  emitStateUpdate()
}

const setLivePlayheadPosition = (position: number) => {
  // Cap at max piano roll length
  state.livePlayhead.position = Math.max(0, Math.min(position, state.grid.maxLength))
  state.needsRedraw = true
}

const getPlayStartPosition = (): number => {
  return state.queuePlayhead.position
}

defineExpose({
  setNotes,
  setLivePlayheadPosition,
  getPlayStartPosition,
  fitZoomToNotes
})
</script>

<template>
  <div class="piano-roll-root">
    <div v-if="showControlPanel" class="control-panel">
      <button class="btn btn-ghost" @click="undo" :disabled="!isInteractive || !canUndo">↶ Undo</button>
      <button class="btn btn-ghost" @click="redo" :disabled="!isInteractive || !canRedo">↷ Redo</button>
      <span class="separator">|</span>
      <label>
        Grid:
        <select v-model.number="gridSubdivision" :disabled="!isInteractive">
          <option :value="4">Quarter</option>
          <option :value="8">Eighth</option>
          <option :value="16">16th</option>
          <option :value="32">32nd</option>
        </select>
      </label>
      <span class="separator">|</span>
      <button class="btn btn-ghost" @click="deleteSelected" :disabled="!isInteractive || selectionCount === 0">
        🗑️ Delete
      </button>
      <span class="separator">|</span>
      <span class="info">{{ noteCount }} notes, {{ selectionCount }} selected</span>
    </div>
    <div class="piano-roll-layout">
      <div class="stage-wrapper">
        <div
          ref="konvaContainer"
          :class="['piano-roll-container', { 'is-disabled': !isInteractive }]"
          :style="{ width: props.width + 'px', height: props.height + 'px' }"
        ></div>
        <div
          ref="horizontalTrack"
          class="scrollbar horizontal"
          :class="{ 'is-disabled': !isInteractive }"
          :style="{ width: props.width + 'px' }"
          @pointerdown.self="onHorizontalTrackPointerDown"
        >
          <div class="scrollbar-thumb horizontal-thumb" :style="horizontalThumbStyle">
            <div
              class="scrollbar-handle handle-left"
              @pointerdown.stop.prevent="startHorizontalDrag('resize-start', $event)"
            ></div>
            <div class="scrollbar-body" @pointerdown.stop.prevent="startHorizontalDrag('move', $event)"></div>
            <div
              class="scrollbar-handle handle-right"
              @pointerdown.stop.prevent="startHorizontalDrag('resize-end', $event)"
            ></div>
          </div>
        </div>
      </div>
      <div
        ref="verticalTrack"
        class="scrollbar vertical"
        :class="{ 'is-disabled': !isInteractive }"
        :style="{ height: props.height + 'px' }"
        @pointerdown.self="onVerticalTrackPointerDown"
      >
        <div class="scrollbar-thumb vertical-thumb" :style="verticalThumbStyle">
          <div
            class="scrollbar-handle handle-top"
            @pointerdown.stop.prevent="startVerticalDrag('resize-start', $event)"
          ></div>
          <div
            class="scrollbar-body vertical-body"
            @pointerdown.stop.prevent="startVerticalDrag('move', $event)"
          ></div>
          <div
            class="scrollbar-handle handle-bottom"
            @pointerdown.stop.prevent="startVerticalDrag('resize-end', $event)"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.piano-roll-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
}

.control-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  box-shadow: var(--shadow-1);
}



.separator {
  color: var(--border);
}

.info {
  color: var(--text-muted);
  font-size: var(--fs-body-3);
}

.piano-roll-container {
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: default;
  box-sizing: border-box;
  border-radius: var(--radius-md);
  outline: none;
}

.piano-roll-container:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(138, 107, 69, 0.2);
}

.piano-roll-container.is-disabled {
  pointer-events: none;
  cursor: not-allowed;
}

.piano-roll-layout {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.stage-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: stretch;
}

.scrollbar {
  position: relative;
  background: var(--surface-raised);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-sizing: border-box;
  user-select: none;
  touch-action: none;
}

.scrollbar.horizontal {
  height: 24px;
}

.scrollbar.vertical {
  width: 24px;
}

.scrollbar.is-disabled {
  opacity: .4;
  pointer-events: none;
}

.scrollbar-thumb {
  position: absolute;
  background: rgba(20, 20, 19, 0.18);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 16px;
  min-height: 16px;
  cursor: grab;
  transition: background 0.15s ease;
  box-sizing: border-box;
}

.scrollbar-thumb.horizontal-thumb {
  top: 0;
  height: 100%;
  align-items: stretch;
}

.scrollbar-thumb.vertical-thumb {
  left: 0;
  width: 100%;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
}

.scrollbar-thumb:hover {
  background: rgba(20, 20, 19, 0.25);
}

.scrollbar-body {
  flex: 1;
  height: 100%;
  cursor: grab;
}

.scrollbar-body.vertical-body {
  width: 100%;
}

.scrollbar-handle {
  background: rgba(20, 20, 19, 0.35);
  border-radius: var(--radius-xs);
  flex: 0 0 auto;
}

.handle-left,
.handle-right {
  width: 8px;
  height: 100%;
  cursor: ew-resize;
}

.handle-top,
.handle-bottom {
  width: 100%;
  height: 8px;
  cursor: ns-resize;
}

label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--fs-body-3);
}

select {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--fs-body-3);
  cursor: pointer;
  background: var(--surface);
  color: var(--text);
  transition: border-color 120ms;
}

select:hover {
  border-color: var(--border-strong);
}

select:focus {
  outline: none;
  border-color: var(--accent-hover);
  box-shadow: 0 0 0 2px rgba(138, 107, 69, 0.2);
}
</style>
