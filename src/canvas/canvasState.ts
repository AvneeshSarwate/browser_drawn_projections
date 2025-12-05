import { computed, ref, shallowReactive, type ComputedRef, type Ref, type ShallowReactive, type WatchStopHandle } from 'vue'
import Konva from 'konva'
import type { CanvasItem } from './CanvasItem'
import { CommandStack } from './commandStack'
import type { ZodTypeAny } from 'zod'

export type MetadataSchemaEntry = { name: string; schema: ZodTypeAny }

export type FlattenedStroke = {
  type: 'stroke'
  id: string
  points: { x: number, y: number, ts: number }[]
  metadata?: any
}

export type FlattenedStrokeGroup = {
  type: 'strokeGroup'
  id: string
  children: (FlattenedStroke | FlattenedStrokeGroup)[]
  metadata?: any
}

export type FreehandRenderData = FlattenedStrokeGroup[]

export type FlattenedPolygon = {
  type: 'polygon'
  id: string
  points: { x: number, y: number }[]
  metadata?: any
}

export type PolygonRenderData = FlattenedPolygon[]

export type FlattenedCircle = {
  type: 'circle'
  id: string
  center: { x: number, y: number }
  r?: number  // Present if circle is not distorted (rx ≈ ry)
  rx: number
  ry: number
  rotation: number
  metadata?: any
}

export type CircleRenderData = FlattenedCircle[]

export type CanvasStateSnapshotBase = {
  freehand: {
    serializedState: string
    bakedRenderData: FreehandRenderData
    bakedGroupMap: Record<string, number[]>
  }
  polygon: {
    serializedState: string
    bakedRenderData: PolygonRenderData
  }
  circle: {
    serializedState: string
    bakedRenderData: CircleRenderData
    bakedGroupMap: Record<string, number[]>
  }
}

export type CanvasStateSnapshot = CanvasStateSnapshotBase & {
  added: CanvasStateSnapshotBase
  deleted: CanvasStateSnapshotBase
  changed: CanvasStateSnapshotBase
}

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

export interface CircleShapeRuntime {
  id: string
  x: number
  y: number
  r: number
  shape?: Konva.Circle
  creationTime: number
}

export interface CanvasRuntimeState {
  stage?: Konva.Stage
  konvaContainer?: HTMLDivElement
  activeTool: Ref<'select' | 'freehand' | 'polygon' | 'circle'>
  metadataSchemas: MetadataSchemaEntry[]
  layers: {
    grid?: Konva.Layer
    drawing?: Konva.Layer
    overlay?: Konva.Layer
    transformer?: Konva.Transformer
  }
  groups: {
    freehandShape?: Konva.Group
    freehandDrawing?: Konva.Group
    polygonShapes?: Konva.Group
    polygonPreview?: Konva.Group
    polygonControls?: Konva.Group
    polygonSelection?: Konva.Group
    circleShapes?: Konva.Group
    circlePreview?: Konva.Group
    ancillaryViz?: Konva.Group
    metadataHighlight?: Konva.Group
    selectionOverlay?: Konva.Group
  }
  grid: {
    visible: Ref<boolean>
    size: number
  }
  canvasItems: Map<string, CanvasItem>
  callbacks: {
    refreshAncillaryViz?: () => void
    syncAppState?: (state: CanvasRuntimeState) => void
    updateCursor?: () => void
  }
  keyboardDisposables: Array<() => void>
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
  circle: {
    shapes: Map<string, CircleShapeRuntime>
    isDrawing: Ref<boolean>
    currentCenter: Ref<{ x: number, y: number } | null>
    currentRadius: Ref<number>
    dragStartState: string | null
    serializedState: string
    bakedRenderData: CircleRenderData
    bakedGroupMap: Record<string, number[]>
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
    transformStartState: string
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
      layer?: Konva.Group
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
  const selectedKonvaNodes = computed(() => Array.from(selectionItems as unknown as Set<CanvasItem>, item => item.konvaNode))

  return {
    stage: undefined,
    konvaContainer: undefined,
    activeTool: ref('select'),
    metadataSchemas: [],
    layers: {
      grid: undefined,
      drawing: undefined,
      overlay: undefined,
      transformer: undefined
    },
    groups: {
      freehandShape: undefined,
      freehandDrawing: undefined,
      polygonShapes: undefined,
      polygonPreview: undefined,
      polygonControls: undefined,
      polygonSelection: undefined,
      ancillaryViz: undefined,
      metadataHighlight: undefined,
      selectionOverlay: undefined
    },
    grid: {
      visible: ref(false),
      size: 20
    },
    canvasItems: new Map(),
    callbacks: {},
    keyboardDisposables: [],
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
    circle: {
      shapes: new Map(),
      isDrawing: ref(false),
      currentCenter: ref(null),
      currentRadius: ref(0),
      dragStartState: null,
      serializedState: '',
      bakedRenderData: [],
      bakedGroupMap: {}
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
      },
      transformStartState: ''
    },
    command: {},
    metadata: {
      activeNode: ref(null),
      metadataText: ref(''),
      showEditor: ref(true),
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

// Convenience getters for cleaner access
export const freehandStrokes = (state: CanvasRuntimeState) => state.freehand.strokes
export const freehandStrokeGroups = (state: CanvasRuntimeState) => state.freehand.strokeGroups
export const freehandLayers = (state: CanvasRuntimeState) => state.layers
export const polygonShapes = (state: CanvasRuntimeState) => state.polygon.shapes
export const polygonGroups = (state: CanvasRuntimeState) => state.polygon.groups
export const circleShapes = (state: CanvasRuntimeState) => state.circle.shapes
export const canvasItems = (state: CanvasRuntimeState) => state.canvasItems
