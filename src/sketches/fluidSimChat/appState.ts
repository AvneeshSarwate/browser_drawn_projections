import type * as BABYLON from 'babylonjs'
import { shallowRef, type Ref } from 'vue'

export interface ParamDef {
  name: string
  label: string
  min: number
  max: number
  step: number
  value: Ref<number>
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
}

export const appState: FluidReactionAppState = {
  fluidEngine: undefined,
  reactionEngine: undefined,
  shaderDrawFunc: undefined,
  paused: false,
  width: 1024,
  height: 512,
}

export const appStateName = 'fluidReactionAppState'

export const engineRef = shallowRef<{ fluid?: BABYLON.WebGPUEngine; reaction?: BABYLON.WebGPUEngine } | undefined>(undefined)
