import type { PianoRollState, NoteData } from './pianoRollState'

export interface KeyboardControllerOptions {
  state: PianoRollState
  isInteractive: () => boolean
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  updateCommandStackButtons: () => void
  executeOverlapChanges: (state: PianoRollState, ids: Set<string>) => void
  getContainer: () => HTMLElement | null
}

export interface KeyboardController {
  attach(): void
  detach(): void
  isAttached(): boolean
}

export const createKeyboardController = ({
  state,
  isInteractive,
  undo,
  redo,
  deleteSelected,
  updateCommandStackButtons,
  executeOverlapChanges,
  getContainer
}: KeyboardControllerOptions): KeyboardController => {
  let attached = false

  const deleteSelectedMpePoints = () => {
    if (!state.mpe.enabled) return false
    if (state.selection.selectedIds.size !== 1) return false
    if (state.mpe.selectedHandles.size === 0) return false

    const noteId = Array.from(state.selection.selectedIds)[0]
    const indices = Array.from(state.mpe.selectedHandles).sort((a, b) => b - a)
    const note = state.notes.get(noteId)
    if (!note?.mpePitch) return false

    state.command.stack?.executeCommand('Delete MPE Pitch Points', () => {
      const target = state.notes.get(noteId)
      if (!target?.mpePitch) return
      const updatedPoints = [...target.mpePitch.points]
      indices.forEach((idx) => {
        if (idx >= 0 && idx < updatedPoints.length) {
          updatedPoints.splice(idx, 1)
        }
      })
      target.mpePitch = { points: updatedPoints }
      state.mpe.selectedHandles = new Set()
      state.needsRedraw = true
      state.notifyExternalChange?.('selection')
    })

    updateCommandStackButtons()
    return true
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isInteractive()) return

    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault()
      redo()
      return
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      if (state.mpe.enabled) {
        deleteSelectedMpePoints()
        return
      }
      deleteSelected()
      return
    }

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
      return
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'c' && state.selection.selectedIds.size > 0) {
      e.preventDefault()
      const copiedNotes = Array.from(state.selection.selectedIds).map(id => {
        const note = state.notes.get(id)
        return note ? { ...note } : null
      }).filter((note): note is NoteData => note !== null)

      if (copiedNotes.length === 0) return

      const minPos = Math.min(...copiedNotes.map(note => note.position))

      sessionStorage.setItem('copiedPianoRollNotes', JSON.stringify({
        notes: copiedNotes.map(note => ({ ...note, position: note.position - minPos }))
      }))
      return
    }

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
      } catch (error) {
        console.error('Failed to paste notes', error)
      }
    }
  }

  const attach = () => {
    if (attached) return
    const container = getContainer()
    if (!container) return

    container.setAttribute('tabindex', '0')
    container.addEventListener('keydown', handleKeyDown)
    attached = true
  }

  const detach = () => {
    if (!attached) return
    const container = getContainer()
    if (container) {
      container.removeEventListener('keydown', handleKeyDown)
    }
    attached = false
  }

  return {
    attach,
    detach,
    isAttached: () => attached
  }
}
