import type { Ref } from 'vue'
import type { PianoRollState } from './pianoRollState'

export interface CommandHandlersOptions {
  state: PianoRollState
  canUndo: Ref<boolean>
  canRedo: Ref<boolean>
  emitStateUpdate: () => void
}

export interface CommandHandlers {
  undo: () => void
  redo: () => void
  deleteSelected: () => void
  updateCommandStackButtons: () => void
  handleCommandStackUpdate: () => void
}

export const createCommandHandlers = ({
  state,
  canUndo,
  canRedo,
  emitStateUpdate
}: CommandHandlersOptions): CommandHandlers => {
  const updateCommandStackButtons = () => {
    canUndo.value = state.command.stack?.canUndo() ?? false
    canRedo.value = state.command.stack?.canRedo() ?? false
  }

  const undo = () => {
    state.command.stack?.undo()
    updateCommandStackButtons()
  }

  const redo = () => {
    state.command.stack?.redo()
    updateCommandStackButtons()
  }

  const deleteSelected = () => {
    if (state.selection.selectedIds.size === 0) return

    state.command.stack?.executeCommand('Delete Selected', () => {
      state.selection.selectedIds.forEach(id => state.notes.delete(id))
      state.selection.selectedIds.clear()
      state.needsRedraw = true
    })

    updateCommandStackButtons()
  }

  const handleCommandStackUpdate = () => {
    updateCommandStackButtons()
    emitStateUpdate()
  }

  return {
    undo,
    redo,
    deleteSelected,
    updateCommandStackButtons,
    handleCommandStackUpdate
  }
}
