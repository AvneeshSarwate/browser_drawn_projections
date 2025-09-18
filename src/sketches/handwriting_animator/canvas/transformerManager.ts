import Konva from 'konva'
import { watch } from 'vue'

import { pushCommandWithStates } from './commands'
import { activeTool } from '../appState'
import type { CanvasRuntimeState } from './canvasState'

let transformer: Konva.Transformer | undefined = undefined
let transformerLayer: Konva.Layer | undefined = undefined
const createTransformer = (state: CanvasRuntimeState, layer: Konva.Layer) => {
  transformerLayer = layer
  transformer = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: false,
    padding: 6
  })

  transformer.on('transformstart', () => {
    startTransformTrackingWithState(state)
  })

  transformer.on('transformend', () => {
    finishTransformTrackingWithState(state, 'Transform')
  })

  layer.add(transformer)

  watch(state.selection.selectedKonvaNodes, (selectedNodes) => {
    if (!transformer || !transformerLayer) return
    updateTransformerWithState(state, selectedNodes, transformer, transformerLayer)
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
function updateTransformerWithState(state: CanvasRuntimeState, selectedNodes: Konva.Node[], transformer: Konva.Transformer, layer: Konva.Layer) {
  // Filter out nodes that shouldn't be transformed
  const filteredNodes = selectedNodes.filter(node => {
    // Skip polygons ONLY while actively in polygon edit mode
    if (node instanceof Konva.Line && state.polygon.mode.value === 'edit' && activeTool.value === 'polygon') {
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
        freehand: getCurrentFreehandStateString(state),
        polygon: getCurrentPolygonStateString(state)
      })

      if (dragStartState !== endState) {
        pushCommandWithStates(state, operationName, dragStartState!, endState)
      }

      state.metadata.metadataText.value = '' // Clear the temp state
    })
  })
}


export function getTransformer(): Konva.Transformer | undefined {
  return transformer
}
