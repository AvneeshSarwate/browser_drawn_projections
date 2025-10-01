import Konva from 'konva'
import type { PianoRollState, NoteData } from './pianoRollState'
import {
  uid,
  screenToPitchPosition,
  pitchPositionToScreen,
  quantizeToGrid,
  isNoteVisible,
  getNotesInRect,
  updateOverlapPreview,
  clearOverlapPreview,
  executeOverlapChanges,
  getNoteDisplayDuration,
  applySnapToNoteStart,
  getGridUnitWidth,
  midiPitchToString,
  quantize
} from './pianoRollUtils'
import { CommandStack } from './commandStack'

// ================= State Serialization =================

export function captureState(state: PianoRollState): string {
  return JSON.stringify({
    notes: Array.from(state.notes.entries()),
    selection: Array.from(state.selection.selectedIds)
  })
}

export function restoreState(state: PianoRollState, snapshot: string) {
  const data = JSON.parse(snapshot)
  state.notes = new Map(data.notes)
  state.selection.selectedIds = new Set(data.selection)
  state.needsRedraw = true
}

function selectionSetsDiffer(previous: Set<string>, current: Set<string>): boolean {
  if (previous.size !== current.size) return true
  for (const id of previous) {
    if (!current.has(id)) {
      return true
    }
  }
  return false
}

function mutateSelection(state: PianoRollState, mutate: () => void): boolean {
  const before = new Set(state.selection.selectedIds)
  mutate()
  const changed = selectionSetsDiffer(before, state.selection.selectedIds)
  if (changed) {
    state.notifyExternalChange?.()
  }
  return changed
}

// ================= Layer Initialization =================

export function initializeLayers(state: PianoRollState, stage: Konva.Stage, onCommandStackChange?: () => void) {
  // Grid layer (bottom, non-interactive)
  const gridLayer = new Konva.Layer({
    listening: false,
    name: 'grid-layer'
  })
  stage.add(gridLayer)
  state.layers.grid = gridLayer

  // Notes layer (interactive)
  const notesLayer = new Konva.Layer({
    name: 'notes-layer'
  })
  stage.add(notesLayer)
  state.layers.notes = notesLayer

  // Overlay layer (for UI elements)
  const overlayLayer = new Konva.Layer({
    name: 'overlay-layer'
  })
  stage.add(overlayLayer)
  state.layers.overlay = overlayLayer

  // Create selection rectangle
  state.selection.selectionRect = new Konva.Rect({
    stroke: '#4A90E2',
    strokeWidth: 1,
    dash: [3, 3],
    fill: 'rgba(74, 144, 226, 0.1)',
    listening: false,
    visible: false
  })
  overlayLayer.add(state.selection.selectionRect)

  // Create queue playhead element (green)
  const pianoRollHeight = 128 * state.grid.noteHeight
  state.queuePlayhead.element = new Konva.Line({
    points: [0, 0, 0, pianoRollHeight],
    stroke: '#00ff00',
    strokeWidth: 2,
    listening: false
  })
  overlayLayer.add(state.queuePlayhead.element)

  // Create live playhead element (orange)
  state.livePlayhead.element = new Konva.Line({
    points: [0, 0, 0, pianoRollHeight],
    stroke: '#ff8800',
    strokeWidth: 2,
    listening: false
  })
  overlayLayer.add(state.livePlayhead.element)

  // Initialize command stack
  state.command.stack = new CommandStack(
    () => captureState(state),
    (snapshot) => restoreState(state, snapshot),
    () => {
      state.needsRedraw = true
      onCommandStackChange?.()
    }
  )
}

// ================= Rendering Functions =================

