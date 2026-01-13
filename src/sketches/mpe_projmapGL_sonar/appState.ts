import p5 from 'p5'
import * as BABYLON from 'babylonjs'
import { Entity, EntityList } from '@/stores/undoCommands'


import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, shallowReactive, shallowRef, type ShallowReactive } from 'vue'
import Konva from 'konva'
import type { FlattenedStroke, FlattenedStrokeGroup, FreehandRenderData, PolygonRenderData } from '@/canvas/canvasState'
import { z } from 'zod'
import { switchedSchema, type InferFlat } from '@/canvas/switchedSchema'
import { quotes } from './quotes'

export const defaultQuoteText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`

export const textAnimSchema = switchedSchema(
  z.object({
    fillAnim: z.enum(['dropAndScroll', 'matterExplode', 'mpe', 'melodyMap']).default('melodyMap'),
    textInd: z.coerce.string().default(defaultQuoteText)
  }),
  'fillAnim',
  {
    dropAndScroll: { minCharsDrop: z.number().optional() },
    matterExplode: {},
    mpe: {
      attackTime: z.number().positive().default(0.1),    // seconds
      releaseTime: z.number().positive().default(0.3),   // seconds
      gridStep: z.number().positive().default(20),       // pixels
      circleSize: z.number().positive().default(8),      // base circle size in pixels
    },
    melodyMap: {
      column: z.enum(['left', 'middle', 'right']).default('left'),  // which column this polygon belongs to
      circleSize: z.number().positive().default(12),                 // size of traveling circles
      trailLength: z.number().min(0).max(1).default(0.3),           // trail length as fraction of arc
    }
  }
)

// Flat type with all fields optional - fully inferred from schema
export type TextAnimFlat = InferFlat<typeof textAnimSchema>

export const textAnimMetadataSchema = {
  name: 'textAnim' as const,
  schema: textAnimSchema
}

export const textStyleSchema = z.object({
  textSize: z.coerce.number().positive().default(14),
  textColor: z
    .object({
      r: z.coerce.number().min(0).max(1),
      g: z.coerce.number().min(0).max(1),
      b: z.coerce.number().min(0).max(1)
    })
    .default({ r: 1, g: 1, b: 1 }),
  fontStyle: z.enum(['NORMAL', 'ITALIC', 'BOLD', 'BOLDITALIC']).default('NORMAL'),
  fontFamily: z.enum(['Courier New', 'Monaco', 'Menlo']).default('Courier New')
})

export type TextStyle = z.infer<typeof textStyleSchema>

export const textStyleMetadataSchema = {
  name: 'textStyle' as const,
  schema: textStyleSchema
}

// Simple per-polygon FX parameters
export const fxChainSchema = z.object({
  chain: z.enum(['basicBlur']).default('basicBlur'),
  enabled: z.boolean().default(true),
  wobbleX: z.coerce.number().default(0.003),
  wobbleY: z.coerce.number().default(0.003),
  blurX: z.coerce.number().default(2),
  blurY: z.coerce.number().default(2),
  pad: z.coerce.number().default(2),
})

export type FxChainMeta = z.infer<typeof fxChainSchema>

export const fxChainMetadataSchema = {
  name: 'fx' as const,
  schema: fxChainSchema,
}

export type TemplateAppState = {
  p5Instance: p5 | undefined
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
}

// Separate reactive engine ref (mirrors clickAVMelodyLauncherBabylon pattern)
export const engineRef = shallowRef<BABYLON.Engine | undefined>(undefined)

export const appState: TemplateAppState = {
  p5Instance: undefined,
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
} 

export const appStateName = 'mpe_projmapGL'

export const resolution = {
  width: 1280,
  height: 720
}

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
