import { shallowReactive, computed } from 'vue'
import type { CanvasItem, ItemType } from './CanvasItem'
import { executeCommand } from './commands'
import Konva from 'konva'

// Selection storage - reactive set for UI updates
export const selected = shallowReactive<Set<CanvasItem>>(new Set())

// Original styling storage for highlights - store node reference to avoid lookup issues
const originalStyles = new Map<string, { node: Konva.Node, stroke: string, strokeWidth: number }>()

export function add(item: CanvasItem, additive = false) {
  if (!additive) clear()
  selected.add(item)
  applyHighlight()
  updateGPUAndVisualization()
}

export function remove(item: CanvasItem) {
  selected.delete(item)
  applyHighlight()
  updateGPUAndVisualization()
}

export function toggle(item: CanvasItem, additive = false) {
  if (selected.has(item)) {
    selected.delete(item)
  } else {
    if (!additive) clear()
    selected.add(item)
  }
  applyHighlight()
  updateGPUAndVisualization()
}

export function clear() {
  // First restore highlights while we still have the selected items
  restoreHighlights()
  // Then clear the selection
  selected.clear()
  updateGPUAndVisualization()
}

export function has(item: CanvasItem): boolean {
  return selected.has(item)
}

export function isEmpty(): boolean {
  return selected.size === 0
}

export function count(): number {
  return selected.size
}

export function containsType(type: ItemType): boolean {
  for (const item of selected) {
    if (item.type === type) return true
  }
  return false
}

// For feeding the transformer
export const selectedKonvaNodes = computed(() => 
  [...selected].map(item => item.konvaNode)
)

export const getActiveSingleNode = () =>
  selected.size === 1 ? [...selected][0].konvaNode : null

// Restore highlights for all previously highlighted items
function restoreHighlights() {
  originalStyles.forEach((originalStyle) => {
    const node = originalStyle.node
    if (node && (node instanceof Konva.Path || node instanceof Konva.Line)) {
      node.stroke(originalStyle.stroke)
      node.strokeWidth(originalStyle.strokeWidth)
    }
  })
  originalStyles.clear()
  
  // Redraw affected layers
  redrawAffectedLayers()
}

// Apply visual highlighting to currently selected items
function applyHighlight() {
  // First restore any existing highlights
  restoreHighlights()

  // Apply highlights to currently selected items
  for (const item of selected) {
    const node = item.konvaNode
    if (node instanceof Konva.Path || node instanceof Konva.Line) {
      // Store original style with node reference
      originalStyles.set(item.id, {
        node: node,
        stroke: node.stroke() as string,
        strokeWidth: node.strokeWidth()
      })
      
      // Apply highlight
      node.stroke('#ff6b35') // Orange highlight
      node.strokeWidth(4)
    }
  }

  // Redraw affected layers
  redrawAffectedLayers()
}

// Helper to redraw all affected layers
function redrawAffectedLayers() {
  const layersToRedraw = new Set<Konva.Layer>()
  
  // Add layers from currently selected items
  for (const item of selected) {
    let parent = item.konvaNode.getParent()
    while (parent && !(parent instanceof Konva.Layer)) {
      parent = parent.getParent()
    }
    if (parent instanceof Konva.Layer) {
      layersToRedraw.add(parent)
    }
  }
  
  // Add layers from previously highlighted items
  originalStyles.forEach((style) => {
    let parent = style.node.getParent()
    while (parent && !(parent instanceof Konva.Layer)) {
      parent = parent.getParent()
    }
    if (parent instanceof Konva.Layer) {
      layersToRedraw.add(parent)
    }
  })
  
  layersToRedraw.forEach(layer => layer.batchDraw())
}

// Trigger updates for dependent systems
function updateGPUAndVisualization() {
  // Import the update functions dynamically to avoid circular deps
  import('./freehandTool').then(({ updateBakedStrokeData }) => {
    updateBakedStrokeData()
  })
  
  import('./polygonTool').then(({ updateBakedPolygonData }) => {
    updateBakedPolygonData()
  })

  // Refresh ancillary visualizations if available
  import('./ancillaryVisualizations').then(({ refreshAnciliaryViz }) => {
    refreshAnciliaryViz()
  }).catch(() => {
    // Ancillary viz might not be available, that's okay
  })
}

// Metadata operations with command integration
export function setMetadata(
  item: CanvasItem,
  meta: Record<string, any> | undefined
) {
  executeCommand('Edit Metadata', () => {
    item.setMetadata(meta)
    updateGPUAndVisualization()
  })
}

// Multi-item metadata operations
export function setMetadataForSelected(meta: Record<string, any> | undefined) {
  if (selected.size === 0) return
  
  executeCommand('Edit Multiple Metadata', () => {
    for (const item of selected) {
      item.setMetadata(meta)
    }
    updateGPUAndVisualization()
  })
}
