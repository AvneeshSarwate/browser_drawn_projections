interface Command {
  name: string
  beforeState: string
  afterState: string
}

export class CommandStack {
  private history: Command[] = []
  private historyIndex = -1
  private inUndoRedo = false
  private maxHistorySize = 50

  constructor(
    private captureState: () => string,
    private restoreState: (state: string) => void,
    private onStateChange?: () => void
  ) {}

  executeCommand(name: string, action: () => void) {
    if (this.inUndoRedo) {
      action()
      return
    }

    const beforeState = this.captureState()
    if (!beforeState) return

    // Execute the action
    action()

    const afterState = this.captureState()
    if (!afterState || beforeState === afterState) return

    // Add command to history
    const command: Command = {
      name,
      beforeState,
      afterState
    }

    // Truncate history after current index and add new command
    this.history.splice(this.historyIndex + 1)
    this.history.push(command)
    this.historyIndex = this.history.length - 1

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
      this.historyIndex = this.history.length - 1
    }

    // Trigger state change callback
    this.onStateChange?.()
    
    console.log(`Command "${name}" added to history. Index: ${this.historyIndex}`)
  }

  undo() {
    if (this.historyIndex < 0) return

    this.inUndoRedo = true
    const command = this.history[this.historyIndex]
    console.log(`Undoing command: ${command.name}`)
    
    this.restoreState(command.beforeState)
    this.historyIndex--
    
    this.onStateChange?.()
    this.inUndoRedo = false
  }

  redo() {
    if (this.historyIndex >= this.history.length - 1) return

    this.inUndoRedo = true
    this.historyIndex++
    const command = this.history[this.historyIndex]
    console.log(`Redoing command: ${command.name}`)
    
    this.restoreState(command.afterState)
    this.onStateChange?.()
    this.inUndoRedo = false
  }

  canUndo() {
    return this.historyIndex >= 0
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1
  }
}
