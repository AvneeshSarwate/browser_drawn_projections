import p5 from 'p5'
import * as THREE from 'three'
import { Entity, EntityList } from '@/stores/undoCommands'


import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'



export type Polygon = {
  points: { x: number, y: number }[]
  id: string
  selected: boolean
}

type OrderedDrawFunc = {
  func: (p5: p5) => void
  sortKey: number
}


export type PolygonFillAppState = {
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
  polygons: Polygon[]
  polygonHistory: Polygon[][]
  orderedDrawFuncs: Map<string, OrderedDrawFunc>
  voiceStepIndexes: number[]
  canvasInPopup: boolean
  popupWindow: Window | null
}

export const appState: PolygonFillAppState = {
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
  polygons: [],
  polygonHistory: [],
  orderedDrawFuncs: new Map<string, OrderedDrawFunc>(),
  voiceStepIndexes: [0,0,0,0,0,0,0,0],
  canvasInPopup: false,
  popupWindow: null
} 

export const appStateName = 'polygonFillAppState'

export const resolution = {
  width: 1280,
  height: 720
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