export function renderGrid(state: PianoRollState) {
  const gridLayer = state.layers.grid
  if (!gridLayer || !state.stage) return

  const gridCache = state.renderCache.grid

  // Only redraw if viewport or subdivision changed
  if (gridCache.lastScrollX === state.viewport.scrollX &&
      gridCache.lastScrollY === state.viewport.scrollY &&
      gridCache.lastSubdivision === state.grid.subdivision &&
      gridCache.lastQuarterNoteWidth === state.grid.quarterNoteWidth &&
      gridCache.lastNoteHeight === state.grid.noteHeight) {
    return
  }

  gridCache.lastScrollX = state.viewport.scrollX
  gridCache.lastScrollY = state.viewport.scrollY
  gridCache.lastSubdivision = state.grid.subdivision
  gridCache.lastQuarterNoteWidth = state.grid.quarterNoteWidth
  gridCache.lastNoteHeight = state.grid.noteHeight

  gridLayer.destroyChildren()

  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight, numMeasures, timeSignature } = state.grid
  const stage = state.stage

  const viewportWidth = stage.width()
  const viewportHeight = stage.height()

  const pianoRollHeight = 128 * noteHeight
  const pulsesPerMeasure = timeSignature * 4
  const measureWidth = quarterNoteWidth * pulsesPerMeasure

  // Draw measure backgrounds
  const firstVisibleMeasure = Math.floor(scrollX / measureWidth)
  const lastVisibleMeasure = Math.ceil((scrollX + viewportWidth) / measureWidth)

  for (let i = firstVisibleMeasure; i <= lastVisibleMeasure && i < numMeasures; i++) {
    const color = i % 2 === 0 ? state.grid.backgroundColor1 : state.grid.backgroundColor2
    const x = i * measureWidth - scrollX

    gridLayer.add(new Konva.Rect({
      x,
      y: -scrollY,
      width: measureWidth,
      height: pianoRollHeight,
      fill: color,
      listening: false
    }))
  }

  // Draw vertical lines (time grid)
  const numVertLines = numMeasures * pulsesPerMeasure * (state.grid.subdivision / 4)
  const vertLineSpace = quarterNoteWidth * (4 / state.grid.subdivision)

  const firstVisibleLine = Math.floor(scrollX / vertLineSpace)
  const lastVisibleLine = Math.ceil((scrollX + viewportWidth) / vertLineSpace)

  for (let i = firstVisibleLine; i <= lastVisibleLine && i < numVertLines; i++) {
    const xPos = i * vertLineSpace - scrollX
    const isQuarterNote = (i * vertLineSpace) % quarterNoteWidth === 0
    const strokeWidth = isQuarterNote ? 1.8 : 1

    gridLayer.add(new Konva.Line({
      points: [xPos, -scrollY, xPos, pianoRollHeight - scrollY],
      stroke: '#000',
      strokeWidth,
      listening: false
    }))
  }

  // Draw horizontal lines (pitch boundaries)
  const firstVisiblePitch = Math.floor(scrollY / noteHeight)
  const lastVisiblePitch = Math.ceil((scrollY + viewportHeight) / noteHeight)

  for (let i = firstVisiblePitch; i <= lastVisiblePitch && i < 128; i++) {
    const yPos = i * noteHeight - scrollY

    gridLayer.add(new Konva.Line({
      points: [0 - scrollX, yPos, numMeasures * measureWidth - scrollX, yPos],
      stroke: '#000',
      strokeWidth: 1,
      listening: false
    }))
  }

  gridLayer.batchDraw()
}

export function renderVisibleNotes(state: PianoRollState) {
  const notesLayer = state.layers.notes
  if (!notesLayer || !state.stage) return

  notesLayer.destroyChildren()

  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight } = state.grid

  // Separate notes into selected and unselected for proper z-order
  const unselectedNotes: Array<[string, NoteData]> = []
  const selectedNotes: Array<[string, NoteData]> = []

  state.notes.forEach((note, id) => {
    if (!isNoteVisible(note, state)) return

    if (state.selection.selectedIds.has(id)) {
      selectedNotes.push([id, note])
    } else {
      unselectedNotes.push([id, note])
    }
  })

  // Render unselected notes first (back)
  unselectedNotes.forEach(([id, note]) => {
    const screen = pitchPositionToScreen(note.pitch, note.position, state)
    // Use display duration (may be truncated)
    const displayDuration = getNoteDisplayDuration(state, id, note.duration)
    const width = displayDuration * quarterNoteWidth
    const isHidden = state.interaction.hiddenNoteIds.has(id)

    const rect = new Konva.Rect({
      x: screen.x,
      y: screen.y,
      width,
      height: noteHeight,
      fill: state.grid.noteColor,
      stroke: '#000',
      strokeWidth: 1,
      opacity: isHidden ? 0.3 : 1.0,
      listening: true
    })
    rect.setAttr('noteId', id)
    notesLayer.add(rect)

    // Add note label
    const labelText = midiPitchToString(note.pitch)
    const label = new Konva.Text({
      x: screen.x + 4,
      y: screen.y + 2,
      text: labelText,
      fontSize: 14,
      fill: '#000',
      listening: false
    })
    notesLayer.add(label)
  })

  // Render selected notes last (front) - ensures they appear on top
  selectedNotes.forEach(([id, note]) => {
    const screen = pitchPositionToScreen(note.pitch, note.position, state)
    // Selected notes use their actual duration (not truncated)
    const width = note.duration * quarterNoteWidth
    const isHidden = state.interaction.hiddenNoteIds.has(id)

    const rect = new Konva.Rect({
      x: screen.x,
      y: screen.y,
      width,
      height: noteHeight,
      fill: state.grid.selectedNoteColor,
      stroke: '#000',
      strokeWidth: 1,
      opacity: isHidden ? 0.3 : 1.0,
      listening: true
    })
    rect.setAttr('noteId', id)
    notesLayer.add(rect)

    // Add note label
    const labelText = midiPitchToString(note.pitch)
    const label = new Konva.Text({
      x: screen.x + 4,
      y: screen.y + 2,
      text: labelText,
      fontSize: 14,
      fill: '#000',
      listening: false
    })
    notesLayer.add(label)
  })

  notesLayer.batchDraw()
}

