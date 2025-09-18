import Konva from 'konva'
import type { CanvasRuntimeState } from '../canvasState'

const getHighlightLayer = (state: CanvasRuntimeState) => state.metadata.highlight.layer
const getMetadataRect = (state: CanvasRuntimeState) => state.metadata.highlight.metadataRect
const getHoverRect = (state: CanvasRuntimeState) => state.metadata.highlight.hoverRect

// Ensure highlight layer exists and is properly set up
export const ensureHighlightLayer = (state: CanvasRuntimeState, stage: Konva.Stage): Konva.Layer => {
  const existingLayer = getHighlightLayer(state)
  if (existingLayer) return existingLayer

  const metadataHighlightLayer = new Konva.Layer({ listening: false })

  // Red dotted border for active selection
  const metadataHighlightRect = new Konva.Rect({
    stroke: 'red',
    strokeWidth: 2,
    dash: [4, 4],
    listening: false,
    visible: false
  })

  // Green dotted border for hover
  const hoverHighlightRect = new Konva.Rect({
    stroke: 'green',
    strokeWidth: 2,
    dash: [4, 4],
    listening: false,
    visible: false
  })

  metadataHighlightLayer.add(metadataHighlightRect)
  metadataHighlightLayer.add(hoverHighlightRect)
  stage.add(metadataHighlightLayer)

  state.metadata.highlight.layer = metadataHighlightLayer
  state.metadata.highlight.metadataRect = metadataHighlightRect
  state.metadata.highlight.hoverRect = hoverHighlightRect
  state.layers.metadataHighlight = metadataHighlightLayer

  return metadataHighlightLayer
}

export const updateMetadataHighlight = (state: CanvasRuntimeState, node?: Konva.Node) => {
  const metadataHighlightRect = getMetadataRect(state)
  const metadataHighlightLayer = getHighlightLayer(state)
  if (!metadataHighlightRect || !metadataHighlightLayer) return

  if (!node) {
    metadataHighlightRect.visible(false)
    metadataHighlightLayer.batchDraw()
    return
  }

  const bbox = node.getClientRect({ relativeTo: node.getStage()! })
  metadataHighlightRect.setAttrs({
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    visible: true
  })
  metadataHighlightLayer.batchDraw()
}

export const updateHoverHighlight = (state: CanvasRuntimeState, node?: Konva.Node) => {
  const hoverHighlightRect = getHoverRect(state)
  const metadataHighlightLayer = getHighlightLayer(state)
  if (!hoverHighlightRect || !metadataHighlightLayer) return

  if (!node) {
    hoverHighlightRect.visible(false)
    metadataHighlightLayer.batchDraw()
    return
  }

  const bbox = node.getClientRect({ relativeTo: node.getStage()! })
  hoverHighlightRect.setAttrs({
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    visible: true
  })
  metadataHighlightLayer.batchDraw()
}

// For backward compatibility with existing freehandTool code
export const createMetadataHighlight = (state: CanvasRuntimeState, stage: Konva.Stage): Konva.Layer => {
  return ensureHighlightLayer(state, stage)
}

// Export the layer refs for tools that need direct access (for backward compatibility)
export const getMetadataHighlightLayer = (state: CanvasRuntimeState) => getHighlightLayer(state)
export const getMetadataHighlightRect = (state: CanvasRuntimeState) => getMetadataRect(state)
export const getHoverHighlightRect = (state: CanvasRuntimeState) => getHoverRect(state)
