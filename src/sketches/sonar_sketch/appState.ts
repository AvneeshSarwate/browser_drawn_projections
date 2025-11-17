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
  sliders: Array.from({ length: 17 }, (): number => 0),
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


/**
 * todo barrier - a naoive implementation with only promises and no
 * modication of context time will break the timing engine. 
 * To fix this, when the barrier is resolved, we need to broadcast the 
 * current time to all of the channels that are waiting on the barrier.
 * they then adopt the broadcasted time as their current time.
 * This might require a refactor of the core time context logic to work. 
 * Additionally, will need to do another scripting-api/engine-api split. 
 * the in-browser api will just be barrierFunc("name") but the engine
 * function call will need to be barrierFunc("name", ctx) so that
 * the appropriate time context info can be used
 */

export const promiseBarrierMap = new Map<string, { promise: Promise<void>, resolve: () => void, resolveTime: number, startTime: number }>()

export const startBarrier = (key: string, ctx: TimeContext) => {
  let res: () => void = () => { }
  const newPromise = new Promise<void>((resolve, reject) => {
    res = resolve
  })
  
  //fix for missing case
  const oldBarrier = promiseBarrierMap.get(key)
  if (oldBarrier) {
    oldBarrier.resolve()
    oldBarrier.resolveTime = ctx.time
  } 

  promiseBarrierMap.set(key, { promise: newPromise, resolve: res, resolveTime: -1, startTime: ctx.time })
}

export const resolveBarrier = (key: string, ctx: TimeContext) => {
  const barrier = promiseBarrierMap.get(key)
  if (!barrier) {
    console.warn(`No barrier found for key: ${key}`)
    return
  }
  barrier.resolveTime = ctx.time
  barrier.resolve()
  promiseBarrierMap.delete(key)
}

export const awaitBarrier = async (key: string, ctx: TimeContext) => {
  const barrier = promiseBarrierMap.get(key)
  if (!barrier) {
    console.warn(`No barrier found for key: ${key}`)
    return Promise.resolve()
  }

  //if await happens at the same time as barrier start, you're already synced
  if (ctx.time == barrier.startTime) return
    
  await barrier.promise
  ctx.time = barrier.resolveTime
}

//todo API - can move these to be instance methods for the root of the context tree?
//these things only actually work within the same context tree


/**
  event orders per key - loop A is start/resolving barriers, loop B is awaiting to sync, imagine 1 beat loops

  startA - t-0
  resolA - t-1
  awaitB - t-1
  startA - t-1

  because of unpredictability of setTimeout, events at t-1 could happen in any order wrt wall clock

  All 6 possibilities:

  resolA - t-1
  awaitB - t-1
  startA - t-1
  - awaitB immediately releases becaues no active key and never waits on barrier 

  resolA - t-1
  startA - t-1
  awaitB - t-1
  - awaitB immediately releases because startTime == waitTime and never waits on barrier 

  startA - t-1
  resolA - t-1
  awaitB - t-1
  - awaitB immediately releases becaues no active key and never waits on barrier 

  startA - t-1
  awaitB - t-1
  resolA - t-1
  - awaitB immediately releases because startTime == waitTime and never waits on barrier 

  awaitB - t-1
  startA - t-1
  resolA - t-1
  - awaitB waits because it has captured and is waiting on barrier set at t-0, which never gets resolved when barrier map entry is overwritten with new start
  - FIX: if "double start" (eg, key as existing unresolved barrier when start is called), release it before creating new one

  awaitB - t-1
  resolA - t-1
  startA - t-1
  - awaitB releases because it's barrier is resolved

 */

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