import Konva from 'konva'
import type { Ref } from 'vue'
import type { PianoRollState, NoteData } from './pianoRollState'

export interface StageManagerDependencies {
  state: PianoRollState
  konvaContainer: Ref<HTMLDivElement | undefined>
  initializeLayers: (state: PianoRollState, stage: Konva.Stage, onCommandStackChange?: () => void) => void
  setupEventHandlers: (state: PianoRollState, stage: Konva.Stage) => void
  renderGrid: (state: PianoRollState) => void
  renderVisibleNotes: (state: PianoRollState) => void
  renderResizeHandles: (state: PianoRollState) => void
  updateQueuePlayheadPosition: (state: PianoRollState) => void
  updateLivePlayheadPosition: (state: PianoRollState) => void
  handleCommandStackUpdate: () => void
  syncUiCounters: () => void
  enforceScrollBounds: () => void
  attachKeyboard: () => void
  detachKeyboard: () => void
}

export interface StageMountOptions {
  width: number
  height: number
  interactive: boolean
  initialNotes: Array<[string, NoteData]>
}

export class StageManager {
  private eventHandlersInitialized = false
  private keyboardAttached = false

  constructor(private readonly deps: StageManagerDependencies) {}

  private renderFrame = () => {
    if (this.deps.state.needsRedraw) {
      this.deps.renderGrid(this.deps.state)
      this.deps.renderVisibleNotes(this.deps.state)
      this.deps.renderResizeHandles(this.deps.state)
      this.deps.updateQueuePlayheadPosition(this.deps.state)
      this.deps.updateLivePlayheadPosition(this.deps.state)
      this.deps.state.needsRedraw = false
    }
    this.deps.state.rafHandle = requestAnimationFrame(this.renderFrame)
  }

  private startRenderLoop() {
    this.stopRenderLoop()
    this.deps.state.rafHandle = requestAnimationFrame(this.renderFrame)
  }

  private stopRenderLoop() {
    if (this.deps.state.rafHandle) {
      cancelAnimationFrame(this.deps.state.rafHandle)
      this.deps.state.rafHandle = undefined
    }
  }

  private enableInteractivity() {
    if (!this.deps.state.stage) return

    if (!this.eventHandlersInitialized) {
      this.deps.setupEventHandlers(this.deps.state, this.deps.state.stage)
      this.eventHandlersInitialized = true
    }

    this.deps.state.stage.listening(true)

    if (!this.keyboardAttached) {
      this.deps.attachKeyboard()
      this.keyboardAttached = true
    }
  }

  private disableInteractivity() {
    if (!this.deps.state.stage) return

    this.deps.state.stage.listening(false)
    this.deps.state.interaction.isDragging = false
    this.deps.state.interaction.isResizing = false
    this.deps.state.interaction.isMarqueeSelecting = false
    this.deps.state.selection.selectionRect?.visible(false)

    if (this.keyboardAttached) {
      this.deps.detachKeyboard()
      this.keyboardAttached = false
    }

    this.deps.state.layers.overlay?.batchDraw()
    this.deps.syncUiCounters()
  }

  mount({ width, height, interactive, initialNotes }: StageMountOptions) {
    if (!this.deps.konvaContainer.value) {
      console.error('Konva container ref not found')
      return
    }

    const stageInstance = new Konva.Stage({
      container: this.deps.konvaContainer.value,
      width,
      height
    })

    this.deps.state.stage = stageInstance
    this.deps.state.konvaContainer = this.deps.konvaContainer.value

    this.deps.initializeLayers(this.deps.state, stageInstance, this.deps.handleCommandStackUpdate)

    if (interactive) {
      this.enableInteractivity()
    } else {
      this.disableInteractivity()
    }

    if (initialNotes.length > 0) {
      this.deps.state.notes = new Map(initialNotes)
      this.deps.state.needsRedraw = true
      this.deps.syncUiCounters()
    }

    this.startRenderLoop()
    this.deps.state.needsRedraw = true

    this.deps.enforceScrollBounds()

    this.deps.handleCommandStackUpdate()
  }

  unmount() {
    this.stopRenderLoop()
    this.disableInteractivity()
    this.deps.state.stage?.destroy()
    this.deps.state.stage = undefined
    this.deps.state.konvaContainer = undefined
    this.eventHandlersInitialized = false
  }

  setInteractive(interactive: boolean) {
    if (!this.deps.state.stage) return
    if (interactive) {
      this.enableInteractivity()
    } else {
      this.disableInteractivity()
    }
  }

  resize(width: number, height: number) {
    if (!this.deps.state.stage) return
    this.deps.state.stage.width(width)
    this.deps.state.stage.height(height)
    this.deps.state.needsRedraw = true
    this.deps.enforceScrollBounds()
  }
}
