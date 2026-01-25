/**
 * Animation Editor Type Definitions
 */

// =============================================================================
// Track Data Types
// =============================================================================

export type TrackType = 'number' | 'enum' | 'func'

export type FuncElement = {
  funcName: string
  args: unknown[]
}

// Input types (from user, no IDs required)
export type NumberDatum = { time: number; element: number }
export type EnumDatum = { time: number; element: string }
export type FuncDatum = { time: number; element: FuncElement }
export type TrackDatum = NumberDatum | EnumDatum | FuncDatum

// Runtime types (with IDs for editing)
export type NumberElement = { id: string; time: number; value: number }
export type EnumElement = { id: string; time: number; value: string }
export type FuncElementData = { id: string; time: number; value: FuncElement }
export type TrackElement = NumberElement | EnumElement | FuncElementData

export type TrackDef = {
  name: string
  fieldType: TrackType
  data: TrackDatum[]

  // Callbacks - only one should be defined based on fieldType
  updateNumber?: (v: number) => void
  updateEnum?: (v: string) => void
  updateFunc?: (funcName: string, ...args: unknown[]) => void

  // Number track bounds (defaults: 0-1)
  low?: number
  high?: number
}

export type TrackRuntime = {
  id: string
  def: TrackDef
  // Parallel arrays for fast evaluation (view mode)
  times: number[]
  elements: (number | string | FuncElement)[]
  // Element data with IDs for editing
  elementData: TrackElement[]
  low: number
  high: number
}

// =============================================================================
// Edit Mode State Types
// =============================================================================

export type EditorMode = 'view' | 'edit'

export type EditState = {
  mode: EditorMode
  editEnabledTrackIds: Set<string>
  frontTrackIdByType: {
    number?: string
    enum?: string
    func?: string
  }
  selectedElementByType: {
    number?: { trackId: string; elementId: string }
    enum?: { trackId: string; elementId: string }
    func?: { trackId: string; elementId: string }
  }
  precision: PrecisionState | null
  // Drag preview state (for live callbacks during drag)
  dragPreview: DragPreviewState | null
}

export type PrecisionState = {
  open: boolean
  fieldType: TrackType
  trackId: string
  elementId: string
  saved: PrecisionDraft
  draft: PrecisionDraft
  dirty: boolean
}

export type PrecisionDraft = {
  time: number
  // For number
  value?: number
  // For enum
  enumValue?: string
  // For func
  funcName?: string
  funcArgs?: FuncArg[]
}

export type FuncArg = {
  type: 'text' | 'number'
  value: string
}

export type DragPreviewState = {
  fieldType: TrackType
  trackId: string
  elementId: string
  time: number
  value?: number // For number tracks
}

// =============================================================================
// World Snapshot (for undo/redo)
// =============================================================================

export type TrackSnapshot = {
  id: string
  name: string
  fieldType: TrackType
  elementData: TrackElement[]
  low: number
  high: number
}

export type WorldSnapshot = {
  tracks: TrackSnapshot[]
  trackOrder: string[]
}

// =============================================================================
// Action Types (emit-only from lanes to parent)
// =============================================================================

export type EditorAction =
  // Track management
  | { type: 'TRACK/TOGGLE_EDIT_ENABLED'; trackId: string; enabled: boolean }
  | { type: 'TRACK/SET_FRONT'; fieldType: TrackType; trackId: string }
  | { type: 'TRACK/DELETE'; trackId: string }
  | { type: 'TRACK/SET_BOUNDS'; trackId: string; low: number; high: number }
  // History
  | { type: 'EDIT/UNDO' }
  | { type: 'EDIT/REDO' }
  // Selection
  | { type: 'ELEMENT/SELECT'; fieldType: TrackType; trackId: string; elementId: string }
  | { type: 'ELEMENT/DESELECT'; fieldType: TrackType }
  // Precision editor
  | { type: 'PRECISION/OPEN'; fieldType: TrackType; trackId: string; elementId: string }
  | { type: 'PRECISION/CHANGE_DRAFT'; draft: Partial<PrecisionDraft> }
  | { type: 'PRECISION/SAVE' }
  | { type: 'PRECISION/REVERT' }
  | { type: 'PRECISION/CLOSE' }
  // Number lane
  | { type: 'NUMBER/ADD'; trackId: string; time: number; value: number }
  | { type: 'NUMBER/DELETE'; trackId: string; elementId: string }
  | { type: 'NUMBER/DRAG_START'; trackId: string; elementId: string }
  | { type: 'NUMBER/DRAG_PREVIEW'; trackId: string; elementId: string; time: number; value: number }
  | { type: 'NUMBER/DRAG_END'; trackId: string; elementId: string; time: number; value: number }
  // Enum lane
  | { type: 'ENUM/ADD'; trackId: string; time: number }
  | { type: 'ENUM/DELETE'; trackId: string; elementId: string }
  | { type: 'ENUM/DRAG_PREVIEW'; trackId: string; elementId: string; time: number }
  | { type: 'ENUM/DRAG_END'; trackId: string; elementId: string; time: number }
  // Func lane
  | { type: 'FUNC/ADD'; trackId: string; time: number }
  | { type: 'FUNC/DELETE'; trackId: string; elementId: string }
  | { type: 'FUNC/DRAG_PREVIEW'; trackId: string; elementId: string; time: number }
  | { type: 'FUNC/DRAG_END'; trackId: string; elementId: string; time: number }

// =============================================================================
// Toast Types
// =============================================================================

export type ToastType = 'info' | 'warning' | 'error' | 'success'

export type Toast = {
  id: string
  message: string
  type: ToastType
  duration?: number
}
