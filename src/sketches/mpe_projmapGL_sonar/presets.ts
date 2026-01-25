import type { CanvasRuntimeState } from '@/canvas/canvasState'
import { deserializeCanvasState } from '@/canvas/canvasPersistence'
import '@/canvas/typographyGuides'
import { mappingState } from './mappingState'
import { sliderPresests } from './sliderPresets'
import { clipMap, AbletonClip } from '@/io/abletonClips'
import { clipData } from './clipData'
import { setSliderPresetsState } from './sliderPresetState'

export type PresetCallback = (canvasState: CanvasRuntimeState) => Promise<void>

const presetRegistry = new Map<string, PresetCallback>()
export const projectionPresetState = {
  hasRun: false
}

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
  setSliderPresetsState(sliderPresests, true)
  const allowedClips = ['dscale5', 'dscale7', 'd7mel', 'melody4']
  clipMap.clear()
  allowedClips.forEach((name) => {
    const data = clipData[name]
    if (data) {
      clipMap.set(name, new AbletonClip(data.name, data.duration, data.notes))
    } else {
      clipMap.set(name, new AbletonClip(name, 16, []))
    }
  })
  projectionPresetState.hasRun = true
}

registerPreset('projection', projectionPreset)
