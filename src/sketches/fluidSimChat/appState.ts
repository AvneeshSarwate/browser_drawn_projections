import type * as BABYLON from 'babylonjs'
import { shallowRef, ref, type Ref } from 'vue'

export interface ParamDef {
  name: string
  label: string
  min: number
  max: number
  step: number
  value: Ref<number>
}

export type FluidDebugMode = 'dye' | 'velocity' | 'divergence' | 'pressure' | 'splat' | 'splatRaw'

export interface ProgrammaticSplatControl {
  active: Ref<boolean>
  restartToken: Ref<number>
}

export interface FluidReactionAppState {
  fluidEngine?: BABYLON.WebGPUEngine
  reactionEngine?: BABYLON.WebGPUEngine
  shaderDrawFunc?: () => void
  paused: boolean
  width: number
  height: number
  fluidParams?: ParamDef[]
  reactionParams?: ParamDef[]
  debugMode: Ref<FluidDebugMode>
  programmaticSplat: ProgrammaticSplatControl
}

export const appState: FluidReactionAppState = {
  fluidEngine: undefined,
  reactionEngine: undefined,
  shaderDrawFunc: undefined,
  paused: false,
  width: 1024,
  height: 512,
  debugMode: ref('dye'),
  programmaticSplat: {
    active: ref(false),
    restartToken: ref(0),
  },
}

export const appStateName = 'fluidReactionAppState'

export const engineRef = shallowRef<{ fluid?: BABYLON.WebGPUEngine; reaction?: BABYLON.WebGPUEngine } | undefined>(undefined)
