/**
 * Piano Roll WebSocket Client for server-side control of Piano Roll components.
 *
 * This client is designed for use in Deno Jupyter notebooks where:
 * - The notebook hosts a WebSocket server
 * - Piano Roll components run in iframes and connect as WebSocket clients
 * - This client provides a clean API to send commands and receive state updates
 *
 * Usage:
 * ```typescript
 * const server = Deno.serve({ port: 8080 }, (req) => {
 *   if (req.headers.get("upgrade") === "websocket") {
 *     const { socket, response } = Deno.upgradeWebSocket(req);
 *     const client = new PianoRollWebSocketClient(socket);
 *     // Use client to control the piano roll
 *     return response;
 *   }
 * });
 * ```
 */

// ============================================================================
// Type Definitions (readonly versions for server-side state)
// ============================================================================

export interface NoteData {
  readonly id: string
  readonly pitch: number // 0-127
  readonly position: number
  readonly duration: number
  readonly velocity: number // 0-127
  readonly mpePitch?: {
    readonly points: ReadonlyArray<{
      readonly time: number
      readonly pitchOffset: number
    }>
  }
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface NoteDataInput {
  readonly id?: string
  readonly pitch: number // 0-127
  readonly position: number
  readonly duration: number
  readonly velocity?: number // 0-127, defaults to 100 if omitted
  readonly mpePitch?: {
    readonly points: ReadonlyArray<{
      readonly time: number
      readonly pitchOffset: number
    }>
  }
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface Viewport {
  readonly scrollX: number
  readonly scrollY: number
  readonly zoomX: number
  readonly zoomY: number
}

export interface GridSettings {
  readonly quarterNoteWidth: number
  readonly noteHeight: number
  readonly subdivision: number
}

export interface PianoRollStateSnapshot {
  readonly viewport: Viewport
  readonly grid: GridSettings
}

export interface PianoRollConfig {
  readonly width?: number
  readonly height?: number
  readonly interactive?: boolean
  readonly showControlPanel?: boolean
}

export type UpdateSource =
  | 'notes'
  | 'selection'
  | 'playhead'
  | 'viewport'
  | 'grid'
  | 'other'

// ============================================================================
// Internal Message Types
// ============================================================================

interface NotesUpdateMessage {
  type: 'notesUpdate'
  notes: Array<[string, NoteData]>
  source?: UpdateSource
}

interface StateUpdateMessage {
  type: 'stateUpdate'
  viewport: Viewport
  grid: GridSettings
  source?: UpdateSource
}

interface PlayStartPositionResponseMessage {
  type: 'playStartPositionResponse'
  position: number
  requestId?: string
}

interface ConnectionReadyMessage {
  type: 'connectionReady'
}

type IncomingMessage =
  | NotesUpdateMessage
  | StateUpdateMessage
  | PlayStartPositionResponseMessage
  | ConnectionReadyMessage

interface SetNotesMessage {
  type: 'setNotes'
  notes: NoteDataInput[]
}

interface SetLivePlayheadMessage {
  type: 'setLivePlayhead'
  position: number
}

interface FitZoomToNotesMessage {
  type: 'fitZoomToNotes'
}

interface GetPlayStartPositionMessage {
  type: 'getPlayStartPosition'
  requestId?: string
}

interface SetConfigMessage {
  type: 'setConfig'
  width?: number
  height?: number
  interactive?: boolean
  showControlPanel?: boolean
}

type OutgoingMessage =
  | SetNotesMessage
  | SetLivePlayheadMessage
  | FitZoomToNotesMessage
  | GetPlayStartPositionMessage
  | SetConfigMessage

// ============================================================================
// WebSocket Client Class
// ============================================================================

/**
 * Server-side client for controlling a Piano Roll component via WebSocket.
 *
 * Provides:
 * - Command methods to send instructions to the component
 * - Readonly state that updates when the component sends updates
 * - Event callbacks for component messages
 * - Async request/response pattern for getPlayStartPosition
 */
export class PianoRollWebSocketClient {
  private ws: WebSocket
  private pendingRequests = new Map<string, {
    resolve: (value: number) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  private requestTimeout = 10000 // 10 seconds

  // Internal mutable state
  private _notes: ReadonlyMap<string, NoteData> = new Map()
  private _viewport: Viewport | null = null
  private _grid: GridSettings | null = null
  private _connected = false
  private _config: PianoRollConfig = {}
  private _livePlayhead = 0

  // ============================================================================
  // Event Callbacks
  // ============================================================================

  /** Called when the component sends a notes update */
  onNotesUpdate?: (notes: ReadonlyMap<string, Readonly<NoteData>>, source?: UpdateSource) => void

  /** Called when the component sends a state update (viewport/grid) */
  onStateUpdate?: (state: Readonly<PianoRollStateSnapshot>, source?: UpdateSource) => void

  /** Called when the component signals it's ready */
  onConnectionReady?: () => void

  /** Called when the WebSocket connection closes */
  onDisconnect?: () => void

  /** Called when there's an error */
  onError?: (error: Error) => void

  // ============================================================================
  // Readonly State Accessors
  // ============================================================================

  /**
   * The current notes in the piano roll as a readonly Map.
   * Keys are note IDs, values are note data.
   * This is readonly - mutations will cause TypeScript errors.
   */
  get notes(): ReadonlyMap<string, Readonly<NoteData>> {
    return this._notes
  }

  /**
   * Convenience getter for notes as a readonly array.
   */
  get notesArray(): ReadonlyArray<Readonly<NoteData>> {
    return Array.from(this._notes.values())
  }

  /**
   * The current viewport settings (scroll and zoom).
   * Returns null until the component sends a state update.
   */
  get viewport(): Readonly<Viewport> | null {
    return this._viewport
  }

  /**
   * The current grid settings.
   * Returns null until the component sends a state update.
   */
  get grid(): Readonly<GridSettings> | null {
    return this._grid
  }

  /** Whether the component is currently connected */
  get connected(): boolean {
    return this._connected
  }

  /** The last config sent to the component */
  get config(): Readonly<PianoRollConfig> {
    return this._config
  }

  /** The last live playhead position sent to the component */
  get livePlayhead(): number {
    return this._livePlayhead
  }

  // ============================================================================
  // Constructor & Setup
  // ============================================================================

  /**
   * Create a new PianoRollWebSocketClient.
   * @param ws - A WebSocket connection (typically from Deno.upgradeWebSocket)
   */
  constructor(ws: WebSocket) {
    this.ws = ws
    this.setupListeners()
  }

  private setupListeners(): void {
    this.ws.onopen = () => {
      this._connected = true
    }

    this.ws.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : ''
      this.handleMessage(data)
    }

    this.ws.onclose = () => {
      this._connected = false
      // Reject all pending requests
      for (const [requestId, { reject, timeout }] of this.pendingRequests) {
        clearTimeout(timeout)
        reject(new Error('WebSocket connection closed'))
        this.pendingRequests.delete(requestId)
      }
      this.onDisconnect?.()
    }

    this.ws.onerror = () => {
      this.onError?.(new Error('WebSocket error'))
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as IncomingMessage

      switch (message.type) {
        case 'notesUpdate': {
          const newNotes = new Map<string, NoteData>()
          for (const [id, note] of message.notes) {
            newNotes.set(id, note)
          }
          this._notes = newNotes
          this.onNotesUpdate?.(this._notes, message.source)
          break
        }

        case 'stateUpdate':
          this._viewport = message.viewport
          this._grid = message.grid
          this.onStateUpdate?.({
            viewport: this._viewport,
            grid: this._grid
          }, message.source)
          break

        case 'playStartPositionResponse': {
          const requestId = message.requestId
          if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, timeout } = this.pendingRequests.get(requestId)!
            clearTimeout(timeout)
            this.pendingRequests.delete(requestId)
            resolve(message.position)
          }
          break
        }

        case 'connectionReady':
          this._connected = true
          this.onConnectionReady?.()
          break
      }
    } catch (error) {
      console.warn('[PianoRollClient] Error handling message:', error)
    }
  }

