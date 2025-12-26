<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { createPianoRollState, type PianoRollState, type NoteData, type NoteDataInput } from './pianoRollState'
import { PianoRollWebSocketController, type UpdateSource } from './pianoRollWebSocket'
import {
  initializeLayers,
  setupEventHandlers,
  renderGrid,
  renderVisibleNotes,
  renderResizeHandles,
  updateQueuePlayheadPosition,
  updateLivePlayheadPosition,
  captureState,
  restoreState
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
import NoteMetadataEditor from './NoteMetadataEditor.vue'

const props = withDefaults(defineProps<{
  width?: number
  height?: number
  initialNotes?: Array<[string, NoteData]>
  syncState?: (state: PianoRollState) => void
  showControlPanel?: boolean
  interactive?: boolean
  wsAddress?: string
}>(), {
  width: 640,
  height: 360,
  initialNotes: () => [],
  showControlPanel: true,
  interactive: true
})

// WebSocket-overridable config
const wsConfig = reactive({
  width: undefined as number | undefined,
  height: undefined as number | undefined,
  interactive: undefined as boolean | undefined,
  showControlPanel: undefined as boolean | undefined
})

// Effective values (WebSocket overrides props)
const effectiveWidth = computed(() => wsConfig.width ?? props.width)
const effectiveHeight = computed(() => wsConfig.height ?? props.height)
const effectiveInteractive = computed(() => wsConfig.interactive ?? props.interactive)
const effectiveShowControlPanel = computed(() => wsConfig.showControlPanel ?? props.showControlPanel)

// WebSocket controller - use shallowRef to avoid Vue proxying the WebSocket internals
const wsController = shallowRef<PianoRollWebSocketController | null>(null)

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
const showMetadataEditor = ref(false)
const selectedNoteId = ref<string | null>(null)
const selectedNoteMetadata = ref<Record<string, any> | null>(null)

// Computed properties
const noteCount = ref(state.notes.size)
const selectionCount = ref(state.selection.selectedIds.size)
const isInteractive = computed(() => effectiveInteractive.value)
const isControlPanelVisible = computed(() => effectiveShowControlPanel.value)
const canEditMetadata = computed(() => selectedNoteId.value !== null && isInteractive.value)
const metadataEditorVisible = computed(() => isControlPanelVisible.value && showMetadataEditor.value)

const normalizeMetadata = (metadata: any) => {
  if (metadata === null || metadata === undefined) {
    return {}
  }
  try {
    return JSON.parse(JSON.stringify(metadata))
  } catch {
    return metadata
  }
}

const syncUiCounters = () => {
  noteCount.value = state.notes.size
  selectionCount.value = state.selection.selectedIds.size
  if (state.selection.selectedIds.size === 1) {
    const [id] = Array.from(state.selection.selectedIds)
    const note = state.notes.get(id)
    selectedNoteId.value = note?.id ?? null
    selectedNoteMetadata.value = note ? normalizeMetadata(note.metadata) : {}
  } else {
    selectedNoteId.value = null
    selectedNoteMetadata.value = null
  }
}

const notifyViewportChange = () => {
  props.syncState?.(state)
}

const fitZoomToNotes = () => {
  fitZoomToNotesHelper(state, effectiveWidth.value, effectiveHeight.value, notifyViewportChange)
}

const enforceScrollBounds = () => {
  updateScrollBounds(state, effectiveWidth.value, effectiveHeight.value, notifyViewportChange)
}

const applyHorizontalZoomWithState = (newQuarterNoteWidth: number, newStartQuarter: number) => {
  applyHorizontalZoom(state, newQuarterNoteWidth, newStartQuarter, effectiveWidth.value, effectiveHeight.value, notifyViewportChange)
}

const applyVerticalZoomWithState = (newNoteHeight: number, newTopIndex: number) => {
  applyVerticalZoom(state, newNoteHeight, newTopIndex, effectiveWidth.value, effectiveHeight.value, notifyViewportChange)
}

const getHorizontalViewportRangeWithState = () => getHorizontalViewportRange(state, effectiveWidth.value)
const getVerticalViewportRangeWithState = () => getVerticalViewportRange(state, effectiveHeight.value)

const horizontalScrollbar = new HorizontalScrollbarController({
  state,
  horizontalTrack,
  isInteractive: () => effectiveInteractive.value,
  getViewportRange: getHorizontalViewportRangeWithState,
  applyHorizontalZoom: applyHorizontalZoomWithState,
  enforceScrollBounds,
  notifyViewportChange,
  getFallbackWidth: () => effectiveWidth.value
})

const verticalScrollbar = new VerticalScrollbarController({
  state,
  verticalTrack,
  isInteractive: () => effectiveInteractive.value,
  getViewportRange: getVerticalViewportRangeWithState,
  applyVerticalZoom: applyVerticalZoomWithState,
  enforceScrollBounds,
  notifyViewportChange,
  getFallbackHeight: () => effectiveHeight.value
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

type EmitStateOptions = {
  source?: UpdateSource
  suppressWsNotes?: boolean
}

const emitStateUpdate = (options: EmitStateOptions = {}) => {
  const source = options.source ?? 'notes'
  syncUiCounters()
  const notesArray = Array.from(state.notes.entries())
  emit('notes-update', notesArray)
  props.syncState?.(state)

  // Send via WebSocket if connected
  if (wsController.value?.isConnected) {
    if (!options.suppressWsNotes && source === 'notes') {
      wsController.value.sendNotesUpdate(notesArray, source)
    }
    wsController.value.sendStateUpdate(state, source)
  }
}

watch(isControlPanelVisible, (visible) => {
  if (!visible) {
    showMetadataEditor.value = false
  }
})

const handleApplyNoteMetadata = (metadata: any) => {
  if (!selectedNoteId.value) {
    return
  }

  const noteId = selectedNoteId.value
  const note = state.notes.get(noteId)
  if (!note) {
    return
  }

  const normalizedIncoming = metadata ?? {}
  const normalizedExisting = note.metadata ?? {}

  if (JSON.stringify(normalizedExisting) === JSON.stringify(normalizedIncoming)) {
    return
  }

  state.command.stack?.executeCommand('Edit Note Metadata', () => {
    const target = state.notes.get(noteId)
    if (!target) {
      return
    }
    const nextMetadata = normalizedIncoming && Object.keys(normalizedIncoming).length === 0
      ? undefined
      : normalizedIncoming
    const updatedNote: NoteData = {
      ...target,
      metadata: nextMetadata
    }
    if (!nextMetadata) {
      delete (updatedNote as any).metadata
    }
    state.notes.set(noteId, updatedNote)
    state.needsRedraw = true
  })
}

state.notifyExternalChange = (source) => {
  emitStateUpdate({ source: source ?? 'other' })
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
  isInteractive: () => effectiveInteractive.value,
  undo,
  redo,
  deleteSelected,
  updateCommandStackButtons,
  executeOverlapChanges
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
    width: effectiveWidth.value,
    height: effectiveHeight.value,
    interactive: effectiveInteractive.value,
    initialNotes: props.initialNotes ?? []
  })

  // Initialize WebSocket if address provided
  if (props.wsAddress) {
    wsController.value = new PianoRollWebSocketController(props.wsAddress)
    wsController.value.setHandlers({
      onSetNotes: (notes) => setNotes(notes, { suppressWsNotes: true }),
      onSetLivePlayhead: (position) => setLivePlayheadPosition(position),
      onFitZoomToNotes: () => fitZoomToNotes(),
      onGetPlayStartPosition: (requestId) => {
        const position = getPlayStartPosition()
        wsController.value?.sendPlayStartPositionResponse(position, requestId)
      },
      onSetConfig: (config) => {
        if (config.width !== undefined) wsConfig.width = config.width
        if (config.height !== undefined) wsConfig.height = config.height
        if (config.interactive !== undefined) wsConfig.interactive = config.interactive
        if (config.showControlPanel !== undefined) wsConfig.showControlPanel = config.showControlPanel
      }
    })
    wsController.value.connect()
  }
})