export function renderResizeHandles(state: PianoRollState) {
  const notesLayer = state.layers.notes
  if (!notesLayer) return

  const { quarterNoteWidth, noteHeight } = state.grid
  const handleRadius = 5

  // Remove existing handles
  notesLayer.find('.resize-handle').forEach(node => node.destroy())

  state.selection.selectedIds.forEach(id => {
    const note = state.notes.get(id)
    if (!note || !isNoteVisible(note, state)) return

    const screen = pitchPositionToScreen(note.pitch, note.position, state)
    const width = note.duration * quarterNoteWidth

    // Start handle
    const startHandle = new Konva.Circle({
      x: screen.x,
      y: screen.y + noteHeight / 2,
      radius: handleRadius,
      fill: '#000',
      listening: true,
      name: 'resize-handle'
    })
    startHandle.setAttr('handleNoteId', id)
    startHandle.setAttr('handleIsEnd', false)
    notesLayer.add(startHandle)

    // End handle
    const endHandle = new Konva.Circle({
      x: screen.x + width,
      y: screen.y + noteHeight / 2,
      radius: handleRadius,
      fill: '#000',
      listening: true,
      name: 'resize-handle'
    })
    endHandle.setAttr('handleNoteId', id)
    endHandle.setAttr('handleIsEnd', true)
    notesLayer.add(endHandle)
  })

  notesLayer.batchDraw()
}

export function renderMarqueeRect(state: PianoRollState) {
  if (!state.selection.selectionRect) return
  if (!state.interaction.marqueeStart || !state.interaction.marqueeCurrent) return

  const start = state.interaction.marqueeStart
  const current = state.interaction.marqueeCurrent

  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  const width = Math.abs(current.x - start.x)
  const height = Math.abs(current.y - start.y)

  state.selection.selectionRect.setAttrs({
    x,
    y,
    width,
    height,
    visible: width > 5 || height > 5
  })

  state.layers.overlay?.batchDraw()
}

export function updateQueuePlayheadPosition(state: PianoRollState) {
  if (!state.queuePlayhead.element) return

  const { scrollX } = state.viewport
  const x = state.queuePlayhead.position * state.grid.quarterNoteWidth - scrollX

  state.queuePlayhead.element.x(x)
  state.layers.overlay?.batchDraw()
}

export function updateLivePlayheadPosition(state: PianoRollState) {
  if (!state.livePlayhead.element) return

  const { scrollX } = state.viewport
  const x = state.livePlayhead.position * state.grid.quarterNoteWidth - scrollX

  state.livePlayhead.element.x(x)
  state.layers.overlay?.batchDraw()
}

// ================= Interaction Handlers =================

