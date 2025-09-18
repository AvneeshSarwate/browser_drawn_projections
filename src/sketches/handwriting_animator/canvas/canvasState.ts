import { computed, ref, shallowReactive, type ComputedRef, type Ref, type ShallowReactive, type WatchStopHandle } from 'vue'
import Konva from 'konva'
import type { CanvasItem } from './CanvasItem'
import { CommandStack } from './commandStack'

export type FlattenedStroke = {
  points: { x: number, y: number, ts: number }[]
  metadata?: any
}

export type FlattenedStrokeGroup = {
  children: (FlattenedStroke | FlattenedStrokeGroup)[]
  metadata?: any
}

export type FreehandRenderData = FlattenedStrokeGroup[]

export type FlattenedPolygon = {
  points: { x: number, y: number }[]
  metadata?: any
}

export type PolygonRenderData = FlattenedPolygon[]

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

export interface AncillaryVisualizationInstance {
  key: string
  nodes: Konva.Node | Konva.Node[]
}

export interface CanvasRuntimeState {
  stage?: Konva.Stage
  konvaContainer?: HTMLDivElement
  activeTool: Ref<'select' | 'freehand' | 'polygon'>
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
    selectionOverlay?: Konva.Layer
    transformer?: Konva.Transformer
    transformerLayer?: Konva.Layer
  }
  canvasItems: Map<string, CanvasItem>
  callbacks: {
    refreshAncillaryViz?: () => void
    syncAppState?: (state: CanvasRuntimeState) => void
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
    freehandDragStartState: string | null
    serializedState: string
    bakedRenderData: FreehandRenderData
    bakedGroupMap: Record<string, number[]>
  }
  polygon: {
    shapes: Map<string, PolygonShapeRuntime>
    groups: Map<string, PolygonGroupRuntime>
    isDrawing: Ref<boolean>
    currentPoints: Ref<number[]>
    mode: Ref<'draw' | 'edit'>
    dragStartState: string | null
    proximityThreshold: number
    serializedState: string
    bakedRenderData: PolygonRenderData
  }
  selection: {
    items: ShallowReactive<Set<CanvasItem>>
    originalStyles: Map<string, { node: Konva.Node, stroke: string, strokeWidth: number }>
    selectedKonvaNodes: ComputedRef<Konva.Node[]>
    
    // NEW - generic marquee / drag helpers
    dragSelectionState: Ref<{
      isSelecting: boolean
      startPos: { x: number, y: number }
      currentPos: { x: number, y: number }
      isShiftHeld: boolean
    }>
    selectionRect?: Konva.Rect
    selectionDragState: {
      isDragging: boolean
      startPos: { x: number, y: number }
      startNodePositions: Map<Konva.Node, {x: number, y: number}>
      beforeState: string
    }
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
    highlight: {
      layer?: Konva.Layer
      metadataRect?: Konva.Rect
      hoverRect?: Konva.Rect
    }
  }
  ancillary: {
    activeVisualizations: Ref<Set<string>>
    nodeVisualizations: Map<string, AncillaryVisualizationInstance>
    listenersAttached: boolean
    rafToken: number | null
    activeWatchStop?: WatchStopHandle
  }
}

export const createCanvasRuntimeState = (): CanvasRuntimeState => {
  const selectionItems = shallowReactive(new Set<CanvasItem>())
  const originalStyles = new Map<string, { node: Konva.Node, stroke: string, strokeWidth: number }>()
  const selectedKonvaNodes = computed(() => [...selectionItems].map(item => item.konvaNode))

  return {
    stage: undefined,
    konvaContainer: undefined,
    activeTool: ref('select'),
    layers: {
      selectionOverlay: undefined,
      transformer: undefined,
      transformerLayer: undefined
    },
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
      isAnimating: ref(false),
      freehandDragStartState: null,
      serializedState: '',
      bakedRenderData: [],
      bakedGroupMap: {}
    },
    polygon: {
      shapes: new Map(),
      groups: new Map(),
      isDrawing: ref(false),
      currentPoints: ref([]),
      mode: ref('draw'),
      dragStartState: null,
      proximityThreshold: 10,
      serializedState: '',
      bakedRenderData: []
    },
    selection: {
      items: selectionItems,
      originalStyles,
      selectedKonvaNodes,
      dragSelectionState: ref({
        isSelecting: false,
        startPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
        isShiftHeld: false
      }),
      selectionRect: undefined,
      selectionDragState: {
        isDragging: false,
        startPos: { x: 0, y: 0 },
        startNodePositions: new Map(),
        beforeState: ''
      }
    },
    command: {},
    metadata: {
      activeNode: ref(null),
      metadataText: ref(''),
      showEditor: ref(false),
      highlight: {}
    },
    ancillary: {
      activeVisualizations: ref(new Set<string>()),
      nodeVisualizations: new Map<string, AncillaryVisualizationInstance>(),
      listenersAttached: false,
      rafToken: null,
      activeWatchStop: undefined
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
export const freehandStrokes = (state: CanvasRuntimeState) => state.freehand.strokes
export const freehandStrokeGroups = (state: CanvasRuntimeState) => state.freehand.strokeGroups
export const freehandLayers = (state: CanvasRuntimeState) => state.layers
export const polygonShapes = (state: CanvasRuntimeState) => state.polygon.shapes
export const polygonGroups = (state: CanvasRuntimeState) => state.polygon.groups
export const canvasItems = (state: CanvasRuntimeState) => state.canvasItems
