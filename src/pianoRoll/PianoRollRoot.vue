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
const maxWidth = computed(() => effectiveWidth.value)
const maxHeight = computed(() => effectiveHeight.value)

const MIN_SCALE = 1 / 3
const layoutGap = 1
const scrollbarThickness = 12
const sizeObserver = ref<HTMLDivElement>()
const availableWidth = ref<number | null>(null)
let resizeObserver: ResizeObserver | null = null
const stageInset = computed(() => scrollbarThickness + layoutGap)

const availableStageWidth = computed(() => {
  if (!Number.isFinite(availableWidth.value ?? NaN)) return null
  return Math.max(0, (availableWidth.value as number) - stageInset.value)
})

const scale = computed(() => {
  const baseWidth = maxWidth.value
  if (!Number.isFinite(baseWidth) || baseWidth <= 0) return 1
  const measuredWidth = availableStageWidth.value ?? baseWidth
  const rawScale = measuredWidth / baseWidth
  if (!Number.isFinite(rawScale)) return 1
  return Math.min(1, Math.max(MIN_SCALE, rawScale))
})

const scaledWidth = computed(() => Math.round(maxWidth.value * scale.value))
const scaledHeight = computed(() => Math.round(maxHeight.value * scale.value))
const minWidth = computed(() => Math.round(maxWidth.value * MIN_SCALE))
const shellMaxWidth = computed(() => Math.round(maxWidth.value + stageInset.value))
const shellMinWidth = computed(() => Math.round(minWidth.value + stageInset.value))

// WebSocket controller - use shallowRef to avoid Vue proxying the WebSocket internals
const wsController = shallowRef<PianoRollWebSocketController | null>(null)

const emit = defineEmits<{
  (event: 'notes-update', notes: Array<[string, NoteData]>): void
}>()

const state: PianoRollState = createPianoRollState()

state.viewport = reactive(state.viewport) as PianoRollState['viewport']
state.grid = reactive(state.grid) as PianoRollState['grid']
state.mpe = reactive(state.mpe) as PianoRollState['mpe']

// Refs
const konvaContainer = ref<HTMLDivElement>()
const horizontalTrack = ref<HTMLDivElement>()
const verticalTrack = ref<HTMLDivElement>()
const canUndo = ref(false)
const canRedo = ref(false)
const gridSubdivision = ref(state.grid.subdivision)
const showMetadataEditor = ref(false)
const showMpePointMetadataEditor = ref(false)
const selectedNoteId = ref<string | null>(null)
const selectedNoteMetadata = ref<Record<string, any> | null>(null)
const selectedMpePointIndex = ref<number | null>(null)
const selectedMpePointIndices = ref<number[]>([])
const selectedMpePointMetadata = ref<Record<string, any> | null>(null)
const selectedMpePointRooted = ref<boolean | null>(null)
const mpeMode = ref(false)

// Computed properties
const noteCount = ref(state.notes.size)
const selectionCount = ref(state.selection.selectedIds.size)
const isInteractive = computed(() => effectiveInteractive.value)
const isControlPanelVisible = computed(() => effectiveShowControlPanel.value)
const canEditMetadata = computed(() => selectedNoteId.value !== null && isInteractive.value)
const metadataEditorVisible = computed(() => isControlPanelVisible.value && showMetadataEditor.value)
const canEditMpePointMetadata = computed(() => selectedMpePointIndex.value !== null && isInteractive.value && state.mpe.enabled)
const canEditMpePointRooted = computed(() => selectedMpePointIndices.value.length > 0 && isInteractive.value && state.mpe.enabled)
const mpePointEditorVisible = computed(() => isControlPanelVisible.value && showMpePointMetadataEditor.value)

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

  if (state.mpe.enabled && state.selection.selectedIds.size === 1 && state.mpe.selectedHandles.size > 0) {
    const [id] = Array.from(state.selection.selectedIds)
    const note = state.notes.get(id)
    const handleIndices = Array.from(state.mpe.selectedHandles).sort((a, b) => a - b)
    selectedMpePointIndices.value = handleIndices

    if (handleIndices.length === 1) {
      const handleIndex = handleIndices[0]
      const point = note?.mpePitch?.points?.[handleIndex ?? -1]
      if (point) {
        selectedMpePointIndex.value = handleIndex ?? null
        selectedMpePointMetadata.value = normalizeMetadata(point.metadata)
      } else {
        selectedMpePointIndex.value = null
        selectedMpePointMetadata.value = null
      }
    } else {
      selectedMpePointIndex.value = null
      selectedMpePointMetadata.value = null
    }

    if (note?.mpePitch?.points) {
      const rootedValues = handleIndices.map(idx => !!note.mpePitch!.points[idx]?.rooted)
      if (rootedValues.length > 0) {
        const allSame = rootedValues.every(val => val === rootedValues[0])
        selectedMpePointRooted.value = allSame ? rootedValues[0] : null
      } else {
        selectedMpePointRooted.value = null
      }
    } else {
      selectedMpePointRooted.value = null
    }
  } else {
    selectedMpePointIndex.value = null
    selectedMpePointIndices.value = []
    selectedMpePointMetadata.value = null
    selectedMpePointRooted.value = null
  }
}