export function setupEventHandlers(state: PianoRollState, stage: Konva.Stage) {
  const notesLayer = state.layers.notes
  const gridLayer = state.layers.grid

  // Double-click on background → Add note
  stage.on('dblclick', (e) => {
    if (e.target === stage || e.target.getLayer() === gridLayer) {
      const pos = stage.getPointerPosition()
      if (!pos) return

      const { pitch, position } = screenToPitchPosition(pos, state)
      const quantizedPos = quantizeToGrid(position, state.grid.subdivision)
      const quantizedPitch = Math.round(pitch)

      state.command.stack?.executeCommand('Add Note', () => {
        const note: NoteData = {
          id: uid(),
          pitch: quantizedPitch,
          position: quantizedPos,
          duration: 4 / state.grid.subdivision,
          velocity: 0.8
        }
        state.notes.set(note.id, note)
        state.needsRedraw = true
      })
    }
  })

  // Click on note or handle
  stage.on('mousedown touchstart', (e) => {
    const target = e.target

    // Check if clicking on resize handle
    const handleNoteId = target.getAttr?.('handleNoteId')
    if (handleNoteId) {
      const isEnd = target.getAttr('handleIsEnd')
      startResize(state, stage, handleNoteId, isEnd)
      return
    }

    // Check if clicking on note
    const noteId = target.getAttr?.('noteId')
    if (noteId) {
      const isShift = e.evt.shiftKey || e.evt.ctrlKey
      const isSelected = state.selection.selectedIds.has(noteId)

      mutateSelection(state, () => {
        if (isShift) {
          // Toggle selection
          if (isSelected) {
            state.selection.selectedIds.delete(noteId)
          } else {
            state.selection.selectedIds.add(noteId)
          }
        } else {
          // Replace selection unless single note already selected
          if (!isSelected || state.selection.selectedIds.size > 1) {
            state.selection.selectedIds.clear()
            state.selection.selectedIds.add(noteId)
          }
        }
      })

      // Start drag for selected notes
      startNoteDrag(state, stage)
      state.needsRedraw = true
      return
    }

    // Clicking on background → start marquee selection
    if (target === stage || target.getLayer() === gridLayer) {
      const pos = stage.getPointerPosition()
      if (!pos) return

      state.interaction.isMarqueeSelecting = true
      state.interaction.marqueeStart = pos
      state.interaction.marqueeCurrent = pos
      state.interaction.marqueeIsShift = e.evt.shiftKey || e.evt.ctrlKey

      if (!state.interaction.marqueeIsShift) {
        mutateSelection(state, () => {
          state.selection.selectedIds.clear()
        })
      }

      state.needsRedraw = true
    }
  })

  // Mouse move
  stage.on('mousemove touchmove', (e) => {
    const pos = stage.getPointerPosition()
    if (!pos) return

    // Handle drag
    if (state.interaction.isDragging) {
      updateNoteDrag(state, stage)
      return
    }

    // Handle resize
    if (state.interaction.isResizing) {
      updateNoteResize(state, stage)
      return
    }

    // Handle marquee selection
    if (state.interaction.isMarqueeSelecting) {
      state.interaction.marqueeCurrent = pos

      renderMarqueeRect(state)

      // Update selection based on intersection
      const rect = {
        x: Math.min(state.interaction.marqueeStart!.x, pos.x),
        y: Math.min(state.interaction.marqueeStart!.y, pos.y),
        width: Math.abs(pos.x - state.interaction.marqueeStart!.x),
        height: Math.abs(pos.y - state.interaction.marqueeStart!.y)
      }

      const intersecting = getNotesInRect(state, rect)

      mutateSelection(state, () => {
        if (state.interaction.marqueeIsShift) {
          // Add to selection without removing existing
          intersecting.forEach(id => {
            state.selection.selectedIds.add(id)
          })
        } else {
          // Replace selection with intersecting notes
          state.selection.selectedIds.clear()
          intersecting.forEach(id => {
            state.selection.selectedIds.add(id)
          })
        }
      })

      state.needsRedraw = true
    }
  })

  // Mouse up
  stage.on('mouseup touchend', (e) => {
    if (state.interaction.isDragging) {
      finishNoteDrag(state)
      return
    }

    if (state.interaction.isResizing) {
      finishNoteResize(state)
      return
    }

    if (state.interaction.isMarqueeSelecting) {
      const wasClick = state.interaction.marqueeStart && state.interaction.marqueeCurrent &&
        Math.abs(state.interaction.marqueeStart.x - state.interaction.marqueeCurrent.x) < 5 &&
        Math.abs(state.interaction.marqueeStart.y - state.interaction.marqueeCurrent.y) < 5

      state.interaction.isMarqueeSelecting = false
      if (state.selection.selectionRect) {
        state.selection.selectionRect.visible(false)
        state.layers.overlay?.batchDraw()
      }

      // If it was a click (not a drag), move queue playhead to clicked position
      if (wasClick && e.target === stage || e.target.getLayer() === gridLayer) {
        const pos = stage.getPointerPosition()
        if (pos) {
          const { position } = screenToPitchPosition(pos, state)
          const quantizedPos = quantizeToGrid(position, state.grid.subdivision)
          state.queuePlayhead.position = Math.max(0, Math.min(quantizedPos, state.grid.maxLength))
          state.needsRedraw = true
          state.notifyExternalChange?.() //for queue playhead update
        }
      }
    }
  })
}

// ================= Drag Handlers =================

