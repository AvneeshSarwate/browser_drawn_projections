import { z } from 'zod'
import type { TrackType, TrackElement, NumberElement, EnumElement, FuncElementData, FuncElement } from './types'

// ============================================================================
// Shared Schemas for Track Data
// ============================================================================

const FuncElementSchema = z.object({
  funcName: z.string(),
  args: z.array(z.unknown())
})

const NumberElementSchema = z.object({
  id: z.string(),
  time: z.number(),
  value: z.number()
})

const EnumElementSchema = z.object({
  id: z.string(),
  time: z.number(),
  value: z.string()
})

const FuncElementDataSchema = z.object({
  id: z.string(),
  time: z.number(),
  value: FuncElementSchema
})

// Track definition for WebSocket (no callbacks - those are registered on Deno side)
const TrackDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  fieldType: z.enum(['number', 'enum', 'func']),
  elementData: z.array(z.union([NumberElementSchema, EnumElementSchema, FuncElementDataSchema])),
  low: z.number(),
  high: z.number()
})

export type TrackData = z.infer<typeof TrackDataSchema>

// ============================================================================
// Incoming Message Schemas (from Deno to component)
// ============================================================================

const SetTracksMessageSchema = z.object({
  type: z.literal('setTracks'),
  tracks: z.array(TrackDataSchema),
  trackOrder: z.array(z.string())
})

const ScrubToTimeMessageSchema = z.object({
  type: z.literal('scrubToTime'),
  time: z.number().nonnegative()
})

const SetLivePlayheadMessageSchema = z.object({
  type: z.literal('setLivePlayhead'),
  position: z.number().nonnegative()
})

const SetConfigMessageSchema = z.object({
  type: z.literal('setConfig'),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  interactive: z.boolean().optional(),
  duration: z.number().positive().optional()
})

const GetStateMessageSchema = z.object({
  type: z.literal('getState'),
  requestId: z.string().optional()
})

export const IncomingMessageSchema = z.discriminatedUnion('type', [
  SetTracksMessageSchema,
  ScrubToTimeMessageSchema,
  SetLivePlayheadMessageSchema,
  SetConfigMessageSchema,
  GetStateMessageSchema
])

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>

// ============================================================================
// Outgoing Message Schemas (from component to Deno)
// ============================================================================

export type UpdateSource = 'tracks' | 'time' | 'window' | 'other'

const TracksUpdateMessageSchema = z.object({
  type: z.literal('tracksUpdate'),
  tracks: z.array(TrackDataSchema),
  trackOrder: z.array(z.string()),
  source: z.enum(['tracks', 'time', 'window', 'other']).optional()
})

const StateUpdateMessageSchema = z.object({
  type: z.literal('stateUpdate'),
  currentTime: z.number(),
  duration: z.number(),
  windowStart: z.number(),
  windowEnd: z.number(),
  source: z.enum(['tracks', 'time', 'window', 'other']).optional()
})

const StateResponseSchema = z.object({
  type: z.literal('stateResponse'),
  currentTime: z.number(),
  duration: z.number(),
  windowStart: z.number(),
  windowEnd: z.number(),
  tracks: z.array(TrackDataSchema),
  trackOrder: z.array(z.string()),
  requestId: z.string().optional()
})

const ConnectionReadyMessageSchema = z.object({
  type: z.literal('connectionReady')
})

export const OutgoingMessageSchema = z.discriminatedUnion('type', [
  TracksUpdateMessageSchema,
  StateUpdateMessageSchema,
  StateResponseSchema,
  ConnectionReadyMessageSchema
])

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>

// ============================================================================
// WebSocket Controller Class
// ============================================================================

export class AnimationEditorWebSocketController {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private address: string

  private handlers: {
    onSetTracks?: (tracks: TrackData[], trackOrder: string[]) => void
    onScrubToTime?: (time: number) => void
    onSetLivePlayhead?: (position: number) => void
    onSetConfig?: (config: { width?: number; height?: number; interactive?: boolean; duration?: number }) => void
    onGetState?: (requestId?: string) => void
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
      console.warn('[AnimationEditorWS] Invalid JSON received:', data)
      return
    }

    const result = IncomingMessageSchema.safeParse(parsed)
    if (!result.success) {
      console.warn('[AnimationEditorWS] Invalid message format:', result.error.format())
      return
    }

    const message = result.data

    switch (message.type) {
      case 'setTracks':
        this.handlers.onSetTracks?.(message.tracks, message.trackOrder)
        break
      case 'scrubToTime':
        this.handlers.onScrubToTime?.(message.time)
        break
      case 'setLivePlayhead':
        this.handlers.onSetLivePlayhead?.(message.position)
        break
      case 'setConfig':
        this.handlers.onSetConfig?.({
          width: message.width,
          height: message.height,
          interactive: message.interactive,
          duration: message.duration
        })
        break
      case 'getState':
        this.handlers.onGetState?.(message.requestId)
        break
    }
  }

  send(message: OutgoingMessage) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return
    }

    const result = OutgoingMessageSchema.safeParse(message)
    if (!result.success) {
      console.warn('[AnimationEditorWS] Invalid outgoing message:', result.error.format())
      return
    }

    this.ws.send(JSON.stringify(message))
  }

  sendTracksUpdate(tracks: TrackData[], trackOrder: string[], source?: UpdateSource) {
    this.send({
      type: 'tracksUpdate',
      tracks,
      trackOrder,
      source
    })
  }

  sendStateUpdate(
    currentTime: number,
    duration: number,
    windowStart: number,
    windowEnd: number,
    source?: UpdateSource
  ) {
    this.send({
      type: 'stateUpdate',
      currentTime,
      duration,
      windowStart,
      windowEnd,
      source
    })
  }

  sendStateResponse(
    currentTime: number,
    duration: number,
    windowStart: number,
    windowEnd: number,
    tracks: TrackData[],
    trackOrder: string[],
    requestId?: string
  ) {
    this.send({
      type: 'stateResponse',
      currentTime,
      duration,
      windowStart,
      windowEnd,
      tracks,
      trackOrder,
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

// ============================================================================
// Helper: Convert Core state to TrackData array
// ============================================================================

export function coreToTrackData(
  tracksById: Map<string, { id: string; def: { name: string; fieldType: TrackType }; elementData: TrackElement[]; low: number; high: number }>,
  orderedTrackIds: string[]
): { tracks: TrackData[]; trackOrder: string[] } {
  const tracks: TrackData[] = []

  for (const id of orderedTrackIds) {
    const track = tracksById.get(id)
    if (!track) continue

    tracks.push({
      id: track.id,
      name: track.def.name,
      fieldType: track.def.fieldType,
      elementData: track.elementData.map(elem => {
        if (track.def.fieldType === 'number') {
          const e = elem as NumberElement
          return { id: e.id, time: e.time, value: e.value }
        } else if (track.def.fieldType === 'enum') {
          const e = elem as EnumElement
          return { id: e.id, time: e.time, value: e.value }
        } else {
          const e = elem as FuncElementData
          return { id: e.id, time: e.time, value: e.value }
        }
      }),
      low: track.low,
      high: track.high
    })
  }

  return { tracks, trackOrder: orderedTrackIds }
}
