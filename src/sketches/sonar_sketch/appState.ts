import p5 from 'p5'
import * as THREE from 'three'

import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import type { TimeContext } from '@/channels/channels'
import type { LoopHandle } from '@/channels/base_time_context'

type SaveableProperties = {
  sliceText: string;
  startPhraseIdx: number;
  fxParams: Record<string, number>;
}

export type VoiceState = {
  saveable: SaveableProperties
  isPlaying: boolean;
  isLooping: boolean;
  isCued: boolean;
  loopHandle: LoopHandle | null;
  queue: Array<(ctx: TimeContext) => Promise<void>>;
  playingText: string;
  playingLineIdx: number;
};

export type SonarAppState = {
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
  voices: VoiceState[]
  sliders: number[]
  snapshots: Array<{
    sliders: number[]
    voices: SaveableProperties[]
  }>
}

export const appState: SonarAppState = {
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
  voices: Array.from({ length: 4 }, (): VoiceState => ({
    saveable: {
      sliceText: '',
      startPhraseIdx: 0,
      fxParams: {},
    },
    /** true while the voice is actively playing (Play-button ON) */
    isPlaying: false,
    isLooping: false,
    isCued: false,
    loopHandle: null,
    queue: [],
    /** copy of the slice text with resolved slider values */
    playingText: '',
    /** line index that is currently sounding ( –1  means "none")  */
    playingLineIdx: -1,
    
  })),
  sliders: Array.from({ length: 8 }, (): number => 0),
  snapshots: [],
} 

export const appStateName = 'sonarAppState'

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