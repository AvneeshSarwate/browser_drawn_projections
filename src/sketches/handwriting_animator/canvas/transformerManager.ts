import Konva from 'konva'
import { watch } from 'vue'

import { pushCommandWithStates } from './commands'
import type { CanvasRuntimeState } from './canvasState'

const createTransformer = (state: CanvasRuntimeState, layer: Konva.Layer) => {
  state.layers.transformerLayer = layer
  const transformer = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: false,
    padding: 6
  })

  state.layers.transformer = transformer

  transformer.on('transformstart', () => {
    startTransformTrackingWithState(state)
  })

  transformer.on('transformend', () => {
    finishTransformTrackingWithState(state, 'Transform')
  })

  layer.add(transformer)

  watch(state.selection.selectedKonvaNodes, (selectedNodes) => {
    updateTransformerWithState(state, selectedNodes)
  }, { immediate: true })

  return transformer
}

export function initializeTransformerWithState(state: CanvasRuntimeState, layer: Konva.Layer) {
  return createTransformer(state, layer)
}

export function initializeTransformer(state: CanvasRuntimeState, layer: Konva.Layer) {
  createTransformer(state, layer)
}

// State-based transformer update
function updateTransformerWithState(state: CanvasRuntimeState, selectedNodes: Konva.Node[]) {
  const transformer = state.layers.transformer
  const layer = state.layers.transformerLayer
  if (!transformer || !layer) return

  // Filter out nodes that shouldn't be transformed
  const filteredNodes = selectedNodes.filter(node => {
    // Skip polygons ONLY while actively in polygon edit mode
    if (node instanceof Konva.Line && state.polygon.mode.value === 'edit' && state.activeTool.value === 'polygon') {
      return false
    }
    return true
  })

  transformer.nodes(filteredNodes)
  layer.batchDraw()
}

// Note: We do not change node.offset or position here.
// Konva.Transformer rotates/scales around the selection center by default.

// State-based transform tracking
function startTransformTrackingWithState(state: CanvasRuntimeState) {
  // Import dynamically to avoid circular dependencies
  import('./freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('./polygonTool').then(({ getCurrentPolygonStateString }) => {
      const startState = JSON.stringify({
        freehand: getCurrentFreehandStateString(state),
        polygon: getCurrentPolygonStateString(state)
      })
      // Store in state rather than module global
      state.selection.transformStartState = startState
    })
  })
}

function finishTransformTrackingWithState(state: CanvasRuntimeState, operationName: string) {
  const dragStartState = state.selection.transformStartState
  if (!dragStartState) return
  
  // Import dynamically to avoid circular dependencies
  import('./freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('./polygonTool').then(({ getCurrentPolygonStateString }) => {
      const endState = JSON.stringify({
        freehand: getCurrentFreehandStateString(state),
        polygon: getCurrentPolygonStateString(state)
      })

      if (dragStartState !== endState) {
        pushCommandWithStates(state, operationName, dragStartState!, endState)
      }

      state.selection.transformStartState = ''
    })
  })
}
