import p5 from 'p5'
import * as THREE from 'three'
import { TreeShape } from '@/creativeAlgs/TreeShapes'
import { Entity, EntityList } from '@/stores/undoCommands'
import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { reactive, ref } from 'vue'

export type TreeShapeDemoAppState = {
  rootShapes: TreeShape[]
  activeShape: TreeShape | null
  foldingSpeed: number
  selectedFoldMode: 'outline' | 'shrink' | 'segment'
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
}

export const appState: TreeShapeDemoAppState = {
  rootShapes: [],
  activeShape: null,
  foldingSpeed: 0.01,
  selectedFoldMode: 'outline',
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
} 

export const appStateName = 'treeShapeDemoAppState'

export const resolution = {
  width: 1280,
  height: 720
}

export const globalStore = defineStore(appStateName, () => {
  const appStateRef = reactive(appState)

  //@ts-ignore
  window.appState = appStateRef

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
} 