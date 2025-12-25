/**
 * Canvas WebSocket Client for server-side control of Canvas components.
 *
 * This client is designed for use in Deno Jupyter notebooks where:
 * - The notebook hosts a WebSocket server
 * - Canvas components run in iframes and connect as WebSocket clients
 * - This client provides a clean API to send commands and receive state updates
 *
 * Usage:
 * ```typescript
 * const server = Deno.serve({ port: 8080 }, (req) => {
 *   if (req.headers.get("upgrade") === "websocket") {
 *     const { socket, response } = Deno.upgradeWebSocket(req);
 *     const client = new CanvasWebSocketClient(socket);
 *     // Use client to control the canvas
 *     return response;
 *   }
 * });
 * ```
 */

import { z } from 'zod'

// ============================================================================
// Type Definitions (readonly versions for server-side state)
// ============================================================================

export interface Point {
  readonly x: number
  readonly y: number
}

export interface TimedPoint extends Point {
  readonly ts: number
}

export interface FlattenedStroke {
  readonly type: 'stroke'
  readonly id: string
  readonly points: ReadonlyArray<TimedPoint>
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface FlattenedStrokeGroup {
  readonly type: 'strokeGroup'
  readonly id: string
  readonly children: ReadonlyArray<FlattenedStroke | FlattenedStrokeGroup>
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface FlattenedPolygon {
  readonly type: 'polygon'
  readonly id: string
  readonly points: ReadonlyArray<Point>
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface FlattenedCircle {
  readonly type: 'circle'
  readonly id: string
  readonly center: Point
  readonly r?: number
  readonly rx: number
  readonly ry: number
  readonly rotation: number
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface CanvasStateSnapshotBase {
  readonly freehand: {
    readonly serializedState: string
    readonly bakedRenderData: ReadonlyArray<FlattenedStrokeGroup>
    readonly bakedGroupMap: Readonly<Record<string, ReadonlyArray<number>>>
  }
  readonly polygon: {
    readonly serializedState: string
    readonly bakedRenderData: ReadonlyArray<FlattenedPolygon>
  }
  readonly circle: {
    readonly serializedState: string
    readonly bakedRenderData: ReadonlyArray<FlattenedCircle>
    readonly bakedGroupMap: Readonly<Record<string, ReadonlyArray<number>>>
  }
}

export interface CanvasStateSnapshot extends CanvasStateSnapshotBase {
  readonly added: CanvasStateSnapshotBase
  readonly deleted: CanvasStateSnapshotBase
  readonly changed: CanvasStateSnapshotBase
}

export type CanvasTool = 'select' | 'freehand' | 'polygon' | 'circle'

export interface CanvasConfig {
  readonly width?: number | string
  readonly height?: number | string
  readonly showTimeline?: boolean
  readonly showVisualizations?: boolean
  readonly showSnapshots?: boolean
  readonly showRescale?: boolean
}

// ============================================================================
// Message Schemas (from server's perspective)
// ============================================================================

const MetadataSchema = z.record(z.string(), z.unknown()).optional()
const PointSchema = z.object({ x: z.number(), y: z.number() })
const TimedPointSchema = z.object({ x: z.number(), y: z.number(), ts: z.number() })

const FlattenedStrokeSchema = z.object({
  type: z.literal('stroke'),
  id: z.string(),
  points: z.array(TimedPointSchema),
  metadata: MetadataSchema
})

const FlattenedStrokeGroupSchema: z.ZodType<FlattenedStrokeGroup> = z.object({
  type: z.literal('strokeGroup'),
  id: z.string(),
  children: z.lazy(() => z.array(z.union([FlattenedStrokeSchema, FlattenedStrokeGroupSchema]))),
  metadata: MetadataSchema
}) as z.ZodType<FlattenedStrokeGroup>

const FlattenedPolygonSchema = z.object({
  type: z.literal('polygon'),
  id: z.string(),
  points: z.array(PointSchema),
  metadata: MetadataSchema
})

const FlattenedCircleSchema = z.object({
  type: z.literal('circle'),
  id: z.string(),
  center: PointSchema,
  r: z.number().optional(),
  rx: z.number(),
  ry: z.number(),
  rotation: z.number(),
  metadata: MetadataSchema
})

const CanvasStateSnapshotBaseSchema = z.object({
  freehand: z.object({
    serializedState: z.string(),
    bakedRenderData: z.array(FlattenedStrokeGroupSchema),
    bakedGroupMap: z.record(z.string(), z.array(z.number()))
  }),
  polygon: z.object({
    serializedState: z.string(),
    bakedRenderData: z.array(FlattenedPolygonSchema)
  }),
  circle: z.object({
    serializedState: z.string(),
    bakedRenderData: z.array(FlattenedCircleSchema),
    bakedGroupMap: z.record(z.string(), z.array(z.number()))
  })
})

const CanvasStateSnapshotSchema = CanvasStateSnapshotBaseSchema.extend({
  added: CanvasStateSnapshotBaseSchema,
  deleted: CanvasStateSnapshotBaseSchema,
  changed: CanvasStateSnapshotBaseSchema
})

// Messages server receives FROM component
const StateUpdateMessageSchema = z.object({
  type: z.literal('stateUpdate'),
  snapshot: CanvasStateSnapshotSchema
})

const CanvasStateResponseSchema = z.object({
  type: z.literal('canvasStateResponse'),
  state: z.string(),
  requestId: z.string().optional()
})

const ConnectionReadyMessageSchema = z.object({
  type: z.literal('connectionReady')
})

const IncomingMessageSchema = z.discriminatedUnion('type', [
  StateUpdateMessageSchema,
  CanvasStateResponseSchema,
  ConnectionReadyMessageSchema
])

type IncomingMessage = z.infer<typeof IncomingMessageSchema>

// Messages server sends TO component
interface SetCanvasStateMessage {
  type: 'setCanvasState'
  state: string
}

interface SetFreehandStateMessage {
  type: 'setFreehandState'
  state: string
}

interface SetPolygonStateMessage {
  type: 'setPolygonState'
  state: string
}

interface UndoMessage {
  type: 'undo'
}

interface RedoMessage {
  type: 'redo'
}

interface GetCanvasStateMessage {
  type: 'getCanvasState'
  requestId?: string
}

interface SetConfigMessage {
  type: 'setConfig'
  width?: number | string
  height?: number | string
  showTimeline?: boolean
  showVisualizations?: boolean
  showSnapshots?: boolean
  showRescale?: boolean
}

interface SetToolMessage {
  type: 'setTool'
  tool: CanvasTool
}

type OutgoingMessage =
  | SetCanvasStateMessage
  | SetFreehandStateMessage
  | SetPolygonStateMessage
  | UndoMessage
  | RedoMessage
  | GetCanvasStateMessage
  | SetConfigMessage
  | SetToolMessage

// ============================================================================
// WebSocket Client Class
// ============================================================================

/**
 * Server-side client for controlling a Canvas component via WebSocket.
 *
 * Provides:
 * - Command methods to send instructions to the component
 * - Readonly state that updates when the component sends updates
 * - Event callbacks for component messages
 * - Async request/response pattern for getCanvasState
 */
export class CanvasWebSocketClient {
  private ws: WebSocket
  private pendingRequests = new Map<string, {
    resolve: (value: string) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  private requestTimeout = 10000 // 10 seconds

  // Internal mutable state
  private _lastSnapshot: CanvasStateSnapshot | null = null
  private _connected = false
  private _config: CanvasConfig = {}
  private _currentTool: CanvasTool = 'select'

  // ============================================================================
  // Event Callbacks
  // ============================================================================

  /** Called when the component sends a state update */
  onStateUpdate?: (snapshot: Readonly<CanvasStateSnapshot>) => void

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
   * The last canvas state snapshot received from the component.
   * This is readonly - mutations will cause TypeScript errors.
   */
  get lastSnapshot(): Readonly<CanvasStateSnapshot> | null {
    return this._lastSnapshot
  }

  /** Whether the component is currently connected */
  get connected(): boolean {
    return this._connected
  }

  /** The last config sent to the component */
  get config(): Readonly<CanvasConfig> {
    return this._config
  }

  /** The current tool set on the component */
  get currentTool(): CanvasTool {
    return this._currentTool
  }

  // ============================================================================
  // Constructor & Setup
  // ============================================================================

  /**
   * Create a new CanvasWebSocketClient.
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
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      console.warn('[CanvasClient] Invalid JSON received:', data)
      return
    }

    const result = IncomingMessageSchema.safeParse(parsed)
    if (!result.success) {
      console.warn('[CanvasClient] Invalid message format:', result.error.format())
      return
    }

    const message: IncomingMessage = result.data

    switch (message.type) {
      case 'stateUpdate':
        this._lastSnapshot = message.snapshot as CanvasStateSnapshot
        this.onStateUpdate?.(this._lastSnapshot)
        break

      case 'canvasStateResponse': {
        const requestId = message.requestId
        if (requestId && this.pendingRequests.has(requestId)) {
          const { resolve, timeout } = this.pendingRequests.get(requestId)!
          clearTimeout(timeout)
          this.pendingRequests.delete(requestId)
          resolve(message.state)
        }
        break
      }

      case 'connectionReady':
        this._connected = true
        this.onConnectionReady?.()
        break
    }
  }

  private send(message: OutgoingMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[CanvasClient] Cannot send - WebSocket not open')
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  // ============================================================================
  // Command Methods
  // ============================================================================

  /**
   * Set the full canvas state from a serialized string.
   * @param state - Serialized canvas state
   */
  setCanvasState(state: string): void {
    this.send({ type: 'setCanvasState', state })
  }

  /**
   * Set only the freehand drawing state.
   * @param state - Serialized freehand state
   */
  setFreehandState(state: string): void {
    this.send({ type: 'setFreehandState', state })
  }

  /**
   * Set only the polygon state.
   * @param state - Serialized polygon state
   */
  setPolygonState(state: string): void {
    this.send({ type: 'setPolygonState', state })
  }

  /**
   * Trigger an undo action on the canvas.
   */
  undo(): void {
    this.send({ type: 'undo' })
  }

  /**
   * Trigger a redo action on the canvas.
   */
  redo(): void {
    this.send({ type: 'redo' })
  }

  /**
   * Set the active drawing tool.
   * @param tool - The tool to activate
   */
  setTool(tool: CanvasTool): void {
    this._currentTool = tool
    this.send({ type: 'setTool', tool })
  }

  /**
   * Update canvas configuration.
   * @param config - Configuration options to update
   */
  setConfig(config: CanvasConfig): void {
    this._config = { ...this._config, ...config }
    this.send({ type: 'setConfig', ...config })
  }

  // ============================================================================
  // Async Request/Response Methods
  // ============================================================================

  /**
   * Request the current canvas state and wait for the response.
   * @returns Promise resolving to the serialized canvas state
   * @throws Error if the request times out or connection closes
   */
  getCanvasState(): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId()

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error('getCanvasState request timed out'))
      }, this.requestTimeout)

      this.pendingRequests.set(requestId, { resolve, reject, timeout })
      this.send({ type: 'getCanvasState', requestId })
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