  private send(message: OutgoingMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[PianoRollClient] Cannot send - WebSocket not open')
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  // ============================================================================
  // Command Methods
  // ============================================================================

  /**
   * Set all notes in the piano roll.
   * Notes without an ID will have one generated.
   * Notes without velocity will default to 100.
   * @param notes - Array of note data to set
   */
  setNotes(notes: NoteDataInput[]): void {
    this.send({ type: 'setNotes', notes })
  }

  /**
   * Set the live playhead position (for real-time playback visualization).
   * @param position - The playhead position in beats
   */
  setLivePlayhead(position: number): void {
    this._livePlayhead = position
    this.send({ type: 'setLivePlayhead', position })
  }

  /**
   * Trigger the piano roll to fit its zoom to show all notes.
   */
  fitZoomToNotes(): void {
    this.send({ type: 'fitZoomToNotes' })
  }

  /**
   * Update piano roll configuration.
   * @param config - Configuration options to update
   */
  setConfig(config: PianoRollConfig): void {
    this._config = { ...this._config, ...config }
    this.send({ type: 'setConfig', ...config })
  }

  // ============================================================================
  // Convenience Methods for Note Manipulation
  // ============================================================================

  /**
   * Add notes to the piano roll (merges with existing notes).
   * @param newNotes - Notes to add
   */
  addNotes(newNotes: NoteDataInput[]): void {
    const allNotes = [...this.notesArray, ...newNotes]
    this.setNotes(allNotes)
  }

  /**
   * Remove notes by their IDs.
   * @param noteIds - IDs of notes to remove
   */
  removeNotes(noteIds: string[]): void {
    const idsToRemove = new Set(noteIds)
    const remainingNotes = this.notesArray.filter(n => !idsToRemove.has(n.id))
    this.setNotes(remainingNotes)
  }

  /**
   * Clear all notes from the piano roll.
   */
  clearNotes(): void {
    this.setNotes([])
  }

  /**
   * Update specific notes by ID.
   * @param updates - Map of note ID to partial note data to update
   */
  updateNotes(updates: Map<string, Partial<NoteDataInput>>): void {
    const updatedNotes = this.notesArray.map(note => {
      const update = updates.get(note.id)
      if (update) {
        return { ...note, ...update }
      }
      return note
    })
    this.setNotes(updatedNotes)
  }

  // ============================================================================
  // Async Request/Response Methods
  // ============================================================================

  /**
   * Request the current play start position and wait for the response.
   * @returns Promise resolving to the play start position in beats
   * @throws Error if the request times out or connection closes
   */
  getPlayStartPosition(): Promise<number> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId()

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('getPlayStartPosition request timed out'))
      }, this.requestTimeout)

      this.pendingRequests.set(requestId, { resolve, reject, timeout })
      this.send({ type: 'getPlayStartPosition', requestId })
    })
  }

  /**
   * Set the timeout for async requests (default: 10000ms).
   * @param ms - Timeout in milliseconds
   */
  setRequestTimeout(ms: number): void {
    this.requestTimeout = ms
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Close the WebSocket connection.
   */
  disconnect(): void {
    this.ws.close()
  }
}
