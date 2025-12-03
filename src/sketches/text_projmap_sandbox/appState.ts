import p5 from 'p5'
import * as THREE from 'three'
import { Entity, EntityList } from '@/stores/undoCommands'


import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, shallowReactive, shallowRef, type ShallowReactive } from 'vue'
import Konva from 'konva'
import type { FlattenedStroke, FlattenedStrokeGroup, FreehandRenderData, PolygonRenderData } from '@/canvas/canvasState'
import { z } from 'zod'
import { switchedSchema, type InferFlat } from '@/canvas/switchedSchema'

export const textAnimSchema = switchedSchema(
  z.object({
    fillAnim: z.enum(['dropAndScroll', 'matterExplode']),
    textInd: z.number()
  }),
  'fillAnim',
  {
    dropAndScroll: { minCharsDrop: z.number().optional() },
    matterExplode: {}
  }
)

// Flat type with all fields optional - fully inferred from schema
export type TextAnimFlat = InferFlat<typeof textAnimSchema>

export const textAnimMetadataSchema = {
  name: 'textAnim' as const,
  schema: textAnimSchema
}

export const textStyleSchema = z.object({
  textSize: z.coerce.number().positive().optional(),
  textColor: z
    .object({
      r: z.coerce.number().min(0).max(1),
      g: z.coerce.number().min(0).max(1),
      b: z.coerce.number().min(0).max(1)
    })
    .optional(),
  fontStyle: z.enum(['NORMAL', 'ITALIC', 'BOLD', 'BOLDITALIC']).optional(),
  fontFamily: z.enum(['Courier New', 'Consolas', 'Monaco', 'Menlo']).optional()
})

export type TextStyle = z.infer<typeof textStyleSchema>

export const textStyleMetadataSchema = {
  name: 'textStyle' as const,
  schema: textStyleSchema
}

export type TemplateAppState = {
  p5Instance: p5 | undefined
  threeRenderer: THREE.WebGLRenderer | undefined
  codeStack: (() => void)[]
  codeStackIndex: number
  drawFunctions: ((p5: p5) => void)[]
  oneTimeDrawFuncs: ((p5: p5) => void)[]
  drawFuncMap: Map<string, (p5: p5) => void>
  shaderDrawFunc: (() => void) | undefined
  stats?: { begin: () => void, end: () => void }
  paused: boolean
  drawing: boolean

  //canvas state
  freehandStateString: string
  freehandRenderData: FreehandRenderData
  freehandGroupMap: Record<string, number[]>
  polygonStateString: string
  polygonRenderData: PolygonRenderData
  gpuStrokesReadyPromise: Promise<boolean> | null
}

export const appState: TemplateAppState = {
  p5Instance: undefined,
  threeRenderer: undefined,
  codeStack: [],
  codeStackIndex: 0,
  drawFunctions: [],
  oneTimeDrawFuncs: [],
  drawFuncMap: new Map<string, (p5: p5) => void>(),
  shaderDrawFunc: undefined,
  stats: undefined,
  paused: false,
  drawing: false,
  freehandStateString: '',
  freehandRenderData: [],
  freehandGroupMap: {},
  polygonStateString: '',
  polygonRenderData: [],
  gpuStrokesReadyPromise: null,
} 

export const appStateName = 'text_projmap_sandbox'

export const resolution = {
  width: 1000,
  height: 500
}

//todo api - add caching/rehydrating of appState from local storage


//canvas state
// UI refs that should persist across hot reloads
export const activeTool = ref<'select' | 'freehand' | 'polygon'>('select')
export const availableStrokes = ref<Array<{index: number, name: string}>>([])
export const animationParams = ref({
  strokeA: 0,
  strokeB: 0,
  interpolationT: 0.0,
  duration: 2.0,
  scale: 1.0,
  position: 'center' as 'start' | 'center' | 'end' | 'bbox-center' | 'bbox-tl' | 'bbox-tr' | 'bbox-bl' | 'bbox-br',
  loop: false,
  startPhase: 0.0
})
export const gpuStrokesReady = ref(false)
export const launchByName = ref(false)
export const selectedGroupName = ref('')

// Script editor state
export const SCRIPT_STORAGE_KEY = 'handwriting-animator-script'
const defaultScript = `// Launch multiple strokes in patterns
launchStroke(100, 100, 0, 1)
launchStroke(200, 200, 0, 1, { duration: 3.0, loop: true })
launchStroke(300, 300, 1, 0, { startPhase: 0.5 })`
export const scriptCode = ref(localStorage.getItem(SCRIPT_STORAGE_KEY) || defaultScript)
export const scriptExecuting = ref(false)

export const globalStore = defineStore(appStateName, () => {
  const appStateRef = ref(appState)

  //@ts-ignore
  window.appState = appStateRef

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
} 


export const drawFlattenedStrokeGroup = (p: p5, data: FreehandRenderData) => {
  p.push()
  //no stroke fill white
  p.stroke(255)
  p.strokeWeight(3)
  p.noFill()
  data.forEach((group) => {
    recursiveDrawStrokeGroups(p, group)
  })
  p.pop()
}

export const recursiveDrawStrokeGroups = (p: p5, item: FlattenedStrokeGroup | FlattenedStroke) => {
  if (item.type === 'stroke') {
    if (item.points.length === 0) return
    p.beginShape()
    item.points.forEach((point) => {
      p.vertex(point.x, point.y)
    })
    p.endShape()
    return
  }

  item.children.forEach((child) => {
    recursiveDrawStrokeGroups(p, child)
  })
}

export let stage: Konva.Stage | undefined = undefined
export const setStage = (s: Konva.Stage) => {
  stage = s
}


// Metadata editing state
export const activeNode = shallowRef<Konva.Node | null>(null)
export const metadataText = ref('')
export const showMetadataEditor = ref(false)

export const selected: ShallowReactive<Konva.Node[]> = shallowReactive([]) //strokes
export const selectedPolygons: ShallowReactive<Konva.Node[]> = shallowReactive([])

// Helper function to get the currently active single node for metadata editing
export const getActiveSingleNode = (): Konva.Node | null => {
  // freehand Path (single selection only)
  if (selected.length === 1 && selected[0] instanceof Konva.Path) {
    return selected[0]
  }
  // polygon Line (already single selection)
  if (selectedPolygons.length === 1) {
    return selectedPolygons[0]
  }
  return null
}
