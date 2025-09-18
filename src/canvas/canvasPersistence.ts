import { getCurrentFreehandStateString, restoreFreehandState } from './freehandTool'
import { getCurrentPolygonStateString, restorePolygonState } from './polygonTool'
import type { CanvasRuntimeState } from './canvasState'

export interface CanvasPersistenceOptions {
  handleTimeUpdate?: (time: number) => void
}

interface NormalizedCanvasState {
  freehand?: string
  polygon?: string
}

const parseStateString = (stateString: string | null | undefined) => {
  if (!stateString) return null
  try {
    return JSON.parse(stateString)
  } catch (error) {
    console.warn('Failed to parse state string:', error)
    return null
  }
}

const normalizeParsedState = (parsed: any): NormalizedCanvasState => {
  if (!parsed || typeof parsed !== 'object') {
    return {}
  }

  if ('freehand' in parsed || 'polygon' in parsed) {
    const result: NormalizedCanvasState = {}

    if (parsed.freehand !== undefined) {
      result.freehand = typeof parsed.freehand === 'string'
        ? parsed.freehand
        : JSON.stringify(parsed.freehand)
    }

    if (parsed.polygon !== undefined) {
      result.polygon = typeof parsed.polygon === 'string'
        ? parsed.polygon
        : JSON.stringify(parsed.polygon)
    }

    return result
  }

  if ('layer' in parsed && (parsed.strokes || parsed.strokeGroups)) {
    return { freehand: JSON.stringify(parsed) }
  }

  if ('layer' in parsed && (parsed.polygons || parsed.polygonGroups)) {
    return { polygon: JSON.stringify(parsed) }
  }

  return {}
}

export const serializeCanvasState = (state: CanvasRuntimeState): string => {
  const freehandString = getCurrentFreehandStateString(state)
  const polygonString = getCurrentPolygonStateString(state)

  const freehand = parseStateString(freehandString)
  const polygon = parseStateString(polygonString)

  const payload = {
    version: 1,
    freehand,
    polygon
  }

  return JSON.stringify(payload)
}

export const deserializeCanvasState = (
  canvasState: CanvasRuntimeState,
  serialized: string,
  options: CanvasPersistenceOptions = {}
): boolean => {
  if (!serialized) return false

  let parsed: any
  try {
    parsed = JSON.parse(serialized)
  } catch (error) {
    console.warn('Failed to parse canvas state JSON:', error)
    return false
  }

  const { freehand, polygon } = normalizeParsedState(parsed)

  if (!freehand && !polygon) {
    console.warn('Canvas state payload missing freehand and polygon data')
    return false
  }

  if (freehand) {
    restoreFreehandState(canvasState, freehand, { handleTimeUpdate: options.handleTimeUpdate })
  }

  if (polygon) {
    restorePolygonState(canvasState, polygon)
  }

  return true
}

const downloadBlob = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const downloadCanvasState = (state: CanvasRuntimeState) => {
  const serialized = serializeCanvasState(state)
  if (!serialized) {
    console.warn('No canvas state available to download')
    return
  }

  let pretty = serialized
  try {
    pretty = JSON.stringify(JSON.parse(serialized), null, 2)
  } catch (error) {
    console.warn('Failed to pretty-print canvas state JSON:', error)
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-')
  downloadBlob(pretty, `canvas_state_${timestamp}.json`)
}

export const uploadCanvasState = (
  canvasState: CanvasRuntimeState,
  options: CanvasPersistenceOptions = {}
) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'

  input.onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return

    try {
      const content = await file.text()
      const success = deserializeCanvasState(canvasState, content, options)
      if (!success) {
        alert('Invalid canvas state file. Please upload a valid JSON export.')
        return
      }
      console.log('Canvas state restored from file:', file.name)
    } catch (error) {
      console.error('Failed to restore canvas state from file:', error)
      alert('Failed to load canvas state. Please check the console for details.')
    }
  }

  input.click()
}
