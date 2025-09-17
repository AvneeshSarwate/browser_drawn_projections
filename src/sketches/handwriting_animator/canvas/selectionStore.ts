
import type { CanvasItem, ItemType } from './CanvasItem'
import { executeCommandWithState } from './commands'
import type { CanvasRuntimeState } from './canvasState'
import Konva from 'konva'

// State-based selection functions (not exported, used internally)
function addToState(state: CanvasRuntimeState, item: CanvasItem, additive = false) {
  if (!additive) clearState(state)
  state.selection.items.add(item)
  applyHighlight(state)
  updateGPUAndVisualization(state)
}

function removeFromState(state: CanvasRuntimeState, item: CanvasItem) {
  state.selection.items.delete(item)
  applyHighlight(state)
  updateGPUAndVisualization(state)
}

function toggleInState(state: CanvasRuntimeState, item: CanvasItem, additive = false) {
  if (state.selection.items.has(item)) {
    state.selection.items.delete(item)
  } else {
    if (!additive) clearState(state)
    state.selection.items.add(item)
  }
  applyHighlight(state)
  updateGPUAndVisualization(state)
}

function clearState(state: CanvasRuntimeState) {
  // First restore highlights while we still have the selected items
  restoreHighlights(state)
  // Then clear the selection
  state.selection.items.clear()
  updateGPUAndVisualization(state)
}

function hasInState(state: CanvasRuntimeState, item: CanvasItem): boolean {
  return state.selection.items.has(item)
}

function isEmptyInState(state: CanvasRuntimeState): boolean {
  return state.selection.items.size === 0
}

function countInState(state: CanvasRuntimeState): number {
  return state.selection.items.size
}

function containsTypeInState(state: CanvasRuntimeState, type: ItemType): boolean {
  for (const item of state.selection.items) {
    if (item.type === type) return true
  }
  return false
}

function getActiveSingleNodeFromState(state: CanvasRuntimeState) {
  return state.selection.items.size === 1 ? [...state.selection.items][0].konvaNode : null
}

// Restore highlights for all previously highlighted items
function restoreHighlights(state: CanvasRuntimeState) {
  state.selection.originalStyles.forEach((originalStyle) => {
    const node = originalStyle.node
    if (node && (node instanceof Konva.Path || node instanceof Konva.Line)) {
      node.stroke(originalStyle.stroke)
      node.strokeWidth(originalStyle.strokeWidth)
    }
  })
  state.selection.originalStyles.clear()
  
  // Redraw affected layers
  redrawAffectedLayers(state)
}

// Apply visual highlighting to currently selected items
function applyHighlight(state: CanvasRuntimeState) {
  // First restore any existing highlights
  restoreHighlights(state)

  // Apply highlights to currently selected items
  for (const item of state.selection.items) {
    const node = item.konvaNode
    if (node instanceof Konva.Path || node instanceof Konva.Line) {
      // Store original style with node reference
      state.selection.originalStyles.set(item.id, {
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
  redrawAffectedLayers(state)
}

// Helper to redraw all affected layers
function redrawAffectedLayers(state: CanvasRuntimeState) {
  const layersToRedraw = new Set<Konva.Layer>()
  
  // Add layers from currently selected items
  for (const item of state.selection.items) {
    let parent = item.konvaNode.getParent()
    while (parent && !(parent instanceof Konva.Layer)) {
      parent = parent.getParent()
    }
    if (parent instanceof Konva.Layer) {
      layersToRedraw.add(parent)
    }
  }
  
  // Add layers from previously highlighted items
  state.selection.originalStyles.forEach((style) => {
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

// Temporarily remove highlights while running a callback, then reapply so highlight state stays
// derived from the current selection. Avoids persisting highlight styling into saved snapshots.
export const withSelectionHighlightSuppressed = <T>(
  state: CanvasRuntimeState,
  fn: () => T
): T => {
  const hadHighlights = state.selection.originalStyles.size > 0
  if (hadHighlights) {
    restoreHighlights(state)
  }

  try {
    return fn()
  } finally {
    if (state.selection.items.size > 0) {
      applyHighlight(state)
    } else if (hadHighlights) {
      // Ensure layers redraw after removing highlight with no selection to reapply
      redrawAffectedLayers(state)
    }
  }
}

// Trigger updates for dependent systems
function updateGPUAndVisualization(state: CanvasRuntimeState) {
  // Use the callbacks stored in state instead of dynamic imports
  state.callbacks.freehandDataUpdate?.()
  state.callbacks.polygonDataUpdate?.()
  state.callbacks.refreshAncillaryViz?.()
}

// Metadata operations with command integration
function setMetadataForState(
  state: CanvasRuntimeState,
  item: CanvasItem,
  meta: Record<string, any> | undefined
) {
  executeCommandWithState(state, 'Edit Metadata', () => {
    item.setMetadata(meta)
    updateGPUAndVisualization(state)
  })
}

// Multi-item metadata operations
function setMetadataForSelectedInState(state: CanvasRuntimeState, meta: Record<string, any> | undefined) {
  if (state.selection.items.size === 0) return
  
  executeCommandWithState(state, 'Edit Multiple Metadata', () => {
    for (const item of state.selection.items) {
      item.setMetadata(meta)
    }
    updateGPUAndVisualization(state)
  })
}



// Public API functions expect explicit canvas state
export function add(state: CanvasRuntimeState, item: CanvasItem, additive = false) {
  addToState(state, item, additive)
}

export function remove(state: CanvasRuntimeState, item: CanvasItem) {
  removeFromState(state, item)
}

export function toggle(state: CanvasRuntimeState, item: CanvasItem, additive = false) {
  toggleInState(state, item, additive)
}

export function clear(state: CanvasRuntimeState) {
  clearState(state)
}

export function has(state: CanvasRuntimeState, item: CanvasItem): boolean {
  return hasInState(state, item)
}

export function isEmpty(state: CanvasRuntimeState): boolean {
  return isEmptyInState(state)
}

export function count(state: CanvasRuntimeState): number {
  return countInState(state)
}

export function containsType(state: CanvasRuntimeState, type: ItemType): boolean {
  return containsTypeInState(state, type)
}

export const getActiveSingleNode = (state: CanvasRuntimeState) =>
  getActiveSingleNodeFromState(state)

export function setMetadata(
  state: CanvasRuntimeState,
  item: CanvasItem,
  meta: Record<string, any> | undefined
) {
  setMetadataForState(state, item, meta)
}

export function setMetadataForSelected(state: CanvasRuntimeState, meta: Record<string, any> | undefined) {
  setMetadataForSelectedInState(state, meta)
}

// Export state-based functions for direct use with state
export const selectionStoreWithState = {
  add: addToState,
  remove: removeFromState,
  toggle: toggleInState,
  clear: clearState,
  has: hasInState,
  isEmpty: isEmptyInState,
  count: countInState,
  containsType: containsTypeInState,
  getActiveSingleNode: getActiveSingleNodeFromState,
  setMetadata: setMetadataForState,
  setMetadataForSelected: setMetadataForSelectedInState
}
