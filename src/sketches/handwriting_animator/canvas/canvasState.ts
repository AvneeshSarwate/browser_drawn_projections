import { computed, ref, shallowReactive, type ComputedRef, type Ref, type ShallowReactive } from 'vue'
import Konva from 'konva'
import type { CanvasItem } from './CanvasItem'
import { CommandStack } from './commandStack'

export interface FreehandStrokeRuntime {
  id: string
  points: number[]
  timestamps: number[]
  shape?: Konva.Path
  selected?: boolean
  originalPath?: string
  creationTime: number
  isFreehand: boolean
}

export interface FreehandStrokeGroupRuntime {
  id: string
  strokeIds: string[]
  group?: Konva.Group
}

export interface PolygonShapeRuntime {
  id: string
  points: number[]
  closed: boolean
  konvaShape?: Konva.Line
  controlPoints?: Konva.Circle[]
  creationTime: number
}

export interface PolygonGroupRuntime {
  id: string
  polygonIds: string[]
  group?: Konva.Group
}

export interface CanvasRuntimeState {
  stage?: Konva.Stage
  konvaContainer?: HTMLDivElement
  layers: {
    freehandShape?: Konva.Layer
    freehandDrawing?: Konva.Layer
    freehandSelection?: Konva.Layer
    polygonShapes?: Konva.Layer
    polygonPreview?: Konva.Layer
    polygonControls?: Konva.Layer
    polygonSelection?: Konva.Layer
    ancillaryViz?: Konva.Layer
    metadataHighlight?: Konva.Layer
  }
  canvasItems: Map<string, CanvasItem>
  callbacks: {
    refreshAncillaryViz?: () => void
    freehandDataUpdate?: () => void
    polygonDataUpdate?: () => void
    updateCursor?: () => void
  }
  freehand: {
    strokes: Map<string, FreehandStrokeRuntime>
    strokeGroups: Map<string, FreehandStrokeGroupRuntime>
    dragSelectionState: Ref<{
      isSelecting: boolean
      startPos: { x: number, y: number }
      currentPos: { x: number, y: number }
      isShiftHeld: boolean
    }>
    selectionRect?: Konva.Rect
    isDrawing: boolean
    currentPoints: number[]
    currentTimestamps: number[]
    drawingStartTime: number
    showGrid: Ref<boolean>
    gridSize: number
    selectedStrokesForTimeline: Ref<Set<string>>
    timelineDuration: Ref<number>
    currentPlaybackTime: Ref<number>
    freehandDrawMode: Ref<boolean>
    useRealTiming: Ref<boolean>
    maxInterStrokeDelay: number
    isAnimating: Ref<boolean>
  }
  polygon: {
    shapes: Map<string, PolygonShapeRuntime>
    groups: Map<string, PolygonGroupRuntime>
    isDrawing: Ref<boolean>
    currentPoints: Ref<number[]>
    mode: Ref<'draw' | 'edit'>
    dragStartState: string | null
    proximityThreshold: number
  }
  selection: {
    items: ShallowReactive<Set<CanvasItem>>
    originalStyles: Map<string, { node: Konva.Node, stroke: string, strokeWidth: number }>
    selectedKonvaNodes: ComputedRef<Konva.Node[]>
  }
  command: {
    stack?: CommandStack
    executeCommand?: (name: string, action: () => void) => void
    pushCommand?: (name: string, beforeState: string, afterState: string) => void
  }
  metadata: {
    activeNode: Ref<Konva.Node | null>
    metadataText: Ref<string>
    showEditor: Ref<boolean>
  }
}

export const createCanvasRuntimeState = (): CanvasRuntimeState => {
  const selectionItems = shallowReactive(new Set<CanvasItem>())
  const originalStyles = new Map<string, { node: Konva.Node, stroke: string, strokeWidth: number }>()
  const selectedKonvaNodes = computed(() => [...selectionItems].map(item => item.konvaNode))

  return {
    stage: undefined,
    konvaContainer: undefined,
    layers: {},
    canvasItems: new Map(),
    callbacks: {},
    freehand: {
      strokes: new Map(),
      strokeGroups: new Map(),
      dragSelectionState: ref({
        isSelecting: false,
        startPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
        isShiftHeld: false
      }),
      selectionRect: undefined,
      isDrawing: false,
      currentPoints: [],
      currentTimestamps: [],
      drawingStartTime: 0,
      showGrid: ref(false),
      gridSize: 20,
      selectedStrokesForTimeline: ref(new Set()),
      timelineDuration: ref(0),
      currentPlaybackTime: ref(0),
      freehandDrawMode: ref(true),
      useRealTiming: ref(false),
      maxInterStrokeDelay: 300,
      isAnimating: ref(false)
    },
    polygon: {
      shapes: new Map(),
      groups: new Map(),
      isDrawing: ref(false),
      currentPoints: ref([]),
      mode: ref('draw'),
      dragStartState: null,
      proximityThreshold: 10
    },
    selection: {
      items: selectionItems,
      originalStyles,
      selectedKonvaNodes
    },
    command: {},
    metadata: {
      activeNode: ref(null),
      metadataText: ref(''),
      showEditor: ref(false)
    }
  }
}

// Global state reference for modules to use directly
export let currentCanvasState: CanvasRuntimeState | null = null

export const setGlobalCanvasState = (state: CanvasRuntimeState) => {
  currentCanvasState = state
}

export const getGlobalCanvasState = (): CanvasRuntimeState => {
  if (!currentCanvasState) {
    throw new Error('Canvas state not initialized - call setGlobalCanvasState first')
  }
  return currentCanvasState
}

// Convenience getters for cleaner access
export const freehandStrokes = () => getGlobalCanvasState().freehand.strokes
export const freehandStrokeGroups = () => getGlobalCanvasState().freehand.strokeGroups
export const freehandLayers = () => getGlobalCanvasState().layers
export const polygonShapes = () => getGlobalCanvasState().polygon.shapes
export const polygonGroups = () => getGlobalCanvasState().polygon.groups
export const canvasItems = () => getGlobalCanvasState().canvasItems
