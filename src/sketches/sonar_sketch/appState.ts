import p5 from 'p5'
import * as THREE from 'three'

import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'
import type { TimeContext } from '@/channels/channels'
import type { LoopHandle } from '@/channels/base_time_context'

export type SaveableProperties = {
  fxParams: Record<string, number>;
  fxBanks: Record<string, number>[]; // 8 banks of FX parameters for this voice
  jsCodeBanks: string[]; // 8 banks of JavaScript code for this voice
  /** JavaScript livecoding source for this voice (Monaco input editor) */
  jsCode: string;
}

export type VoiceState = {
  saveable: SaveableProperties
  isPlaying: boolean;
  isLooping: boolean;
  isCued: boolean;
  hotSwapCued: boolean;
  playingLockedSourceText: string;
  loopHandle: LoopHandle | null;
  queue: Array<(ctx: TimeContext) => Promise<void>>;
  currentFxBank: number; // current active FX bank for this voice
  currentJsBank: number; // current active JS code bank for this voice
};

export type SliderBanks = {
  topLevel: number[][]; // 8 banks of 8 sliders each
}

export type ToggleBanks = {
  topLevel: boolean[][]; // 8 banks of 8 toggles each
}

export type OneShotBanks = {
  topLevel: boolean[][]; // 8 banks of 8 one-shots each
}

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
  toggles: boolean[]
  oneShots: boolean[]
  sliderBanks: SliderBanks
  toggleBanks: ToggleBanks
  oneShotBanks: OneShotBanks
  currentTopLevelBank: number
  snapshots: Array<{
    sliders: number[]
    toggles: boolean[]
    oneShots: boolean[]
    voices: SaveableProperties[]
    sliderBanks: SliderBanks
    toggleBanks: ToggleBanks
    oneShotBanks: OneShotBanks
  }>
  autoSaveInterval?: number
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
      fxParams: {},
      fxBanks: Array.from({ length: 8 }, () => ({} as Record<string, number>)),
      jsCodeBanks: Array.from({ length: 8 }, () => ''),
      jsCode: ''
    },
    /** true while the voice is actively playing (Play-button ON) */
    isPlaying: false,
    isLooping: false,
    isCued: false,
    hotSwapCued: false,
    playingLockedSourceText: '',
    loopHandle: null,
    queue: [],
    currentFxBank: 0,
    currentJsBank: 0,
  })),
  sliders: Array.from({ length: 8 }, (): number => 0),
  toggles: Array.from({ length: 8 }, (): boolean => false),
  oneShots: Array.from({ length: 8 }, (): boolean => false),
  sliderBanks: {
    topLevel: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0)),
  },
  toggleBanks: {
    topLevel: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => false)),
  },
  oneShotBanks: {
    topLevel: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => false)),
  },
  currentTopLevelBank: 0,
  snapshots: [],
} 

export const oneshotCall = (idx: number, oneShots: boolean[]): boolean => {
  if (idx < 0 || idx >= oneShots.length) return false
  const result = oneShots[idx]
  oneShots[idx] = false
  return result
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