onUnmounted(() => {
  stopHorizontalDrag()
  stopVerticalDrag()
  stageManager.unmount()
  wsController.value?.disconnect()
})

watch(effectiveInteractive, (interactive) => {
  stageManager.setInteractive(interactive)
  if (!interactive) {
    stopHorizontalDrag()
    stopVerticalDrag()
  }
})

watch(effectiveWidth, (newWidth) => {
  stageManager.resize(newWidth, effectiveHeight.value)
})

watch(effectiveHeight, (newHeight) => {
  stageManager.resize(effectiveWidth.value, newHeight)
})

// Expose methods for web component API
const setNotes = (notes: NoteDataInput[], options: EmitStateOptions = {}) => {
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
  emitStateUpdate({ ...options, source: 'notes' })
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
    <div v-if="isControlPanelVisible" class="control-panel">
      <button @click="undo" :disabled="!isInteractive || !canUndo">↶ Undo</button>
      <button @click="redo" :disabled="!isInteractive || !canRedo">↷ Redo</button>
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
      <button @click="deleteSelected" :disabled="!isInteractive || selectionCount === 0">
        🗑️ Delete
      </button>
      <span class="separator">|</span>
      <button
        class="metadata-toggle"
        :class="{ active: showMetadataEditor }"
        @click="showMetadataEditor = !showMetadataEditor"
      >
        📝 Metadata
      </button>
      <span class="separator">|</span>
      <span class="info">{{ noteCount }} notes, {{ selectionCount }} selected</span>
    </div>
    <div class="piano-roll-layout">
      <div class="stage-wrapper">
        <div
          ref="konvaContainer"
          :class="['piano-roll-container', { 'is-disabled': !isInteractive }]"
          :style="{ width: effectiveWidth + 'px', height: effectiveHeight + 'px' }"
        ></div>
        <div
          ref="horizontalTrack"
          class="scrollbar horizontal"
          :class="{ 'is-disabled': !isInteractive }"
          :style="{ width: effectiveWidth + 'px' }"
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
        :style="{ height: effectiveHeight + 'px' }"
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
    <div v-if="isControlPanelVisible" class="metadata-editor-wrapper">
      <NoteMetadataEditor
        :visible="metadataEditorVisible"
        :metadata="selectedNoteMetadata ?? undefined"
        :can-edit="canEditMetadata"
        @apply="handleApplyNoteMetadata"
      />
    </div>
  </div>
</template>

<style scoped>
.piano-roll-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 20px;
}

.control-panel {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px 15px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.control-panel button {
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 5px 15px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.control-panel button:hover:not(:disabled) {
  background: #e0e0e0;
}

.control-panel button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.separator {
  color: #ccc;
}

.metadata-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.metadata-toggle.active {
  background: #d6eaff;
  border-color: #6aa8ff;
  color: #0b5394;
}

.info {
  color: #666;
  font-size: 14px;
}

.piano-roll-container {
  background-color: white;
  border: 1px solid black;
  cursor: default;
  box-sizing: border-box;
  border-radius: 8px;
}

.piano-roll-container.is-disabled {
  pointer-events: none;
  cursor: not-allowed;
}

.piano-roll-layout {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.stage-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}

.scrollbar {
  position: relative;
  background: #f5f5f5;
  border: 1px solid #ccc;
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
  opacity: 0.45;
  pointer-events: none;
}

.scrollbar-thumb {
  position: absolute;
  background: rgba(0, 0, 0, 0.18);
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
  background: rgba(0, 0, 0, 0.25);
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
  background: rgba(0, 0, 0, 0.35);
  border-radius: 4px;
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
  gap: 5px;
  font-size: 14px;
}

select {
  padding: 3px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.metadata-editor-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}
</style>
