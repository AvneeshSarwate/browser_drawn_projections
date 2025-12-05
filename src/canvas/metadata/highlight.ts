import Konva from 'konva'
import type { CanvasRuntimeState } from '../canvasState'

const getHighlightLayer = (state: CanvasRuntimeState) => state.metadata.highlight.layer
const getMetadataRect = (state: CanvasRuntimeState) => state.metadata.highlight.metadataRect
const getHoverRect = (state: CanvasRuntimeState) => state.metadata.highlight.hoverRect

// Ensure highlight layer exists and is properly set up
export const ensureHighlightLayer = (state: CanvasRuntimeState, stage: Konva.Stage): Konva.Group => {
  const existingLayer = getHighlightLayer(state)
  if (existingLayer) return existingLayer

  const metadataHighlightGroup = new Konva.Group({ listening: false, name: 'metadata-highlight' })

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

  metadataHighlightGroup.add(metadataHighlightRect)
  metadataHighlightGroup.add(hoverHighlightRect)

  const overlayLayer = state.layers.overlay
  if (overlayLayer) {
    overlayLayer.add(metadataHighlightGroup)
  } else {
    const fallbackLayer = new Konva.Layer({ listening: false, name: 'metadata-highlight-layer' })
    fallbackLayer.add(metadataHighlightGroup)
    stage.add(fallbackLayer)
    fallbackLayer.moveToTop()
  }

  state.metadata.highlight.layer = metadataHighlightGroup
  state.metadata.highlight.metadataRect = metadataHighlightRect
  state.metadata.highlight.hoverRect = hoverHighlightRect
  state.groups.metadataHighlight = metadataHighlightGroup

  return metadataHighlightGroup
}

export const updateMetadataHighlight = (state: CanvasRuntimeState, node?: Konva.Node) => {
  const metadataHighlightRect = getMetadataRect(state)
  const metadataHighlightGroup = getHighlightLayer(state)
  if (!metadataHighlightRect || !metadataHighlightGroup) return

  if (!node) {
    metadataHighlightRect.visible(false)
    metadataHighlightRect.rotation(0)
    metadataHighlightGroup.getLayer()?.batchDraw()
    return
  }

  // Use the node's untransformed bounds and apply absolute transform so the outline
  // matches rotation/scale instead of an axis-aligned clientRect.
  const bbox = node.getClientRect({ skipTransform: true })
  const absScale = node.getAbsoluteScale()
  const scaleX = Math.abs(absScale.x)
  const scaleY = Math.abs(absScale.y)

  const width = bbox.width * scaleX
  const height = bbox.height * scaleY

  const absCenter = node.getAbsoluteTransform().point({
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2
  })

  metadataHighlightRect.setAttrs({
    x: absCenter.x,
    y: absCenter.y,
    width,
    height,
    offsetX: width / 2,
    offsetY: height / 2,
    rotation: node.getAbsoluteRotation(),
    visible: true
  })
  metadataHighlightGroup.getLayer()?.batchDraw()
}

export const updateHoverHighlight = (state: CanvasRuntimeState, node?: Konva.Node) => {
  const hoverHighlightRect = getHoverRect(state)
  const metadataHighlightGroup = getHighlightLayer(state)
  if (!hoverHighlightRect || !metadataHighlightGroup) return

  if (!node) {
    hoverHighlightRect.visible(false)
    hoverHighlightRect.rotation(0)
    metadataHighlightGroup.getLayer()?.batchDraw()
    return
  }

  const bbox = node.getClientRect({ skipTransform: true })
  const absScale = node.getAbsoluteScale()
  const scaleX = Math.abs(absScale.x)
  const scaleY = Math.abs(absScale.y)

  const width = bbox.width * scaleX
  const height = bbox.height * scaleY

  const absCenter = node.getAbsoluteTransform().point({
    x: bbox.x + bbox.width / 2,
    y: bbox.y + bbox.height / 2
  })

  hoverHighlightRect.setAttrs({
    x: absCenter.x,
    y: absCenter.y,
    width,
    height,
    offsetX: width / 2,
    offsetY: height / 2,
    rotation: node.getAbsoluteRotation(),
    visible: true
  })
  metadataHighlightGroup.getLayer()?.batchDraw()
}

// For backward compatibility with existing freehandTool code
export const createMetadataHighlight = (state: CanvasRuntimeState, stage: Konva.Stage): Konva.Group => {
  return ensureHighlightLayer(state, stage)
}

// Export the layer refs for tools that need direct access (for backward compatibility)
export const getMetadataHighlightLayer = (state: CanvasRuntimeState) => getHighlightLayer(state)
export const getMetadataHighlightRect = (state: CanvasRuntimeState) => getMetadataRect(state)
export const getHoverHighlightRect = (state: CanvasRuntimeState) => getHoverRect(state)
