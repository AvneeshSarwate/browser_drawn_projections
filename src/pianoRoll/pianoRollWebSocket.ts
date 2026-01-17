import { z } from 'zod'
import type { NoteData, NoteDataInput, PianoRollState, ExternalChangeSource } from './pianoRollState'

const UpdateSourceSchema = z.enum([
  'notes',
  'selection',
  'playhead',
  'viewport',
  'grid',
  'other'
])
export type UpdateSource = ExternalChangeSource

// Schema for arbitrary metadata objects
const MetadataSchema = z.record(z.string(), z.unknown()).optional()
const MpePitchPointSchema = z.object({
  time: z.number(),
  pitchOffset: z.number()
})
const MpePitchSchema = z.object({
  points: z.array(MpePitchPointSchema)
}).optional()

// Base note schema matching NoteDataInput (incoming notes may lack id/velocity)
const NoteDataInputSchema = z.object({
  id: z.string().optional(),
  pitch: z.number().int().min(0).max(127),
  position: z.number(),
  duration: z.number().positive(),
  velocity: z.number().int().min(0).max(127).optional(),
  mpePitch: MpePitchSchema,
  metadata: MetadataSchema
})

// Full note schema matching NoteData
const NoteDataSchema = z.object({
  id: z.string(),
  pitch: z.number().int().min(0).max(127),
  position: z.number(),
  duration: z.number().positive(),
  velocity: z.number().int().min(0).max(127),
  mpePitch: MpePitchSchema,
  metadata: MetadataSchema
})

// Incoming message schemas (commands from server to component)
const SetNotesMessageSchema = z.object({
  type: z.literal('setNotes'),
  notes: z.array(NoteDataInputSchema)
})

const SetLivePlayheadMessageSchema = z.object({
  type: z.literal('setLivePlayhead'),
  position: z.number().nonnegative()
})

const FitZoomToNotesMessageSchema = z.object({
  type: z.literal('fitZoomToNotes')
})

const GetPlayStartPositionMessageSchema = z.object({
  type: z.literal('getPlayStartPosition'),
  requestId: z.string().optional()
})

const SetConfigMessageSchema = z.object({
  type: z.literal('setConfig'),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  interactive: z.boolean().optional(),
  showControlPanel: z.boolean().optional()
})

// Union of all incoming message types
export const IncomingMessageSchema = z.discriminatedUnion('type', [
  SetNotesMessageSchema,
  SetLivePlayheadMessageSchema,
  FitZoomToNotesMessageSchema,
  GetPlayStartPositionMessageSchema,
  SetConfigMessageSchema
])

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>

// Outgoing message schemas (events from component to server)
const NotesUpdateMessageSchema = z.object({
  type: z.literal('notesUpdate'),
  notes: z.array(z.tuple([z.string(), NoteDataSchema])),
  source: UpdateSourceSchema.optional()
})

const StateUpdateMessageSchema = z.object({
  type: z.literal('stateUpdate'),
  viewport: z.object({
    scrollX: z.number(),
    scrollY: z.number(),
    zoomX: z.number(),
    zoomY: z.number()
  }),
  grid: z.object({
    quarterNoteWidth: z.number(),
    noteHeight: z.number(),
    subdivision: z.number()
  }),
  source: UpdateSourceSchema.optional()
})

const PlayStartPositionResponseSchema = z.object({
  type: z.literal('playStartPositionResponse'),
  position: z.number(),
  requestId: z.string().optional()
})

const ConnectionReadyMessageSchema = z.object({
  type: z.literal('connectionReady')
})

export const OutgoingMessageSchema = z.discriminatedUnion('type', [
  NotesUpdateMessageSchema,
  StateUpdateMessageSchema,
  PlayStartPositionResponseSchema,
  ConnectionReadyMessageSchema
])

export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>

// WebSocket controller class
export class PianoRollWebSocketController {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private address: string

  private handlers: {
    onSetNotes?: (notes: NoteDataInput[]) => void
    onSetLivePlayhead?: (position: number) => void
    onFitZoomToNotes?: () => void
    onGetPlayStartPosition?: (requestId?: string) => void
    onSetConfig?: (config: { width?: number; height?: number; interactive?: boolean; showControlPanel?: boolean }) => void
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
      console.warn('[PianoRollWS] Invalid JSON received:', data)
      return
    }

    const result = IncomingMessageSchema.safeParse(parsed)
    if (!result.success) {
      console.warn('[PianoRollWS] Invalid message format:', result.error.format())
      return
    }

    const message = result.data

    switch (message.type) {
      case 'setNotes':
        this.handlers.onSetNotes?.(message.notes)
        break
      case 'setLivePlayhead':
        this.handlers.onSetLivePlayhead?.(message.position)
        break
      case 'fitZoomToNotes':
        this.handlers.onFitZoomToNotes?.()
        break
      case 'getPlayStartPosition':
        this.handlers.onGetPlayStartPosition?.(message.requestId)
        break
      case 'setConfig':
        this.handlers.onSetConfig?.({
          width: message.width,
          height: message.height,
          interactive: message.interactive,
          showControlPanel: message.showControlPanel
        })
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
      console.warn('[PianoRollWS] Invalid outgoing message:', result.error.format())
      return
    }

    this.ws.send(JSON.stringify(message))
  }

  sendNotesUpdate(notes: Array<[string, NoteData]>, source?: UpdateSource) {
    this.send({
      type: 'notesUpdate',
      notes,
      source
    })
  }

  sendStateUpdate(state: PianoRollState, source?: UpdateSource) {
    this.send({
      type: 'stateUpdate',
      viewport: {
        scrollX: state.viewport.scrollX,
        scrollY: state.viewport.scrollY,
        zoomX: state.viewport.zoomX,
        zoomY: state.viewport.zoomY
      },
      grid: {
        quarterNoteWidth: state.grid.quarterNoteWidth,
        noteHeight: state.grid.noteHeight,
        subdivision: state.grid.subdivision
      },
      source
    })
  }

  sendPlayStartPositionResponse(position: number, requestId?: string) {
    this.send({
      type: 'playStartPositionResponse',
      position,
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
