// Simple snapshot-based command stack for undo/redo

export interface Command {
  name: string
  beforeState: string
  afterState: string
}

export class CommandStack {
  private stack: Command[] = []
  private currentIndex = -1
  private onChangeCallback?: () => void

  constructor(
    private captureState: () => string,
    private restoreState: (state: string) => void,
    onChangeCallback?: () => void
  ) {
    this.onChangeCallback = onChangeCallback
  }

  // Execute a command by capturing before/after state
  executeCommand(name: string, action: () => void) {
    const before = this.captureState()
    action()
    const after = this.captureState()

    if (before !== after) {
      this.pushCommand(name, before, after)
    }
  }

  // Manually push a command with captured states
  pushCommand(name: string, beforeState: string, afterState: string) {
    // Remove any commands after current index (for redo)
    this.stack = this.stack.slice(0, this.currentIndex + 1)

    // Add new command
    this.stack.push({ name, beforeState, afterState })
    this.currentIndex++

    this.onChangeCallback?.()
  }

  canUndo(): boolean {
    return this.currentIndex >= 0
  }

  canRedo(): boolean {
    return this.currentIndex < this.stack.length - 1
  }

  undo() {
    if (!this.canUndo()) return

    const command = this.stack[this.currentIndex]
    this.restoreState(command.beforeState)
    this.currentIndex--

    this.onChangeCallback?.()
  }

  redo() {
    if (!this.canRedo()) return

    this.currentIndex++
    const command = this.stack[this.currentIndex]
    this.restoreState(command.afterState)

    this.onChangeCallback?.()
  }

  clear() {
    this.stack = []
    this.currentIndex = -1
    this.onChangeCallback?.()
  }
}