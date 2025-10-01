<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import Konva from 'konva'
import { createPianoRollState, type PianoRollState, type NoteData, type NoteDataInput } from './pianoRollState'
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

// Create piano roll state
const MIN_HORIZONTAL_SPAN = 0.25  // quarter notes
const MIN_VERTICAL_SPAN = 1  // pitches
const TOTAL_PITCHES = 128
const MIN_FIT_HORIZONTAL_BEATS = 4
const MIN_FIT_VERTICAL_NOTES = 12
const DEFAULT_FIT_BOTTOM_NOTE = 55

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

let eventHandlersInitialized = false
let keyboardListenerAttached = false

const syncUiCounters = () => {
  noteCount.value = state.notes.size
  selectionCount.value = state.selection.selectedIds.size
}

const clamp = (value: number, min: number, max: number) => {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

const getStageWidth = () => state.stage?.width() ?? props.width
const getStageHeight = () => state.stage?.height() ?? props.height

const getHorizontalContentWidth = () => state.grid.maxLength * state.grid.quarterNoteWidth
const getVerticalContentHeight = () => TOTAL_PITCHES * state.grid.noteHeight

const setHorizontalZoom = (newQuarterNoteWidth: number) => {
  state.grid.quarterNoteWidth = newQuarterNoteWidth
  state.viewport.zoomX = newQuarterNoteWidth / state.grid.baseQuarterNoteWidth
}

const setVerticalZoom = (newNoteHeight: number) => {
  state.grid.noteHeight = newNoteHeight
  state.viewport.zoomY = newNoteHeight / state.grid.baseNoteHeight
}

const getHorizontalViewportRange = () => {
  const quarterNoteWidth = state.grid.quarterNoteWidth
  const stageWidth = getStageWidth()
  const startQuarter = quarterNoteWidth === 0 ? 0 : state.viewport.scrollX / quarterNoteWidth
  const endQuarter = startQuarter + (stageWidth / (quarterNoteWidth || 1))
  return { startQuarter, endQuarter }
}

const getVerticalViewportRange = () => {
  const noteHeight = state.grid.noteHeight
  const stageHeight = getStageHeight()
  const topIndex = noteHeight === 0 ? 0 : state.viewport.scrollY / noteHeight
  const bottomIndex = topIndex + (stageHeight / (noteHeight || 1))
  return { topIndex, bottomIndex }
}

const updateScrollBounds = () => {
  const stageWidth = getStageWidth()
  const stageHeight = getStageHeight()

  const maxScrollX = Math.max(0, getHorizontalContentWidth() - stageWidth)
  const clampedScrollX = clamp(state.viewport.scrollX, 0, maxScrollX)
  if (clampedScrollX !== state.viewport.scrollX) {
    state.viewport.scrollX = clampedScrollX
    state.needsRedraw = true
    notifyViewportChange()
  }

  const maxScrollY = Math.max(0, getVerticalContentHeight() - stageHeight)
  const clampedScrollY = clamp(state.viewport.scrollY, 0, maxScrollY)
  if (clampedScrollY !== state.viewport.scrollY) {
    state.viewport.scrollY = clampedScrollY
    state.needsRedraw = true
    notifyViewportChange()
  }
}

const applyHorizontalZoom = (newQuarterNoteWidth: number, newStartQuarter: number) => {
  if (!Number.isFinite(newQuarterNoteWidth) || newQuarterNoteWidth <= 0) return
  setHorizontalZoom(newQuarterNoteWidth)

  const stageWidth = getStageWidth()
  const visibleSpanQuarter = stageWidth / state.grid.quarterNoteWidth
  const maxStartQuarter = Math.max(0, state.grid.maxLength - visibleSpanQuarter)
  const clampedStartQuarter = clamp(newStartQuarter, 0, maxStartQuarter)
  state.viewport.scrollX = clampedStartQuarter * state.grid.quarterNoteWidth

  updateScrollBounds()
  state.needsRedraw = true
  notifyViewportChange()
}

const applyVerticalZoom = (newNoteHeight: number, newTopIndex: number) => {
  if (!Number.isFinite(newNoteHeight) || newNoteHeight <= 0) return
  setVerticalZoom(newNoteHeight)

  const stageHeight = getStageHeight()
  const visibleSpan = stageHeight / state.grid.noteHeight
  const maxTopIndex = Math.max(0, TOTAL_PITCHES - visibleSpan)
  const clampedTopIndex = clamp(newTopIndex, 0, maxTopIndex)
  state.viewport.scrollY = clampedTopIndex * state.grid.noteHeight

  updateScrollBounds()
  state.needsRedraw = true
  notifyViewportChange()
}

const fitZoomToNotes = () => {
  const stageWidth = getStageWidth()
  const stageHeight = getStageHeight()
  if (stageWidth <= 0 || stageHeight <= 0) return

  const notes = Array.from(state.notes.values())

  // Horizontal fit
  if (notes.length === 0) {
    const targetSpanQuarter = MIN_FIT_HORIZONTAL_BEATS
    const newQuarterNoteWidth = stageWidth / targetSpanQuarter
    applyHorizontalZoom(newQuarterNoteWidth, 0)

    const targetSpanNotes = MIN_FIT_VERTICAL_NOTES
    const newNoteHeight = stageHeight / targetSpanNotes
    const bottomIndex = 127 - DEFAULT_FIT_BOTTOM_NOTE
    const maxTopIndex = Math.max(0, TOTAL_PITCHES - targetSpanNotes)
    const topIndex = clamp(bottomIndex - (targetSpanNotes - 1), 0, maxTopIndex)
    applyVerticalZoom(newNoteHeight, topIndex)
    return
  }

  const minPos = notes.reduce((min, note) => Math.min(min, note.position), Number.POSITIVE_INFINITY)
  const maxPos = notes.reduce((max, note) => Math.max(max, note.position + note.duration), Number.NEGATIVE_INFINITY)
  const actualSpanQuarter = Math.max(maxPos - minPos, 0)
  const targetSpanQuarter = Math.max(actualSpanQuarter, MIN_FIT_HORIZONTAL_BEATS)
  const newQuarterNoteWidth = stageWidth / targetSpanQuarter

  const maxStartQuarter = Math.max(0, state.grid.maxLength - targetSpanQuarter)
  const spanPadding = Math.max(targetSpanQuarter - actualSpanQuarter, 0)
  const startQuarterRaw = minPos - spanPadding / 2
  const startQuarter = clamp(startQuarterRaw, 0, maxStartQuarter)
  applyHorizontalZoom(newQuarterNoteWidth, startQuarter)

  const highestPitch = notes.reduce((max, note) => Math.max(max, note.pitch), Number.NEGATIVE_INFINITY)
  const lowestPitch = notes.reduce((min, note) => Math.min(min, note.pitch), Number.POSITIVE_INFINITY)
  const topIndexForHighest = 127 - highestPitch
  const bottomIndexForLowest = 127 - lowestPitch
  const actualSpanNotes = Math.max(bottomIndexForLowest - topIndexForHighest + 1, 1)
  const targetSpanNotes = Math.max(actualSpanNotes, MIN_FIT_VERTICAL_NOTES)
  const newNoteHeight = stageHeight / targetSpanNotes

  const extraSpace = Math.max(targetSpanNotes - actualSpanNotes, 0)
  const topIndexRaw = topIndexForHighest - extraSpace / 2
  const maxTopIndex = Math.max(0, TOTAL_PITCHES - targetSpanNotes)
  const topIndex = clamp(topIndexRaw, 0, maxTopIndex)
  applyVerticalZoom(newNoteHeight, topIndex)
}

const notifyViewportChange = () => {
  props.syncState?.(state)
}

const horizontalThumbMetrics = computed(() => {
  const totalQuarter = state.grid.maxLength
  if (totalQuarter <= 0) return { start: 0, size: 1 }

  const quarterNoteWidth = state.grid.quarterNoteWidth
  const stageWidth = getStageWidth()
  if (quarterNoteWidth <= 0 || stageWidth <= 0) return { start: 0, size: 1 }

  const startQuarter = state.viewport.scrollX / quarterNoteWidth
  const visibleSpanQuarter = stageWidth / quarterNoteWidth

  const normalizedSize = Math.min(1, visibleSpanQuarter / totalQuarter)
  if (normalizedSize >= 1) {
    return { start: 0, size: 1 }
  }

  const normalizedStart = startQuarter / totalQuarter
  const clampedStart = clamp(normalizedStart, 0, 1 - normalizedSize)

  return { start: clampedStart, size: normalizedSize }
})

const verticalThumbMetrics = computed(() => {
  const total = TOTAL_PITCHES
  if (total <= 0) return { start: 0, size: 1 }

  const noteHeight = state.grid.noteHeight
  const stageHeight = getStageHeight()
  if (noteHeight <= 0 || stageHeight <= 0) return { start: 0, size: 1 }

  const topIndex = state.viewport.scrollY / noteHeight
  const visibleSpan = stageHeight / noteHeight

  const normalizedSize = Math.min(1, visibleSpan / total)
  if (normalizedSize >= 1) {
    return { start: 0, size: 1 }
  }

  const normalizedStart = topIndex / total
  const clampedStart = clamp(normalizedStart, 0, 1 - normalizedSize)

  return { start: clampedStart, size: normalizedSize }
})

const horizontalThumbStyle = computed(() => {
  const { start, size } = horizontalThumbMetrics.value
  const clampedSize = clamp(size, 0, 1)
  const width = Math.min(1, Math.max(clampedSize, 0.01))
  const left = clamp(start, 0, 1 - width)
  return {
    left: `${left * 100}%`,
    width: `${width * 100}%`
  }
})

const verticalThumbStyle = computed(() => {
  const { start, size } = verticalThumbMetrics.value
  const clampedSize = clamp(size, 0, 1)
  const height = Math.min(1, Math.max(clampedSize, 0.01))
  const top = clamp(start, 0, 1 - height)
  return {
    top: `${top * 100}%`,
    height: `${height * 100}%`
  }
})

type HorizontalDragMode = 'move' | 'resize-start' | 'resize-end'
type VerticalDragMode = 'move' | 'resize-start' | 'resize-end'

interface HorizontalDragState {
  mode: HorizontalDragMode
  pointerId: number
  pointerStart: number
  trackRect: DOMRect
  startQuarter: number
  endQuarter: number
  anchorQuarter: number
  spanQuarter: number
  stageWidth: number
  pointerOffset: number
}

interface VerticalDragState {
  mode: VerticalDragMode
  pointerId: number
  pointerStart: number
  trackRect: DOMRect
  topIndex: number
  bottomIndex: number
  anchorIndex: number
  span: number
  stageHeight: number
  pointerOffset: number
}

const horizontalDragState = ref<HorizontalDragState | null>(null)
const verticalDragState = ref<VerticalDragState | null>(null)

const stopHorizontalDrag = () => {
  if (!horizontalDragState.value) return
  window.removeEventListener('pointermove', handleHorizontalPointerMove)
  window.removeEventListener('pointerup', stopHorizontalDrag)
  horizontalDragState.value = null
}

const stopVerticalDrag = () => {
  if (!verticalDragState.value) return
  window.removeEventListener('pointermove', handleVerticalPointerMove)
  window.removeEventListener('pointerup', stopVerticalDrag)
  verticalDragState.value = null
}

const startHorizontalDrag = (mode: HorizontalDragMode, event: PointerEvent) => {
  if (!props.interactive) return
  if (!horizontalTrack.value) return

  stopHorizontalDrag()

  const trackRect = horizontalTrack.value.getBoundingClientRect()
  if (trackRect.width <= 0) return

  const { startQuarter, endQuarter } = getHorizontalViewportRange()
  const spanQuarter = Math.max(MIN_HORIZONTAL_SPAN, endQuarter - startQuarter)
  const stageWidth = getStageWidth()
  const totalQuarter = state.grid.maxLength
  if (stageWidth <= 0 || totalQuarter <= 0) return

  const startNormalized = startQuarter / totalQuarter
  const endNormalized = endQuarter / totalQuarter
  let pointerOffset = 0
  if (mode === 'resize-start') {
    pointerOffset = event.clientX - (trackRect.left + startNormalized * trackRect.width)
  } else if (mode === 'resize-end') {
    pointerOffset = event.clientX - (trackRect.left + endNormalized * trackRect.width)
  }

  horizontalDragState.value = {
    mode,
    pointerId: event.pointerId,
    pointerStart: event.clientX,
    trackRect,
    startQuarter,
    endQuarter,
    anchorQuarter: mode === 'resize-start' ? endQuarter : startQuarter,
    spanQuarter,
    stageWidth,
    pointerOffset
  }

  window.addEventListener('pointermove', handleHorizontalPointerMove)
  window.addEventListener('pointerup', stopHorizontalDrag)

  event.preventDefault()
}

const startVerticalDrag = (mode: VerticalDragMode, event: PointerEvent) => {
  if (!props.interactive) return
  if (!verticalTrack.value) return

  stopVerticalDrag()

  const trackRect = verticalTrack.value.getBoundingClientRect()
  if (trackRect.height <= 0) return

  const { topIndex, bottomIndex } = getVerticalViewportRange()
  const span = Math.max(MIN_VERTICAL_SPAN, bottomIndex - topIndex)
  const stageHeight = getStageHeight()
  if (stageHeight <= 0) return

  const topNormalized = topIndex / TOTAL_PITCHES
  const bottomNormalized = bottomIndex / TOTAL_PITCHES
  let pointerOffset = 0
  if (mode === 'resize-start') {
    pointerOffset = event.clientY - (trackRect.top + topNormalized * trackRect.height)
  } else if (mode === 'resize-end') {
    pointerOffset = event.clientY - (trackRect.top + bottomNormalized * trackRect.height)
  }

  verticalDragState.value = {
    mode,
    pointerId: event.pointerId,
    pointerStart: event.clientY,
    trackRect,
    topIndex,
    bottomIndex,
    anchorIndex: mode === 'resize-start' ? bottomIndex : topIndex,
    span,
    stageHeight,
    pointerOffset
  }

  window.addEventListener('pointermove', handleVerticalPointerMove)
  window.addEventListener('pointerup', stopVerticalDrag)

  event.preventDefault()
}

const handleHorizontalPointerMove = (event: PointerEvent) => {
  const drag = horizontalDragState.value
  if (!drag || event.pointerId !== drag.pointerId) return

  const totalQuarter = state.grid.maxLength
  const trackRect = drag.trackRect
  if (totalQuarter <= 0 || trackRect.width <= 0 || drag.stageWidth <= 0) return

  event.preventDefault()

  if (drag.mode === 'move') {
    const deltaPx = event.clientX - drag.pointerStart
    const deltaQuarter = (deltaPx / trackRect.width) * totalQuarter
    const maxStartQuarter = Math.max(0, totalQuarter - drag.spanQuarter)
    const newStartQuarter = clamp(drag.startQuarter + deltaQuarter, 0, maxStartQuarter)

    state.viewport.scrollX = newStartQuarter * state.grid.quarterNoteWidth
    updateScrollBounds()
    state.needsRedraw = true
    notifyViewportChange()
    return
  }

  const rawX = clamp(event.clientX, trackRect.left, trackRect.right)
  const adjustedX = clamp(rawX - drag.pointerOffset, trackRect.left, trackRect.right)
  const norm = (adjustedX - trackRect.left) / trackRect.width

  if (drag.mode === 'resize-start') {
    let newStartQuarter = norm * totalQuarter
    const maxStartQuarter = drag.anchorQuarter - MIN_HORIZONTAL_SPAN
    newStartQuarter = clamp(newStartQuarter, 0, Math.max(0, maxStartQuarter))

    const newSpanQuarter = Math.max(MIN_HORIZONTAL_SPAN, drag.anchorQuarter - newStartQuarter)
    const newQuarterNoteWidth = drag.stageWidth / newSpanQuarter
    applyHorizontalZoom(newQuarterNoteWidth, newStartQuarter)

    drag.startQuarter = newStartQuarter
    drag.spanQuarter = newSpanQuarter
    return
  }

  if (drag.mode === 'resize-end') {
    let newEndQuarter = norm * totalQuarter
    const minEndQuarter = drag.anchorQuarter + MIN_HORIZONTAL_SPAN
    newEndQuarter = clamp(newEndQuarter, Math.min(minEndQuarter, totalQuarter), totalQuarter)

    const newSpanQuarter = Math.max(MIN_HORIZONTAL_SPAN, newEndQuarter - drag.anchorQuarter)
    const newQuarterNoteWidth = drag.stageWidth / newSpanQuarter
    applyHorizontalZoom(newQuarterNoteWidth, drag.anchorQuarter)

    drag.endQuarter = newEndQuarter
    drag.spanQuarter = newSpanQuarter
  }
}

const handleVerticalPointerMove = (event: PointerEvent) => {
  const drag = verticalDragState.value
  if (!drag || event.pointerId !== drag.pointerId) return

  const trackRect = drag.trackRect
  if (trackRect.height <= 0 || drag.stageHeight <= 0) return

  event.preventDefault()

  if (drag.mode === 'move') {
    const deltaPx = event.clientY - drag.pointerStart
    const deltaIndex = (deltaPx / trackRect.height) * TOTAL_PITCHES
    const maxTopIndex = Math.max(0, TOTAL_PITCHES - drag.span)
    const newTopIndex = clamp(drag.topIndex + deltaIndex, 0, maxTopIndex)

    state.viewport.scrollY = newTopIndex * state.grid.noteHeight
    updateScrollBounds()
    state.needsRedraw = true
    notifyViewportChange()
    return
  }

  const rawY = clamp(event.clientY, trackRect.top, trackRect.bottom)
  const adjustedY = clamp(rawY - drag.pointerOffset, trackRect.top, trackRect.bottom)
  const norm = (adjustedY - trackRect.top) / trackRect.height

  if (drag.mode === 'resize-start') {
    let newTopIndex = norm * TOTAL_PITCHES
    const maxTopIndex = drag.anchorIndex - MIN_VERTICAL_SPAN
    newTopIndex = clamp(newTopIndex, 0, Math.max(0, maxTopIndex))

    const newSpan = Math.max(MIN_VERTICAL_SPAN, drag.anchorIndex - newTopIndex)
    const newNoteHeight = drag.stageHeight / newSpan
    applyVerticalZoom(newNoteHeight, newTopIndex)

    drag.topIndex = newTopIndex
    drag.span = newSpan
    return
  }

  if (drag.mode === 'resize-end') {
    let newBottomIndex = norm * TOTAL_PITCHES
    const minBottomIndex = drag.anchorIndex + MIN_VERTICAL_SPAN
    newBottomIndex = clamp(newBottomIndex, Math.min(minBottomIndex, TOTAL_PITCHES), TOTAL_PITCHES)

    const newSpan = Math.max(MIN_VERTICAL_SPAN, newBottomIndex - drag.anchorIndex)
    const newNoteHeight = drag.stageHeight / newSpan
    applyVerticalZoom(newNoteHeight, drag.anchorIndex)

    drag.bottomIndex = newBottomIndex
    drag.span = newSpan
  }
}

const onHorizontalTrackPointerDown = (event: PointerEvent) => {
  if (!props.interactive) return
  if (!horizontalTrack.value) return

  const trackRect = horizontalTrack.value.getBoundingClientRect()
  if (trackRect.width <= 0) return

  const norm = clamp((event.clientX - trackRect.left) / trackRect.width, 0, 1)
  const { startQuarter, endQuarter } = getHorizontalViewportRange()
  const spanQuarter = Math.max(MIN_HORIZONTAL_SPAN, endQuarter - startQuarter)
  const totalQuarter = state.grid.maxLength
  const maxStartQuarter = Math.max(0, totalQuarter - spanQuarter)
  const targetStartQuarter = clamp(norm * totalQuarter - spanQuarter / 2, 0, maxStartQuarter)

  state.viewport.scrollX = targetStartQuarter * state.grid.quarterNoteWidth
  updateScrollBounds()
  state.needsRedraw = true
  notifyViewportChange()
}

const onVerticalTrackPointerDown = (event: PointerEvent) => {
  if (!props.interactive) return
  if (!verticalTrack.value) return

  const trackRect = verticalTrack.value.getBoundingClientRect()
  if (trackRect.height <= 0) return

  const norm = clamp((event.clientY - trackRect.top) / trackRect.height, 0, 1)
  const { topIndex, bottomIndex } = getVerticalViewportRange()
  const span = Math.max(MIN_VERTICAL_SPAN, bottomIndex - topIndex)
  const maxTopIndex = Math.max(0, TOTAL_PITCHES - span)
  const targetTopIndex = clamp(norm * TOTAL_PITCHES - span / 2, 0, maxTopIndex)

  state.viewport.scrollY = targetTopIndex * state.grid.noteHeight
  updateScrollBounds()
  state.needsRedraw = true
  notifyViewportChange()
}

// Watch grid subdivision changes
watch(gridSubdivision, (newValue) => {
  state.grid.subdivision = newValue
  state.needsRedraw = true
  props.syncState?.(state)
})

// Undo/redo functions
const undo = () => {
  state.command.stack?.undo()
  updateCommandStackButtons()
}

const redo = () => {
  state.command.stack?.redo()
  updateCommandStackButtons()
}

const updateCommandStackButtons = () => {
  canUndo.value = state.command.stack?.canUndo() ?? false
  canRedo.value = state.command.stack?.canRedo() ?? false
}

const handleCommandStackUpdate = () => {
  updateCommandStackButtons()
  emitStateUpdate()
}

// Delete selected notes
const deleteSelected = () => {
  if (state.selection.selectedIds.size === 0) return

  state.command.stack?.executeCommand('Delete Selected', () => {
    state.selection.selectedIds.forEach(id => state.notes.delete(id))
    state.selection.selectedIds.clear()
    state.needsRedraw = true
  })

  updateCommandStackButtons()
}

// RAF loop for rendering
const renderLoop = () => {
  if (state.needsRedraw) {
    renderGrid(state)
    renderVisibleNotes(state)
    renderResizeHandles(state)
    updateQueuePlayheadPosition(state)
    updateLivePlayheadPosition(state)
    state.needsRedraw = false
  }
  state.rafHandle = requestAnimationFrame(renderLoop)
}

// Emit state updates
const emitStateUpdate = () => {
  syncUiCounters()
  emit('notes-update', Array.from(state.notes.entries()))
  props.syncState?.(state)
}

state.notifyExternalChange = () => {
  emitStateUpdate()
}

// Keyboard handlers
const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.interactive) return

  // Undo (Cmd/Ctrl+Z)
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  }

  // Redo (Cmd/Ctrl+Shift+Z)
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault()
    redo()
  }

  // Delete (Backspace/Delete)
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault()
    deleteSelected()
  }

  // Arrow keys to move selection
  if (e.key.startsWith('Arrow') && state.selection.selectedIds.size > 0) {
    e.preventDefault()

    state.command.stack?.executeCommand('Move Selection', () => {
      state.selection.selectedIds.forEach(id => {
        const note = state.notes.get(id)
        if (!note) return

        switch (e.key) {
          case 'ArrowUp':
            note.pitch = Math.min(127, note.pitch + 1)
            break
          case 'ArrowDown':
            note.pitch = Math.max(0, note.pitch - 1)
            break
          case 'ArrowLeft':
            note.position = Math.max(0, note.position - 0.25)
            break
          case 'ArrowRight':
            note.position += 0.25
            break
        }
      })

      executeOverlapChanges(state, state.selection.selectedIds)
      state.needsRedraw = true
    })

    updateCommandStackButtons()
  }

  // Copy (Cmd/Ctrl+C)
  if ((e.metaKey || e.ctrlKey) && e.key === 'c' && state.selection.selectedIds.size > 0) {
    e.preventDefault()
    // Store copied notes in a simple array
    const copiedNotes = Array.from(state.selection.selectedIds).map(id => {
      const note = state.notes.get(id)
      return note ? { ...note } : null
    }).filter(n => n !== null) as NoteData[]

    // Find minimum position for relative copying
    const minPos = Math.min(...copiedNotes.map(n => n.position))

    // Store in session storage for simplicity
    sessionStorage.setItem('copiedPianoRollNotes', JSON.stringify({
      notes: copiedNotes.map(n => ({ ...n, position: n.position - minPos }))
    }))
  }

  // Paste (Cmd/Ctrl+V)
  if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
    e.preventDefault()
    const stored = sessionStorage.getItem('copiedPianoRollNotes')
    if (!stored) return

    try {
      const { notes } = JSON.parse(stored)

      state.command.stack?.executeCommand('Paste Notes', () => {
        state.selection.selectedIds.clear()

        notes.forEach((note: NoteData) => {
          const newNote: NoteData = {
            ...note,
            id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            position: state.queuePlayhead.position + note.position
          }
          state.notes.set(newNote.id, newNote)
          state.selection.selectedIds.add(newNote.id)
        })

        executeOverlapChanges(state, state.selection.selectedIds)
        state.needsRedraw = true
      })

      updateCommandStackButtons()
    } catch (e) {
      console.error('Failed to paste notes', e)
    }
  }
}

