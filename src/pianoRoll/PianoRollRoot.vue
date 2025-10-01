<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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
const state: PianoRollState = createPianoRollState()

// Refs
const konvaContainer = ref<HTMLDivElement>()
const canUndo = ref(false)
const canRedo = ref(false)
const gridSubdivision = ref(state.grid.subdivision)

// Computed properties
const noteCount = computed(() => state.notes.size)
const selectionCount = computed(() => state.selection.selectedIds.size)
const isInteractive = computed(() => props.interactive)
const showControlPanel = computed(() => props.showControlPanel)

let eventHandlersInitialized = false
let keyboardListenerAttached = false

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
  emit('notes-update', Array.from(state.notes.entries()))
  props.syncState?.(state)
}

state.notifyExternalChange = () => {
  emitStateUpdate()
}

// Watch for state changes to emit updates
watch(() => state.notes.size, emitStateUpdate)

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
  }

  // Start render loop
  state.rafHandle = requestAnimationFrame(renderLoop)

  // Initial render
  state.needsRedraw = true

  // Update command stack buttons and emit initial state sync
  handleCommandStackUpdate()
})

onUnmounted(() => {
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
  }
})

watch(() => props.width, (newWidth) => {
  if (state.stage) {
    state.stage.width(newWidth)
    state.needsRedraw = true
  }
})

watch(() => props.height, (newHeight) => {
  if (state.stage) {
    state.stage.height(newHeight)
    state.needsRedraw = true
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
  getPlayStartPosition
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
    <div
      ref="konvaContainer"
      :class="['piano-roll-container', { 'is-disabled': !isInteractive }]"
    ></div>
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
}

.piano-roll-container.is-disabled {
  pointer-events: none;
  cursor: not-allowed;
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
