import p5 from 'p5'
import * as THREE from 'three'
import { Entity, EntityList } from '@/stores/undoCommands'


import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate, type StoreDefinition } from 'pinia'
import { ref, type ShallowRef } from 'vue'
import type { Editor } from 'tldraw'




export type TldrawTestAppState = {
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
  drawing: boolean,
  tldrawEditor: ShallowRef<{ed: Editor}> | undefined,
  tldrawInteractionCount: number
}

export const appState: TldrawTestAppState = {
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
  tldrawEditor: undefined,
  tldrawInteractionCount: 0
} 

export const appStateName = 'nov21DemoAppState'

//todo - set this up like in three5voronoiWebGPU
export const resolution = {width: 1280, height: 720}

//todo api - add caching/rehydrating of appState from local storage

export const globalStore: StoreDefinition = defineStore(appStateName, () => {
  const appStateRef = ref(appState)

  //@ts-ignore
  window.appState = appStateRef

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
} 