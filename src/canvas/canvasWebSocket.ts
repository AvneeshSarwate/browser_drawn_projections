import { z } from 'zod'
import type { CanvasStateSnapshot } from './canvasState'

// Schema for arbitrary metadata objects
const MetadataSchema = z.record(z.string(), z.unknown()).optional()

// Render data schemas
const PointSchema = z.object({ x: z.number(), y: z.number() })
const TimedPointSchema = z.object({ x: z.number(), y: z.number(), ts: z.number() })

const FlattenedStrokeSchema = z.object({
  type: z.literal('stroke'),
  id: z.string(),
  points: z.array(TimedPointSchema),
  metadata: MetadataSchema
})

// FlattenedStrokeGroup children can be recursive (stroke or strokeGroup)
// Using lazy for recursive type
const FlattenedStrokeGroupSchema: z.ZodType<{
  type: 'strokeGroup'
  id: string
  children: unknown[]
  metadata?: Record<string, unknown>
}> = z.object({
  type: z.literal('strokeGroup'),
  id: z.string(),
  children: z.lazy(() => z.array(z.union([FlattenedStrokeSchema, FlattenedStrokeGroupSchema]))),
  metadata: MetadataSchema
})

// FreehandRenderData is FlattenedStrokeGroup[] (not mixed array)
const FreehandRenderDataSchema = z.array(FlattenedStrokeGroupSchema)

const FlattenedPolygonSchema = z.object({
  type: z.literal('polygon'),
  id: z.string(),
  points: z.array(PointSchema),
  metadata: MetadataSchema
})

const PolygonRenderDataSchema = z.array(FlattenedPolygonSchema)

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

const CircleRenderDataSchema = z.array(FlattenedCircleSchema)

const CanvasStateSnapshotBaseSchema = z.object({
  freehand: z.object({
    serializedState: z.string(),
    bakedRenderData: FreehandRenderDataSchema,
    bakedGroupMap: z.record(z.string(), z.array(z.number()))
  }),
  polygon: z.object({
    serializedState: z.string(),
    bakedRenderData: PolygonRenderDataSchema
  }),
  circle: z.object({
    serializedState: z.string(),
    bakedRenderData: CircleRenderDataSchema,
    bakedGroupMap: z.record(z.string(), z.array(z.number()))
  })
})

const CanvasStateSnapshotSchema = CanvasStateSnapshotBaseSchema.extend({
  added: CanvasStateSnapshotBaseSchema,
  deleted: CanvasStateSnapshotBaseSchema,
  changed: CanvasStateSnapshotBaseSchema
})

// Incoming message schemas (commands from server to component)
const SetCanvasStateMessageSchema = z.object({
  type: z.literal('setCanvasState'),
  state: z.string()
})

const SetFreehandStateMessageSchema = z.object({
  type: z.literal('setFreehandState'),
  state: z.string()
})

const SetPolygonStateMessageSchema = z.object({
  type: z.literal('setPolygonState'),
  state: z.string()
})

const UndoMessageSchema = z.object({
  type: z.literal('undo')
})

const RedoMessageSchema = z.object({
  type: z.literal('redo')
})

const GetCanvasStateMessageSchema = z.object({
  type: z.literal('getCanvasState'),
  requestId: z.string().optional()
})

const SetConfigMessageSchema = z.object({
  type: z.literal('setConfig'),
  width: z.union([z.number(), z.string()]).optional(),
  height: z.union([z.number(), z.string()]).optional(),
  showTimeline: z.boolean().optional(),
  showVisualizations: z.boolean().optional(),
  showSnapshots: z.boolean().optional(),
  showRescale: z.boolean().optional()
})

const SetToolMessageSchema = z.object({
  type: z.literal('setTool'),
  tool: z.enum(['select', 'freehand', 'polygon', 'circle'])
})

// Union of all incoming message types
export const IncomingMessageSchema = z.discriminatedUnion('type', [
  SetCanvasStateMessageSchema,
  SetFreehandStateMessageSchema,
  SetPolygonStateMessageSchema,
  UndoMessageSchema,
  RedoMessageSchema,
  GetCanvasStateMessageSchema,
  SetConfigMessageSchema,
  SetToolMessageSchema
])

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>

// Outgoing message schemas (events from component to server)
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

export const OutgoingMessageSchema = z.discriminatedUnion('type', [
  StateUpdateMessageSchema,
  CanvasStateResponseSchema,
  ConnectionReadyMessageSchema
])

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>

// WebSocket controller class
export class CanvasWebSocketController {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private address: string

  private handlers: {
    onSetCanvasState?: (state: string) => void
    onSetFreehandState?: (state: string) => void
    onSetPolygonState?: (state: string) => void
    onUndo?: () => void
    onRedo?: () => void
    onGetCanvasState?: (requestId?: string) => void
    onSetConfig?: (config: {
      width?: number | string
      height?: number | string
      showTimeline?: boolean
      showVisualizations?: boolean
      showSnapshots?: boolean
      showRescale?: boolean
    }) => void
    onSetTool?: (tool: 'select' | 'freehand' | 'polygon' | 'circle') => void
  } = {}

  constructor(address: string) {
    this.address = address
  }

  setHandlers(handlers: typeof this.handlers) {
    this.handlers = handlers
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    try {
      this.ws = new WebSocket(this.address)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        this.send({ type: 'connectionReady' })
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = () => {
        this.scheduleReconnect()
      }

      this.ws.onerror = () => {
        // Error will trigger onclose
      }
    } catch {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++
      this.connect()
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts))
  }

  private handleMessage(data: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      console.warn('[CanvasWS] Invalid JSON received:', data)
      return
    }

    const result = IncomingMessageSchema.safeParse(parsed)
    if (!result.success) {
      console.warn('[CanvasWS] Invalid message format:', result.error.format())
      return
    }

    const message = result.data

    switch (message.type) {
      case 'setCanvasState':
        this.handlers.onSetCanvasState?.(message.state)
        break
      case 'setFreehandState':
        this.handlers.onSetFreehandState?.(message.state)
        break
      case 'setPolygonState':
        this.handlers.onSetPolygonState?.(message.state)
        break
      case 'undo':
        this.handlers.onUndo?.()
        break
      case 'redo':
        this.handlers.onRedo?.()
        break
      case 'getCanvasState':
        this.handlers.onGetCanvasState?.(message.requestId)
        break
      case 'setConfig':
        this.handlers.onSetConfig?.({
          width: message.width,
          height: message.height,
          showTimeline: message.showTimeline,
          showVisualizations: message.showVisualizations,
          showSnapshots: message.showSnapshots,
          showRescale: message.showRescale
        })
        break
      case 'setTool':
        this.handlers.onSetTool?.(message.tool)
        break
    }
  }

  send(message: OutgoingMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return
    }

    // Validate outgoing message
    const result = OutgoingMessageSchema.safeParse(message)
    if (!result.success) {
      console.warn('[CanvasWS] Invalid outgoing message:', result.error.format())
      return
    }

    this.ws.send(JSON.stringify(message))
  }

  sendStateUpdate(snapshot: CanvasStateSnapshot) {
    this.send({
      type: 'stateUpdate',
      snapshot
    })
  }

  sendCanvasStateResponse(state: string, requestId?: string) {
    this.send({
      type: 'canvasStateResponse',
      state,
      requestId
    })
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.onclose = null // Prevent reconnect
      this.ws.close()
      this.ws = null
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
