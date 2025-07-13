import p5 from 'p5'
import * as THREE from 'three'
import { Entity, EntityList } from '@/stores/undoCommands'


import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'


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
  freehandStateString: string
  freehandRenderData: FreehandRenderData
  polygonStateString: string
  polygonRenderData: PolygonRenderData
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
  polygonStateString: '',
  polygonRenderData: [],
} 

export const appStateName = 'templateAppState'

export const resolution = {
  width: 1000,
  height: 500
}

//todo api - add caching/rehydrating of appState from local storage

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
  p.noStroke()
  p.fill(255)
  data.forEach((g, i) => {
    recursiveDrawStrokeGroups(p, g)
  })
  p.pop()
}

export const recursiveDrawStrokeGroups = (p: p5, item: FlattenedStrokeGroup | FlattenedStroke) => {
  if('points' in item && item.points.length > 0) {
    p.beginShape()
    item.points.forEach((point) => {
      p.vertex(point.x, point.y)
    })
    p.endShape(p.CLOSE)
  }
  if('children' in item && item.children.length > 0) {
    item.children.forEach((child) => {
      recursiveDrawStrokeGroups(p, child)
    })
  }
}