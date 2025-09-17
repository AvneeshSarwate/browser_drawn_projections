import Konva from 'konva'
import { watch } from 'vue'

import { pushCommandWithStates } from './commands'
import { getGlobalCanvasState } from './canvasState'
import { activeTool } from '../appState'
import type { CanvasRuntimeState } from './canvasState'

let transformer: Konva.Transformer | undefined = undefined
let transformerLayer: Konva.Layer | undefined = undefined


// State tracking for undo/redo
let dragStartState: string | null = null

// State-based transformer initialization
export function initializeTransformerWithState(state: CanvasRuntimeState, layer: Konva.Layer) {
  const transformer = new Konva.Transformer({ 
    rotateEnabled: true, 
    keepRatio: false,
    padding: 6 
  })
  
  // Add transform tracking
  transformer.on('transformstart', () => {
    startTransformTrackingWithState(state)
  })
  
  transformer.on('transformend', () => {
    finishTransformTrackingWithState(state, 'Transform')
  })
  
  layer.add(transformer)
  
  // Watch selection changes and update transformer
  watch(state.selection.selectedKonvaNodes, (selectedNodes) => {
    updateTransformerWithState(state, selectedNodes, transformer, layer)
  }, { immediate: true })
  
  return transformer
}

// Legacy function
export function initializeTransformer(layer: Konva.Layer) {
  transformerLayer = layer
  
  transformer = new Konva.Transformer({ 
    rotateEnabled: true, 
    keepRatio: false,
    padding: 6 
  })
  
  // Add transform tracking
  transformer.on('transformstart', () => {
    startTransformTracking()
  })
  
  transformer.on('transformend', () => {
    finishTransformTracking('Transform')
  })
  
  layer.add(transformer)
  
  // Watch selection changes and update transformer
  const globalState = getGlobalCanvasState()
  watch(globalState.selection.selectedKonvaNodes, (selectedNodes) => {
    updateTransformer(selectedNodes)
  }, { immediate: true })
}

// State-based transformer update
function updateTransformerWithState(state: CanvasRuntimeState, selectedNodes: Konva.Node[], transformer: Konva.Transformer, layer: Konva.Layer) {
  // Filter out nodes that shouldn't be transformed
  const filteredNodes = selectedNodes.filter(node => {
    // Skip polygons ONLY while actively in polygon edit mode
    if (node instanceof Konva.Line && getGlobalCanvasState().polygon.mode.value === 'edit' && activeTool.value === 'polygon') {
      return false
    }
    return true
  })
  
  transformer.nodes(filteredNodes)
  layer.batchDraw()
}

// Legacy function
function updateTransformer(selectedNodes: Konva.Node[]) {
  if (!transformer || !transformerLayer) return
  
  // Filter out nodes that shouldn't be transformed
  const filteredNodes = selectedNodes.filter(node => {
    // Skip polygons ONLY while actively in polygon edit mode
    if (node instanceof Konva.Line && getGlobalCanvasState().polygon.mode.value === 'edit' && activeTool.value === 'polygon') {
      return false
    }
    return true
  })
  
  transformer.nodes(filteredNodes)
  transformerLayer.batchDraw()
}

// Note: We do not change node.offset or position here.
// Konva.Transformer rotates/scales around the selection center by default.

// State-based transform tracking
function startTransformTrackingWithState(state: CanvasRuntimeState) {
  // Import dynamically to avoid circular dependencies
  import('./freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('./polygonTool').then(({ getCurrentPolygonStateString }) => {
      const startState = JSON.stringify({
        freehand: getCurrentFreehandStateString(),
        polygon: getCurrentPolygonStateString()
      })
      // Store in state rather than module global
      state.metadata.metadataText.value = startState // Temporarily using metadata field to store drag state
    })
  })
}

function finishTransformTrackingWithState(state: CanvasRuntimeState, operationName: string) {
  const dragStartState = state.metadata.metadataText.value
  if (!dragStartState) return
  
  // Import dynamically to avoid circular dependencies
  import('./freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('./polygonTool').then(({ getCurrentPolygonStateString }) => {
      const endState = JSON.stringify({
        freehand: getCurrentFreehandStateString(),
        polygon: getCurrentPolygonStateString()
      })

      if (dragStartState !== endState) {
        pushCommandWithStates(operationName, dragStartState!, endState)
      }

      state.metadata.metadataText.value = '' // Clear the temp state
    })
  })
}

// Legacy state capture for undo/redo
function startTransformTracking() {
  // Import dynamically to avoid circular dependencies
  import('./freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('./polygonTool').then(({ getCurrentPolygonStateString }) => {
      dragStartState = JSON.stringify({
        freehand: getCurrentFreehandStateString(),
        polygon: getCurrentPolygonStateString()
      })
    })
  })
}

function finishTransformTracking(operationName: string) {
  if (!dragStartState) return
  
  // Import dynamically to avoid circular dependencies
  import('./freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('./polygonTool').then(({ getCurrentPolygonStateString }) => {
      const endState = JSON.stringify({
        freehand: getCurrentFreehandStateString(),
        polygon: getCurrentPolygonStateString()
      })

      if (dragStartState !== endState) {
        pushCommandWithStates(operationName, dragStartState!, endState)
      }

      dragStartState = null
    })
  })
}

export function getTransformer(): Konva.Transformer | undefined {
  return transformer
}
