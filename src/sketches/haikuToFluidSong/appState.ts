import type * as BABYLON from 'babylonjs'
import { shallowRef, ref, type Ref } from 'vue'

export const DEFAULT_HAIKU = `A world of soft dew,
And within every dewdrop
A world of struggle.`

export type HaikuPipelineRunner = (skipMusic?: boolean, useTestData?: boolean) => Promise<void>

export type HaikuPipelineCanceler = () => void

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
  haikuText: Ref<string>
  apiKey: Ref<string>
  startHaikuPipeline: Ref<HaikuPipelineRunner | null>
  cancelHaikuPipeline: Ref<HaikuPipelineCanceler | null>
  isHaikuAnimating: Ref<boolean>
}

export const appState: FluidReactionAppState = {
  fluidEngine: undefined,
  reactionEngine: undefined,
  shaderDrawFunc: undefined,
  paused: false,
  width: 128 * 14,
  height: 128 * 7,
  debugMode: ref('dye'),
  programmaticSplat: {
    active: ref(false),
    restartToken: ref(0),
  },
  haikuText: ref(DEFAULT_HAIKU),
  apiKey: ref(''),
  startHaikuPipeline: ref<HaikuPipelineRunner | null>(null),
  cancelHaikuPipeline: ref<HaikuPipelineCanceler | null>(null),
  isHaikuAnimating: ref(false),
}

export const appStateName = 'fluidReactionAppState'

export const engineRef = shallowRef<{ fluid?: BABYLON.WebGPUEngine; reaction?: BABYLON.WebGPUEngine } | undefined>(undefined)
