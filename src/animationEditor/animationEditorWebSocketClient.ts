/**
 * Animation Editor WebSocket Client for server-side control of Animation Editor components.
 *
 * This client is designed for use in Deno Jupyter notebooks where:
 * - The notebook hosts a WebSocket server
 * - Animation Editor components run in iframes and connect as WebSocket clients
 * - This client provides a clean API to send commands and receive state updates
 *
 * Usage:
 * ```typescript
 * const server = Deno.serve({ port: 8080 }, (req) => {
 *   if (req.headers.get("upgrade") === "websocket") {
 *     const { socket, response } = Deno.upgradeWebSocket(req);
 *     const client = new AnimationEditorWebSocketClient(socket);
 *     // Use client to control the animation editor
 *     return response;
 *   }
 * });
 * ```
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type TrackType = 'number' | 'enum' | 'func'

export interface FuncElement {
  readonly funcName: string
  readonly args: readonly unknown[]
}

export interface NumberElement {
  readonly id: string
  readonly time: number
  readonly value: number
}

export interface EnumElement {
  readonly id: string
  readonly time: number
  readonly value: string
}

export interface FuncElementData {
  readonly id: string
  readonly time: number
  readonly value: FuncElement
}

export type TrackElement = NumberElement | EnumElement | FuncElementData

export interface TrackData {
  readonly id: string
  readonly name: string
  readonly fieldType: TrackType
  readonly elementData: readonly TrackElement[]
  readonly low: number
  readonly high: number
}

export interface AnimationEditorState {
  readonly currentTime: number
  readonly duration: number
  readonly windowStart: number
  readonly windowEnd: number
}

export interface AnimationEditorConfig {
  readonly width?: number
  readonly height?: number
  readonly interactive?: boolean
  readonly duration?: number
}

export type UpdateSource = 'tracks' | 'time' | 'window' | 'other'

// ============================================================================
// Input Types (for creating/updating tracks)
// ============================================================================

export interface NumberDatumInput {
  readonly time: number
  readonly value: number
}

export interface EnumDatumInput {
  readonly time: number
  readonly value: string
}

export interface FuncDatumInput {
  readonly time: number
  readonly funcName: string
  readonly args?: readonly unknown[]
}

export interface TrackInput {
  readonly name: string
  readonly fieldType: TrackType
  readonly data: readonly (NumberDatumInput | EnumDatumInput | FuncDatumInput)[]
  readonly low?: number
  readonly high?: number
}

// ============================================================================
// Internal Message Types
// ============================================================================

interface TracksUpdateMessage {
  type: 'tracksUpdate'
  tracks: TrackData[]
  trackOrder: string[]
  source?: UpdateSource
}

interface StateUpdateMessage {
  type: 'stateUpdate'
  currentTime: number
  duration: number
  windowStart: number
  windowEnd: number
  source?: UpdateSource
}

interface StateResponseMessage {
  type: 'stateResponse'
  currentTime: number
  duration: number
  windowStart: number
  windowEnd: number
  tracks: TrackData[]
  trackOrder: string[]
  requestId?: string
}

interface ConnectionReadyMessage {
  type: 'connectionReady'
}

type IncomingMessage =
  | TracksUpdateMessage
  | StateUpdateMessage
  | StateResponseMessage
  | ConnectionReadyMessage

interface SetTracksMessage {
  type: 'setTracks'
  tracks: TrackData[]
  trackOrder: string[]
}

interface ScrubToTimeMessage {
  type: 'scrubToTime'
  time: number
}

interface SetLivePlayheadMessage {
  type: 'setLivePlayhead'
  position: number
}

interface SetConfigMessage {
  type: 'setConfig'
  width?: number
  height?: number
  interactive?: boolean
  duration?: number
}

interface GetStateMessage {
  type: 'getState'
  requestId?: string
}

type OutgoingMessage =
  | SetTracksMessage
  | ScrubToTimeMessage
  | SetLivePlayheadMessage
  | SetConfigMessage
  | GetStateMessage

// ============================================================================
// Callback Registration Types
// ============================================================================

export interface TrackCallbacks {
  updateNumber?: (trackName: string, value: number) => void
  updateEnum?: (trackName: string, value: string) => void
  updateFunc?: (trackName: string, funcName: string, ...args: unknown[]) => void
}

// ============================================================================
// WebSocket Client Class
// ============================================================================

/**
 * Server-side client for controlling an Animation Editor component via WebSocket.
 *
 * Provides:
 * - Command methods to send instructions to the component
 * - Readonly state that updates when the component sends updates
 * - Event callbacks for component messages
 * - Track callback registration for evaluation
 */
