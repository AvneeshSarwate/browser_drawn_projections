import type * as BABYLON from 'babylonjs'

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
