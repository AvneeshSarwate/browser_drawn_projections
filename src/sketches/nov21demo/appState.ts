import p5 from 'p5'
import * as THREE from 'three'


import type { CancelablePromisePoxy, Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate, type StoreDefinition } from 'pinia'
import { ref, type ShallowRef } from 'vue'
import type { Editor } from 'tldraw'
import type { AbletonClip } from '@/io/abletonClips'
import { getTestClips } from './midiClipUtils'




export type AnimationState = {
  melodyPhase: number
  baseShapeIndex: number
  noteEnvelopes: {
    noteIndex: number
    ramp: Ramp
    otherVoiceIndex?: number
    phasePos: number
    startTime: number
  }[]
}

const animationStates: AnimationState[] = []
animationStates.push({
  melodyPhase: 0,
  baseShapeIndex: 0,
  noteEnvelopes: []
})
animationStates.push({
  melodyPhase: 1,
  baseShapeIndex: 0,
  noteEnvelopes: []
})
animationStates.push({
  melodyPhase: 2,
  baseShapeIndex: 0,
  noteEnvelopes: []
})

const voiceParams = {
  voice1: {
    play: false,
    noteLength: 1,
    melodySpeed: 1
  },
  voice2: {
    play: false,
    noteLength: 1,
    melodySpeed: 1
  },
  voice3: {
    play: false,
    noteLength: 1,
    melodySpeed: 1
  }
}

const voicePlayheadColors = [
  {primary: {r: 76, g: 134, b: 168}, secondary: {r: 76, g: 164, b: 168}},
  {primary: {r: 165, g: 56, b: 96}, secondary: {r: 255, g: 77, b: 131}},
  {primary: {r: 207, g: 153, b: 95}, secondary: {r: 255, g: 208, b: 117}},
]

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
  animationStates: AnimationState[]
  loopRoot: CancelablePromisePoxy<any> | undefined
  getClips: () => ((noteLength: number, melodySpeed: number) => AbletonClip)[]
  loadCount: number
  voiceParams: typeof voiceParams
  voicePlayheadColors: typeof voicePlayheadColors
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
  tldrawInteractionCount: 0,
  animationStates: animationStates,
  loopRoot: undefined,
  getClips: getTestClips,
  loadCount: -1,
  voiceParams: voiceParams,
  voicePlayheadColors: voicePlayheadColors
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