const notifyViewportChange = () => {
  props.syncState?.(state)
}

const focusPianoRoll = () => {
  konvaContainer.value?.focus()
}

const fitZoomToNotes = () => {
  fitZoomToNotesHelper(state, scaledWidth.value, scaledHeight.value, notifyViewportChange)
}

const enforceScrollBounds = () => {
  updateScrollBounds(state, scaledWidth.value, scaledHeight.value, notifyViewportChange)
}

const applyHorizontalZoomWithState = (newQuarterNoteWidth: number, newStartQuarter: number) => {
  applyHorizontalZoom(state, newQuarterNoteWidth, newStartQuarter, scaledWidth.value, scaledHeight.value, notifyViewportChange)
}

const applyVerticalZoomWithState = (newNoteHeight: number, newTopIndex: number) => {
  applyVerticalZoom(state, newNoteHeight, newTopIndex, scaledWidth.value, scaledHeight.value, notifyViewportChange)
}

const getHorizontalViewportRangeWithState = () => getHorizontalViewportRange(state, scaledWidth.value)
const getVerticalViewportRangeWithState = () => getVerticalViewportRange(state, scaledHeight.value)

const horizontalScrollbar = new HorizontalScrollbarController({
  state,
  horizontalTrack,
  isInteractive: () => effectiveInteractive.value,
  getViewportRange: getHorizontalViewportRangeWithState,
  applyHorizontalZoom: applyHorizontalZoomWithState,
  enforceScrollBounds,
  notifyViewportChange,
  getFallbackWidth: () => scaledWidth.value
})

