import type { PianoRollState, NoteData } from './pianoRollState'

// Generate unique ID
export const uid = (prefix = 'note_') => `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Convert screen coordinates to musical pitch/position
export function screenToPitchPosition(
  screenPos: { x: number, y: number },
  state: PianoRollState
): { pitch: number, position: number } {
  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight } = state.grid

  const svgX = screenPos.x + scrollX
  const svgY = screenPos.y + scrollY

  const position = svgX / quarterNoteWidth
  const pitch = 127 - Math.floor(svgY / noteHeight)

  return { pitch, position }
}

// Convert musical pitch/position to screen coordinates
export function pitchPositionToScreen(
  pitch: number,
  position: number,
  state: PianoRollState
): { x: number, y: number } {
  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight } = state.grid

  const svgX = position * quarterNoteWidth
  const svgY = (127 - pitch) * noteHeight

  return {
    x: svgX - scrollX,
    y: svgY - scrollY
  }
}

// Quantize position to grid subdivision
export function quantizeToGrid(position: number, subdivision: number): number {
  const notesPerQuarterNote = subdivision / 4
  return Math.round(position * notesPerQuarterNote) / notesPerQuarterNote
}

// Quantize value to a given interval
export function quantize(value: number, interval: number): number {
  return Math.round(value / interval) * interval
}

// Get the pixel width of one grid unit
export function getGridUnitWidth(state: PianoRollState): number {
  return state.grid.quarterNoteWidth * (4 / state.grid.subdivision)
}

// Check if a note is in the visible viewport
export function isNoteVisible(note: NoteData, state: PianoRollState): boolean {
  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight } = state.grid
  const stage = state.stage

  if (!stage) return false

  const viewportWidth = stage.width()
  const viewportHeight = stage.height()

  const visibleTimeStart = scrollX / quarterNoteWidth
  const visibleTimeEnd = (scrollX + viewportWidth) / quarterNoteWidth
  const visiblePitchMin = Math.floor(scrollY / noteHeight)
  const visiblePitchMax = Math.ceil((scrollY + viewportHeight) / noteHeight)

  const noteEnd = note.position + note.duration
  const notePitch = 127 - note.pitch

  // Check time overlap
  if (noteEnd < visibleTimeStart || note.position > visibleTimeEnd) {
    return false
  }

  // Check pitch overlap
  if (notePitch < visiblePitchMin || notePitch > visiblePitchMax) {
    return false
  }

  return true
}

// Get notes that intersect with a rectangle
export function getNotesInRect(
  state: PianoRollState,
  rect: { x: number, y: number, width: number, height: number }
): string[] {
  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight } = state.grid

  const intersectingIds: string[] = []

  state.notes.forEach((note, id) => {
    const noteScreen = pitchPositionToScreen(note.pitch, note.position, state)
    const noteWidth = note.duration * quarterNoteWidth

    // Check if rectangles intersect
    const noteRight = noteScreen.x + noteWidth
    const noteBottom = noteScreen.y + noteHeight
    const rectRight = rect.x + rect.width
    const rectBottom = rect.y + rect.height

    const intersects = !(
      noteRight < rect.x ||
      noteScreen.x > rectRight ||
      noteBottom < rect.y ||
      noteScreen.y > rectBottom
    )

    if (intersects) {
      intersectingIds.push(id)
    }
  })

  return intersectingIds
}

// Check if two notes overlap (same pitch, overlapping time)
export function notesOverlap(note1: NoteData, note2: NoteData): boolean {
  if (note1.pitch !== note2.pitch) return false

  const note1End = note1.position + note1.duration
  const note2End = note2.position + note2.duration

  return !(note1End <= note2.position || note2End <= note1.position)
}

// Update overlap preview: mark notes that should be hidden or truncated (for display only)
export function updateOverlapPreview(state: PianoRollState) {
  state.interaction.hiddenNoteIds.clear()
  state.interaction.truncatedNotes.clear()

  state.selection.selectedIds.forEach(selectedId => {
    const selectedNote = state.notes.get(selectedId)
    if (!selectedNote) return

    const selectedEnd = selectedNote.position + selectedNote.duration

    // Find notes at same pitch
    state.notes.forEach((otherNote, otherId) => {
      if (state.selection.selectedIds.has(otherId)) return
      if (otherNote.pitch !== selectedNote.pitch) return

      const otherEnd = otherNote.position + otherNote.duration

      // Case 1: Truncate - selected note's start overlaps middle of other note
      // (other note starts before selected, but ends after selected starts)
      if (otherNote.position < selectedNote.position &&
          selectedNote.position < otherEnd) {
        // Store truncated duration for rendering
        const truncatedDuration = selectedNote.position - otherNote.position
        state.interaction.truncatedNotes.set(otherId, truncatedDuration)
      }
      // Case 2: Delete - selected note overlaps start of other note
      else if (selectedNote.position <= otherNote.position &&
               otherNote.position < selectedEnd) {
        state.interaction.hiddenNoteIds.add(otherId)
      }
    })
  })
}

// Get the display duration for a note (may be truncated during drag/resize)
export function getNoteDisplayDuration(state: PianoRollState, noteId: string, originalDuration: number): number {
  return state.interaction.truncatedNotes.get(noteId) ?? originalDuration
}

// Execute overlap changes: actually truncate/delete notes in state
export function executeOverlapChanges(state: PianoRollState) {
  // Delete hidden notes
  state.interaction.hiddenNoteIds.forEach(noteId => {
    state.notes.delete(noteId)
  })

  // Truncate notes
  state.interaction.truncatedNotes.forEach((truncatedDuration, noteId) => {
    const note = state.notes.get(noteId)
    if (note) {
      note.duration = truncatedDuration
    }
  })
}

// Clear overlap preview state (call on drag/resize end)
export function clearOverlapPreview(state: PianoRollState) {
  state.interaction.truncatedNotes.clear()
  state.interaction.hiddenNoteIds.clear()
}

// Apply snap-to-note-start feature
export function applySnapToNoteStart(state: PianoRollState) {
  const SNAP_THRESHOLD = 0.1  // quarter notes

  let snapOffset: number | null = null

  // Find snap target from first selected note
  for (const selectedId of state.selection.selectedIds) {
    const selectedNote = state.notes.get(selectedId)
    if (!selectedNote) continue

    // Find closest non-selected note start
    let closestDist = Infinity
    let closestPos: number | null = null

    state.notes.forEach((otherNote, otherId) => {
      if (state.selection.selectedIds.has(otherId)) return

      const dist = Math.abs(selectedNote.position - otherNote.position)
      if (dist < closestDist && dist < SNAP_THRESHOLD) {
        closestDist = dist
        closestPos = otherNote.position
      }
    })

    // Calculate snap offset
    if (closestPos !== null) {
      snapOffset = closestPos - selectedNote.position
      break
    }
  }

  // Apply snap offset to ALL selected notes
  if (snapOffset !== null) {
    state.selection.selectedIds.forEach(id => {
      const note = state.notes.get(id)
      if (note) note.position += snapOffset!
    })
  }
}

// Pitch to string conversion
const pitchStrings = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiPitchToString(pitch: number): string {
  return pitchStrings[pitch % 12] + (Math.floor(pitch / 12) - 2)
}