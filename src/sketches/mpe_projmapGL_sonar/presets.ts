import type { CanvasRuntimeState } from '@/canvas/canvasState'
import { deserializeCanvasState } from '@/canvas/canvasPersistence'
import '@/canvas/typographyGuides'
import { mappingState } from './mappingState'

export type PresetCallback = (canvasState: CanvasRuntimeState) => Promise<void>

const presetRegistry = new Map<string, PresetCallback>()

export const registerPreset = (name: string, callback: PresetCallback) => {
  presetRegistry.set(name, callback)
}

export const getPreset = (name: string): PresetCallback | undefined => {
  return presetRegistry.get(name)
}

export const alphabetPreset: PresetCallback = async (canvasState: CanvasRuntimeState) => {
  const response = await fetch('/handwriting_animator/alphabet_canvas_state.json')
  if (!response.ok) {
    throw new Error(`Failed to load alphabet preset: ${response.statusText}`)
  }
  const stateJson = await response.text()
  
  deserializeCanvasState(canvasState, stateJson)
  
  canvasState.grid.visible.value = true
  
  const nextVisualizations = new Set(canvasState.ancillary.activeVisualizations.value)
  nextVisualizations.add('typo-guides')
  canvasState.ancillary.activeVisualizations.value = nextVisualizations
}

registerPreset('alphabet', alphabetPreset)

export const projectionPreset: PresetCallback = async (canvasState: CanvasRuntimeState) => {
  console.log('projection preset')
  deserializeCanvasState(canvasState, JSON.stringify(mappingState))
}

registerPreset('projection', projectionPreset)
