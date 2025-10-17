import type * as BABYLON from 'babylonjs'
import { shallowRef } from 'vue'

export interface FluidReactionAppState {
  engine?: BABYLON.WebGPUEngine
  shaderDrawFunc?: () => void
  paused: boolean
  width: number
  height: number
}

export const appState: FluidReactionAppState = {
  engine: undefined,
  shaderDrawFunc: undefined,
  paused: false,
  width: 1024,
  height: 512,
}

export const appStateName = 'fluidReactionAppState'

export const engineRef = shallowRef<BABYLON.WebGPUEngine | undefined>(undefined)