const enableInteractivity = () => {
  if (!state.stage) return

  if (!eventHandlersInitialized) {
    setupEventHandlers(state, state.stage)
    eventHandlersInitialized = true
  }

  state.stage.listening(true)

  if (!keyboardListenerAttached) {
    window.addEventListener('keydown', handleKeyDown)
    keyboardListenerAttached = true
  }
}

const disableInteractivity = () => {
  if (!state.stage) return

  state.stage.listening(false)
  state.interaction.isDragging = false
  state.interaction.isResizing = false
  state.interaction.isMarqueeSelecting = false
  state.selection.selectionRect?.visible(false)

  if (keyboardListenerAttached) {
    window.removeEventListener('keydown', handleKeyDown)
    keyboardListenerAttached = false
  }

  state.layers.overlay?.batchDraw()
  syncUiCounters()
}

onMounted(() => {
  if (!konvaContainer.value) {
    console.error('Konva container ref not found')
    return
  }

  // Initialize Konva stage
  const stageInstance = new Konva.Stage({
    container: konvaContainer.value,
    width: props.width,
    height: props.height
  })
  state.stage = stageInstance
  state.konvaContainer = konvaContainer.value

  // Initialize layers with callback to update buttons
  initializeLayers(state, stageInstance, handleCommandStackUpdate)

  // Configure interactivity after layers are ready
  if (props.interactive) {
    enableInteractivity()
  } else {
    disableInteractivity()
  }

  // Load initial notes
  if (props.initialNotes && props.initialNotes.length > 0) {
    state.notes = new Map(props.initialNotes)
    state.needsRedraw = true
    syncUiCounters()
  }

  // Start render loop
  state.rafHandle = requestAnimationFrame(renderLoop)

  // Initial render
  state.needsRedraw = true

  updateScrollBounds()

  // Update command stack buttons and emit initial state sync
  handleCommandStackUpdate()
})

onUnmounted(() => {
  stopHorizontalDrag()
  stopVerticalDrag()

  // Stop RAF loop
  if (state.rafHandle) {
    cancelAnimationFrame(state.rafHandle)
  }

  // Disable interactivity
  disableInteractivity()

  // Destroy stage
  state.stage?.destroy()
})

// Watch for prop changes
watch(() => props.interactive, (interactive) => {
  if (!state.stage) return
  if (interactive) {
    enableInteractivity()
  } else {
    disableInteractivity()
    stopHorizontalDrag()
    stopVerticalDrag()
  }
})

watch(() => props.width, (newWidth) => {
  if (state.stage) {
    state.stage.width(newWidth)
    state.needsRedraw = true
    updateScrollBounds()
  }
})

watch(() => props.height, (newHeight) => {
  if (state.stage) {
    state.stage.height(newHeight)
    state.needsRedraw = true
    updateScrollBounds()
  }
})

// Expose methods for web component API
const setNotes = (notes: NoteDataInput[]) => {
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
</style>