export class AnimationEditorWebSocketClient {
  private ws: WebSocket
  private pendingRequests = new Map<string, {
    resolve: (value: { state: AnimationEditorState; tracks: TrackData[]; trackOrder: string[] }) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  private requestTimeout = 10000 // 10 seconds

  // Internal mutable state
  private _tracks: readonly TrackData[] = []
  private _trackOrder: readonly string[] = []
  private _state: AnimationEditorState | null = null
  private _connected = false
  private _config: AnimationEditorConfig = {}
  private _livePlayhead = 0

  // Track callbacks for evaluation
  private _trackCallbacks: TrackCallbacks = {}

  // ============================================================================
  // Event Callbacks
  // ============================================================================

  /** Called when the component sends a tracks update */
  onTracksUpdate?: (tracks: readonly TrackData[], trackOrder: readonly string[], source?: UpdateSource) => void

  /** Called when the component sends a state update */
  onStateUpdate?: (state: Readonly<AnimationEditorState>, source?: UpdateSource) => void

  /** Called when the component signals it's ready */
  onConnectionReady?: () => void

  /** Called when the WebSocket connection closes */
  onDisconnect?: () => void

  /** Called when there's an error */
  onError?: (error: Error) => void

  // ============================================================================
  // Readonly State Accessors
  // ============================================================================

  /** The current tracks in the animation editor */
  get tracks(): readonly TrackData[] {
    return this._tracks
  }

  /** The current track order */
  get trackOrder(): readonly string[] {
    return this._trackOrder
  }

  /** The current state (time, duration, window) */
  get state(): Readonly<AnimationEditorState> | null {
    return this._state
  }

  /** Whether the component is currently connected */
  get connected(): boolean {
    return this._connected
  }

  /** The last config sent to the component */
  get config(): Readonly<AnimationEditorConfig> {
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
   * Create a new AnimationEditorWebSocketClient.
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
        case 'tracksUpdate':
          this._tracks = message.tracks
          this._trackOrder = message.trackOrder
          this.onTracksUpdate?.(this._tracks, this._trackOrder, message.source)
          // Fire registered callbacks when tracks update
          this.fireCallbacksFromTracks()
          break

        case 'stateUpdate':
          this._state = {
            currentTime: message.currentTime,
            duration: message.duration,
            windowStart: message.windowStart,
            windowEnd: message.windowEnd
          }
          this.onStateUpdate?.(this._state, message.source)
          break

        case 'stateResponse': {
          const requestId = message.requestId
          if (requestId && this.pendingRequests.has(requestId)) {
            const { resolve, timeout } = this.pendingRequests.get(requestId)!
            clearTimeout(timeout)
            this.pendingRequests.delete(requestId)
            resolve({
              state: {
                currentTime: message.currentTime,
                duration: message.duration,
                windowStart: message.windowStart,
                windowEnd: message.windowEnd
              },
              tracks: message.tracks,
              trackOrder: message.trackOrder
            })
          }
          break
        }

        case 'connectionReady':
          this._connected = true
          this.onConnectionReady?.()
          break
      }
    } catch (error) {
      console.warn('[AnimationEditorClient] Error handling message:', error)
    }
  }

  private send(message: OutgoingMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[AnimationEditorClient] Cannot send - WebSocket not open')
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }

  // ============================================================================
  // Track Callback Registration
  // ============================================================================

  /**
   * Register callbacks that fire when track data is received.
   * These callbacks are fired on the Deno side, not in the browser component.
   */
  setTrackCallbacks(callbacks: TrackCallbacks): void {
    this._trackCallbacks = callbacks
  }

  /**
   * Fire callbacks for all tracks based on current state time.
   * Called internally when tracks update, or can be called manually.
   */
  fireCallbacksFromTracks(): void {
    if (!this._state) return
    const t = this._state.currentTime

    for (const track of this._tracks) {
      this.evaluateTrackAt(track, t)
    }
  }

  /**
   * Evaluate a track at a specific time and fire the appropriate callback.
   */
  private evaluateTrackAt(track: TrackData, t: number): void {
    const elements = track.elementData
    if (elements.length === 0) return

    switch (track.fieldType) {
      case 'number': {
        if (!this._trackCallbacks.updateNumber) return
        const value = this.interpolateNumber(elements as NumberElement[], t, track.low, track.high)
        this._trackCallbacks.updateNumber(track.name, value)
        break
      }
      case 'enum': {
        if (!this._trackCallbacks.updateEnum) return
        const value = this.stepValue(elements as EnumElement[], t)
        if (value !== undefined) {
          this._trackCallbacks.updateEnum(track.name, value)
        }
        break
      }
      case 'func': {
        // Func tracks are evaluated differently - fire all funcs in range
        // For now, just get the current step value
        if (!this._trackCallbacks.updateFunc) return
        const elem = this.stepFuncValue(elements as FuncElementData[], t)
        if (elem) {
          this._trackCallbacks.updateFunc(track.name, elem.funcName, ...elem.args)
        }
        break
      }
    }
  }

  private interpolateNumber(elements: readonly NumberElement[], t: number, low: number, high: number): number {
    const sorted = [...elements].sort((a, b) => a.time - b.time)
    if (sorted.length === 0) return low

    // Find surrounding elements
    let i1 = -1
    let i2 = sorted.length
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].time <= t) i1 = i
      if (sorted[i].time > t && i2 === sorted.length) i2 = i
    }

    if (i1 === -1) return sorted[0].value
    if (i2 >= sorted.length) return sorted[i1].value

    // Interpolate
    const t1 = sorted[i1].time
    const t2 = sorted[i2].time
    const v1 = sorted[i1].value
    const v2 = sorted[i2].value
    const alpha = (t - t1) / (t2 - t1)
    const value = v1 + (v2 - v1) * alpha
    return Math.max(low, Math.min(high, value))
  }

  private stepValue(elements: readonly EnumElement[], t: number): string | undefined {
    const sorted = [...elements].sort((a, b) => a.time - b.time)
    if (sorted.length === 0) return undefined

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].time <= t) return sorted[i].value
    }
    return sorted[0].value
  }

  private stepFuncValue(elements: readonly FuncElementData[], t: number): FuncElement | undefined {
    const sorted = [...elements].sort((a, b) => a.time - b.time)
    if (sorted.length === 0) return undefined

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].time <= t) return sorted[i].value
    }
    return sorted[0].value
  }

  // ============================================================================
  // Command Methods
  // ============================================================================

  /**
   * Set all tracks in the animation editor.
   */
  setTracks(tracks: TrackData[], trackOrder?: string[]): void {
    const order = trackOrder ?? tracks.map(t => t.id)
    this.send({ type: 'setTracks', tracks, trackOrder: order })
  }

  /**
   * Set tracks from input definitions (convenience method).
   * Generates IDs automatically.
   */
  setTracksFromInput(trackInputs: TrackInput[]): void {
    let trackIdCounter = 0
    let elemIdCounter = 0

    const tracks: TrackData[] = trackInputs.map(input => {
      const trackId = `track_${++trackIdCounter}`
      const elementData: TrackElement[] = input.data.map(datum => {
        const elemId = `elem_${++elemIdCounter}`
        if (input.fieldType === 'number') {
          const d = datum as NumberDatumInput
          return { id: elemId, time: d.time, value: d.value }
        } else if (input.fieldType === 'enum') {
          const d = datum as EnumDatumInput
          return { id: elemId, time: d.time, value: d.value }
        } else {
          const d = datum as FuncDatumInput
          return { id: elemId, time: d.time, value: { funcName: d.funcName, args: d.args ?? [] } }
        }
      })

      return {
        id: trackId,
        name: input.name,
        fieldType: input.fieldType,
        elementData,
        low: input.low ?? 0,
        high: input.high ?? 1
      }
    })

    this.setTracks(tracks)
  }

  /**
   * Scrub to a specific time (triggers callbacks in component).
   */
  scrubToTime(time: number): void {
    this.send({ type: 'scrubToTime', time })
  }

  /**
   * Set the live playhead position (for visualization).
   */
  setLivePlayhead(position: number): void {
    this._livePlayhead = position
    this.send({ type: 'setLivePlayhead', position })
  }

  /**
   * Update animation editor configuration.
   */
  setConfig(config: AnimationEditorConfig): void {
    this._config = { ...this._config, ...config }
    this.send({ type: 'setConfig', ...config })
  }

  // ============================================================================
  // Async Request/Response Methods
  // ============================================================================

  /**
   * Request the current state and tracks, and wait for the response.
   */
  getState(): Promise<{ state: AnimationEditorState; tracks: TrackData[]; trackOrder: string[] }> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId()

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('getState request timed out'))
      }, this.requestTimeout)

      this.pendingRequests.set(requestId, { resolve, reject, timeout })
      this.send({ type: 'getState', requestId })
    })
  }

  /**
   * Set the timeout for async requests (default: 10000ms).
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