function startNoteDrag(state: PianoRollState, stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos) return

  state.interaction.isDragging = true
  state.interaction.dragStartPos = pos
  state.interaction.quantDragActivated = false
  state.interaction.dragBeforeState = captureState(state)

  // Store initial states for all selected notes
  state.interaction.draggedNoteInitialStates.clear()
  state.selection.selectedIds.forEach(id => {
    const note = state.notes.get(id)
    if (note) {
      state.interaction.draggedNoteInitialStates.set(id, {
        position: note.position,
        pitch: note.pitch
      })
    }
  })
}

function updateNoteDrag(state: PianoRollState, stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos || !state.interaction.dragStartPos) return

  const dx = pos.x - state.interaction.dragStartPos.x
  const dy = pos.y - state.interaction.dragStartPos.y

  // Quantization logic
  const quantWidth = getGridUnitWidth(state)
  let xMove
  if (Math.abs(dx) < quantWidth * 0.9 && !state.interaction.quantDragActivated) {
    xMove = dx
  } else {
    xMove = Math.round(dx / quantWidth) * quantWidth
    state.interaction.quantDragActivated = true
  }

  // Pitch quantization (always snapped)
  const pitchDelta = Math.round(dy / state.grid.noteHeight)

  // Update all selected notes
  state.interaction.draggedNoteInitialStates.forEach((initial, id) => {
    const note = state.notes.get(id)
    if (note) {
      note.position = initial.position + (xMove / state.grid.quarterNoteWidth)
      note.pitch = Math.max(0, Math.min(127, initial.pitch - pitchDelta))
    }
  })

  // Apply snap-to-note-start
  applySnapToNoteStart(state)

  // Overlap detection & preview
  updateOverlapPreview(state)

  state.needsRedraw = true
}

function finishNoteDrag(state: PianoRollState) {
  // Execute overlap changes (truncate/delete notes)
  executeOverlapChanges(state)

  const after = captureState(state)
  if (state.interaction.dragBeforeState && state.interaction.dragBeforeState !== after) {
    state.command.stack?.pushCommand('Move Notes', state.interaction.dragBeforeState, after)
  }

  state.interaction.isDragging = false
  clearOverlapPreview(state)
  state.needsRedraw = true
}

// ================= Resize Handlers =================

function startResize(state: PianoRollState, stage: Konva.Stage, noteId: string, isEnd: boolean) {
  const pos = stage.getPointerPosition()
  if (!pos) return

  state.interaction.isResizing = true
  state.interaction.resizeTargetId = noteId
  state.interaction.resizeIsEnd = isEnd
  state.interaction.quantResizeActivated = false
  state.interaction.dragStartPos = pos
  state.interaction.resizeBeforeState = captureState(state)

  // Store initial states for ALL selected notes
  state.interaction.resizeInitialStates.clear()
  state.selection.selectedIds.forEach(id => {
    const note = state.notes.get(id)
    if (note) {
      state.interaction.resizeInitialStates.set(id, {
        position: note.position,
        duration: note.duration
      })
    }
  })
}

function updateNoteResize(state: PianoRollState, stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos || !state.interaction.dragStartPos) return

  const dx = pos.x - state.interaction.dragStartPos.x

  // Apply same quantization as drag
  const quantWidth = getGridUnitWidth(state)
  let xMove
  if (Math.abs(dx) < quantWidth * 0.9 && !state.interaction.quantResizeActivated) {
    xMove = dx
  } else {
    xMove = Math.round(dx / quantWidth) * quantWidth
    state.interaction.quantResizeActivated = true
  }

  const positionDelta = xMove / state.grid.quarterNoteWidth

  // Update all selected notes
  state.interaction.resizeInitialStates.forEach((initial, id) => {
    const note = state.notes.get(id)
    if (!note) return

    if (state.interaction.resizeIsEnd) {
      // Resize end: change duration
      note.duration = Math.max(0.25, initial.duration + positionDelta)
    } else {
      // Resize start: change position AND duration
      note.position = initial.position + positionDelta
      note.duration = Math.max(0.25, initial.duration - positionDelta)
    }
  })

  updateOverlapPreview(state)
  state.needsRedraw = true
}

function finishNoteResize(state: PianoRollState) {
  // Execute overlap changes (truncate/delete notes)
  executeOverlapChanges(state)

  const after = captureState(state)
  if (state.interaction.resizeBeforeState && state.interaction.resizeBeforeState !== after) {
    state.command.stack?.pushCommand('Resize Notes', state.interaction.resizeBeforeState, after)
  }

  state.interaction.isResizing = false
  clearOverlapPreview(state)
  state.needsRedraw = true
}
