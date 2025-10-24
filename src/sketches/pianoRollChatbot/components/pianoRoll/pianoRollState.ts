import Konva from 'konva'
import type { CommandStack } from './commandStack'
import type { MIDIManager, MIDIDevice } from './midiManager'

// Pure data - NO Konva references
export type NoteData = {
  id: string
  pitch: number  // MIDI 0-127
  position: number  // in quarter notes
  duration: number  // in quarter notes
  velocity: number
  metadata?: any
}

// Input type for notes that may be missing id or velocity
export type NoteDataInput = {
  id?: string
  pitch: number
  position: number
  duration: number
  velocity?: number
  selected?: boolean
  metadata?: any
}

export interface PianoRollState {
  stage?: Konva.Stage
  konvaContainer?: HTMLDivElement

  // Note data (pure, no Konva refs)
  notes: Map<string, NoteData>

  // Selection
  selection: {
    selectedIds: Set<string>
    selectionRect?: Konva.Rect  // for marquee selection visual only
  }

  // Viewport
  viewport: {
    scrollX: number  // horizontal scroll in px
    scrollY: number  // vertical scroll in px
    zoomX: number
    zoomY: number
  }

  // Grid configuration
  grid: {
    quarterNoteWidth: number  // px (derived from base * zoom)
    noteHeight: number  // px (derived from base * zoom)
    baseQuarterNoteWidth: number  // px at zoom 1
    baseNoteHeight: number  // px at zoom 1
    subdivision: number  // 16 for 16th notes
    numMeasures: number
    timeSignature: number
    maxLength: number  // max length in quarter notes
    backgroundColor1: string
    backgroundColor2: string
    noteColor: string
    selectedNoteColor: string
  }

  // Interaction state (no explicit "mode")
  interaction: {
    // Drag state
    isDragging: boolean
    dragStartPos?: { x: number, y: number }
    draggedNoteInitialStates: Map<string, { position: number, pitch: number }>
    quantDragActivated: boolean
    dragBeforeState?: string

    // Resize state
    isResizing: boolean
    resizeTargetId?: string
    resizeIsEnd: boolean  // true = resize end, false = resize start
    resizeInitialStates: Map<string, { position: number, duration: number }>
    quantResizeActivated: boolean
    resizeBeforeState?: string

    // Marquee selection
    isMarqueeSelecting: boolean
    marqueeStart?: { x: number, y: number }
    marqueeCurrent?: { x: number, y: number }
    marqueeIsShift: boolean

    // Overlap preview tracking
    hiddenNoteIds: Set<string>  // notes hidden due to drag/resize overlap
    truncatedNotes: Map<string, number>  // noteId -> truncated duration for display
    createEmptyOverlapAdjustments: () => { toDelete: Set<string>, toTruncate: Map<string, number> }
  }

  // Undo/redo (simple snapshot-based)
  command: {
    stack?: CommandStack
  }

  // Layers (Konva references for rendering)
  layers: {
    grid?: Konva.Layer
    notes?: Konva.Layer
    overlay?: Konva.Layer
  }

  // Rendering cache to avoid unnecessary redraws
  renderCache: {
    grid: {
      lastScrollX: number
      lastScrollY: number
      lastSubdivision: number
      lastQuarterNoteWidth: number
      lastNoteHeight: number
    }
  }

  // RAF control
  needsRedraw: boolean
  rafHandle?: number

  // Queue playhead (green) - where playback will start from
  queuePlayhead: {
    position: number  // in quarter notes
    element?: Konva.Line
  }

  // Live playhead (orange) - controlled during playback
  livePlayhead: {
    position: number  // in quarter notes
    element?: Konva.Line
  }

  // Optional callback to notify external listeners when state changes outside command stack
  notifyExternalChange?: () => void

  // MIDI state
  midi: {
    manager?: MIDIManager
    enabled: boolean
    selectedDeviceId: string | null
    availableDevices: MIDIDevice[]
  }
}

export const createPianoRollState = (): PianoRollState => {
  const baseQuarterNoteWidth = 120
  const baseNoteHeight = 20

  return {
    stage: undefined,
    konvaContainer: undefined,

    notes: new Map(),

    selection: {
      selectedIds: new Set(),
      selectionRect: undefined
    },

    viewport: {
      scrollX: 0,
      scrollY: 55 * baseNoteHeight,  // Start at middle C
      zoomX: 1,
      zoomY: 1
    },

    grid: {
      quarterNoteWidth: baseQuarterNoteWidth,
      noteHeight: baseNoteHeight,
      baseQuarterNoteWidth,
      baseNoteHeight,
      subdivision: 16,
      numMeasures: 100,
      timeSignature: 4,
      maxLength: 64,  // 16 bars * 4 beats = 64 quarter notes
      backgroundColor1: '#ddd',
      backgroundColor2: '#bbb',
      noteColor: '#f23',
      selectedNoteColor: '#2ee'
    },

    interaction: {
      isDragging: false,
      dragStartPos: undefined,
      draggedNoteInitialStates: new Map(),
      quantDragActivated: false,
      dragBeforeState: undefined,

      isResizing: false,
      resizeTargetId: undefined,
      resizeIsEnd: false,
      resizeInitialStates: new Map(),
      quantResizeActivated: false,
      resizeBeforeState: undefined,

      isMarqueeSelecting: false,
      marqueeStart: undefined,
      marqueeCurrent: undefined,
      marqueeIsShift: false,

      hiddenNoteIds: new Set(),
      truncatedNotes: new Map(),
      createEmptyOverlapAdjustments: () => ({
        toDelete: new Set<string>(),
        toTruncate: new Map<string, number>()
      })
    },

    command: {
      stack: undefined
    },

    layers: {
      grid: undefined,
      notes: undefined,
      overlay: undefined
    },

    renderCache: {
      grid: {
        lastScrollX: -1,
        lastScrollY: -1,
        lastSubdivision: -1,
        lastQuarterNoteWidth: -1,
        lastNoteHeight: -1
      }
    },

    needsRedraw: false,
    rafHandle: undefined,

    queuePlayhead: {
      position: 0,
      element: undefined
    },

    livePlayhead: {
      position: 0,
      element: undefined
    },

    notifyExternalChange: undefined,

    midi: {
      manager: undefined,
      enabled: false,
      selectedDeviceId: null,
      availableDevices: []
    }
  }
}
