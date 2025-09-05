import Konva from 'konva'

// Global highlight state - shared across all tools
let metadataHighlightLayer: Konva.Layer | undefined = undefined
let metadataHighlightRect: Konva.Rect | undefined = undefined
let hoverHighlightRect: Konva.Rect | undefined = undefined

// Ensure highlight layer exists and is properly set up
export const ensureHighlightLayer = (stage: Konva.Stage): Konva.Layer => {
  if (metadataHighlightLayer) return metadataHighlightLayer

  metadataHighlightLayer = new Konva.Layer({ listening: false })
  
  // Red dotted border for active selection
  metadataHighlightRect = new Konva.Rect({
    stroke: 'red',
    strokeWidth: 2,
    dash: [4, 4],
    listening: false,
    visible: false
  })
  
  // Green dotted border for hover
  hoverHighlightRect = new Konva.Rect({
    stroke: 'green',
    strokeWidth: 2,
    dash: [4, 4],
    listening: false,
    visible: false
  })
  
  metadataHighlightLayer.add(metadataHighlightRect)
  metadataHighlightLayer.add(hoverHighlightRect)
  stage.add(metadataHighlightLayer)
  
  return metadataHighlightLayer
}

export const updateMetadataHighlight = (node?: Konva.Node) => {
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

export const updateHoverHighlight = (node?: Konva.Node) => {
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
export const createMetadataHighlight = (stage: Konva.Stage): Konva.Layer => {
  return ensureHighlightLayer(stage)
}

// Export the layer refs for tools that need direct access (for backward compatibility)
export const getMetadataHighlightLayer = () => metadataHighlightLayer
export const getMetadataHighlightRect = () => metadataHighlightRect
export const getHoverHighlightRect = () => hoverHighlightRect