const verticalScrollbar = new VerticalScrollbarController({
  state,
  verticalTrack,
  isInteractive: () => effectiveInteractive.value,
  getViewportRange: getVerticalViewportRangeWithState,
  applyVerticalZoom: applyVerticalZoomWithState,
  enforceScrollBounds,
  notifyViewportChange,
  getFallbackHeight: () => scaledHeight.value
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

watch(mpeMode, (enabled) => {
  state.mpe.enabled = enabled
  if (enabled) {
    state.selection.selectedIds.clear()
    state.mpe.selectedHandles = new Set()
  }
  if (!enabled) {
    state.mpe.selectedHandles = new Set()
    showMpePointMetadataEditor.value = false
  }
  state.needsRedraw = true
  props.syncState?.(state)
  syncUiCounters()
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
    showMpePointMetadataEditor.value = false
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

const handleApplyMpePointMetadata = (metadata: any) => {
  if (!selectedNoteId.value || selectedMpePointIndex.value === null) {
    return
  }

  const noteId = selectedNoteId.value
  const pointIndex = selectedMpePointIndex.value
  const note = state.notes.get(noteId)
  const point = note?.mpePitch?.points?.[pointIndex]
  if (!note || !point) {
    return
  }

  const normalizedIncoming = metadata ?? {}
  const normalizedExisting = point.metadata ?? {}

  if (JSON.stringify(normalizedExisting) === JSON.stringify(normalizedIncoming)) {
    return
  }

  state.command.stack?.executeCommand('Edit MPE Point Metadata', () => {
    const target = state.notes.get(noteId)
    if (!target?.mpePitch) {
      return
    }
    const nextMetadata = normalizedIncoming && Object.keys(normalizedIncoming).length === 0
      ? undefined
      : normalizedIncoming
    const updatedPoints = target.mpePitch.points.map((entry, idx) => {
      if (idx !== pointIndex) return entry
      const updated: Record<string, any> = { ...entry }
      if (nextMetadata) {
        updated.metadata = nextMetadata
      } else {
        delete updated.metadata
      }
      return updated as typeof entry
    })
    target.mpePitch = { points: updatedPoints }
    state.needsRedraw = true
  })
}

const handleSetMpePointRooted = (value: boolean) => {
  if (!selectedNoteId.value || selectedMpePointIndices.value.length === 0) {
    return
  }

  const noteId = selectedNoteId.value
  const indices = selectedMpePointIndices.value

  state.command.stack?.executeCommand('Set MPE Point Rooted', () => {
    const target = state.notes.get(noteId)
    if (!target?.mpePitch) {
      return
    }
    const updatedPoints = target.mpePitch.points.map((entry, idx) => {
      if (!indices.includes(idx)) return entry
      return {
        ...entry,
        rooted: value
      }
    })
    target.mpePitch = { points: updatedPoints }
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
  executeOverlapChanges,
  getContainer: () => konvaContainer.value ?? null
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
  if (sizeObserver.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const boxSize = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize
      const width = boxSize?.inlineSize ?? entry.contentRect.width
      if (Number.isFinite(width)) {
        availableWidth.value = width
      }
    })
    resizeObserver.observe(sizeObserver.value)
  }

  stageManager.mount({
    width: scaledWidth.value,
    height: scaledHeight.value,
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
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(effectiveInteractive, (interactive) => {
  stageManager.setInteractive(interactive)
  if (!interactive) {
    stopHorizontalDrag()
    stopVerticalDrag()
  }
})

watch([scaledWidth, scaledHeight], ([newWidth, newHeight]) => {
  stageManager.resize(newWidth, newHeight)
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
    <div
      ref="sizeObserver"
      class="piano-roll-shell"
      :style="{
        maxWidth: shellMaxWidth + 'px',
        minWidth: shellMinWidth + 'px',
        '--scrollbar-thickness': scrollbarThickness + 'px',
        '--scrollbar-gap': layoutGap + 'px'
      }"
    >
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
          class="mpe-toggle"
          :class="{ active: mpeMode }"
          :disabled="!isInteractive"
          @click="mpeMode = !mpeMode"
        >
          MPE
        </button>
        <span class="separator">|</span>
        <button
          class="metadata-toggle"
          :class="{ active: showMetadataEditor }"
          @click="showMetadataEditor = !showMetadataEditor"
        >
          📝 Metadata
        </button>
        <span v-if="mpeMode" class="separator">|</span>
        <button
          v-if="mpeMode"
          class="mpe-point-toggle"
          :class="{ active: showMpePointMetadataEditor }"
          @click="showMpePointMetadataEditor = !showMpePointMetadataEditor"
        >
          🎯 Point Metadata
        </button>
        <span class="separator">|</span>
        <span class="info">{{ noteCount }} notes, {{ selectionCount }} selected</span>
      </div>
      <div class="piano-roll-layout">
        <div class="stage-wrapper">
        <div
          ref="konvaContainer"
          :class="['piano-roll-container', { 'is-disabled': !isInteractive }]"
          :style="{ width: scaledWidth + 'px', height: scaledHeight + 'px' }"
          tabindex="0"
          @pointerdown="focusPianoRoll"
        ></div>
          <div
            ref="horizontalTrack"
            class="scrollbar horizontal"
            :class="{ 'is-disabled': !isInteractive }"
            :style="{ width: scaledWidth + 'px' }"
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
          :style="{ height: scaledHeight + 'px' }"
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
        <NoteMetadataEditor
          :visible="mpePointEditorVisible"
          :metadata="selectedMpePointMetadata ?? undefined"
          :can-edit="canEditMpePointMetadata"
          :show-rooted="true"
          :rooted-value="selectedMpePointRooted"
          :can-edit-rooted="canEditMpePointRooted"
          help-text="Edit the selected MPE point metadata as JSON:"
          empty-text="Select exactly one MPE point to edit its metadata."
          @apply="handleApplyMpePointMetadata"
          @set-rooted="handleSetMpePointRooted"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.piano-roll-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 11px;
}

.piano-roll-shell {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 0 auto;
}

.control-panel {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 8px;
  row-gap: 6px;
  align-self: stretch;
  box-sizing: border-box;
  justify-content: center;
}

.control-panel button {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 3px;
  background: #fff;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}

.control-panel button:hover:not(:disabled) {
  background: #f5f5f5;
  border-color: #999;
}

.control-panel button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.separator {
  color: #ddd;
  font-size: 10px;
}

.metadata-toggle,
.mpe-point-toggle,
.mpe-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
}

.metadata-toggle.active,
.mpe-point-toggle.active,
.mpe-toggle.active {
  background: #333;
  border-color: #333;
  color: #fff;
}

.info {
  color: #888;
  font-size: 10px;
}

.piano-roll-container {
  background-color: white;
  border: 1px solid #ccc;
  cursor: default;
  box-sizing: border-box;
  border-radius: 4px;
}

.piano-roll-container.is-disabled {
  pointer-events: none;
  cursor: not-allowed;
}

.piano-roll-layout {
  display: flex;
  align-items: flex-start;
  gap: var(--scrollbar-gap);
}

.stage-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--scrollbar-gap);
  align-items: stretch;
}

.scrollbar {
  position: relative;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-sizing: border-box;
  user-select: none;
  touch-action: none;
}

.scrollbar.horizontal {
  height: var(--scrollbar-thickness);
}

.scrollbar.vertical {
  width: var(--scrollbar-thickness);
}

.scrollbar.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.scrollbar-thumb {
  position: absolute;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: calc(var(--scrollbar-thickness) * 0.66);
  min-height: calc(var(--scrollbar-thickness) * 0.66);
  cursor: grab;
  transition: background 0.1s;
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
  background: rgba(0, 0, 0, 0.22);
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
  background: rgba(0, 0, 0, 0.25);
  border-radius: 3px;
  flex: 0 0 auto;
}

.handle-left,
.handle-right {
  width: calc(var(--scrollbar-thickness) / 3);
  height: 100%;
  cursor: ew-resize;
}

.handle-top,
.handle-bottom {
  width: 100%;
  height: calc(var(--scrollbar-thickness) / 3);
  cursor: ns-resize;
}

label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #555;
}

select {
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 11px;
  background: #fff;
  cursor: pointer;
}

select:focus {
  outline: none;
  border-color: #888;
}

.metadata-editor-wrapper {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
</style>
