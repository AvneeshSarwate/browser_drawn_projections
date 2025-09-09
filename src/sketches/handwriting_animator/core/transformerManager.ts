import Konva from 'konva'
import { watch, computed } from 'vue'
import * as selectionStore from './selectionStore'
import { executeCommand } from './commands'
import { polygonMode } from '../polygonTool'

let transformer: Konva.Transformer | undefined = undefined
let transformerLayer: Konva.Layer | undefined = undefined
let isDragging = false

// State tracking for undo/redo
let dragStartState: string | null = null

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
  watch(selectionStore.selectedKonvaNodes, (selectedNodes) => {
    updateTransformer(selectedNodes)
  }, { immediate: true })
}

function updateTransformer(selectedNodes: Konva.Node[]) {
  if (!transformer || !transformerLayer) return
  
  // Filter out nodes that shouldn't be transformed
  const filteredNodes = selectedNodes.filter(node => {
    // Skip polygons when in edit mode (vertex editing active)
    if (node instanceof Konva.Line && polygonMode.value === 'edit') {
      return false
    }
    return true
  })
  
  // Handle group pivot locking
  if (filteredNodes.length === 1 && filteredNodes[0] instanceof Konva.Group) {
    const group = filteredNodes[0] as Konva.Group
    lockPivot(group)
  }
  
  transformer.nodes(filteredNodes)
  transformerLayer.batchDraw()
}

// Lock pivot for group transformation (preserves existing behavior)
function lockPivot(node: Konva.Group | Konva.Node) {
  //@ts-ignore
  const box = node.getClientRect({ relativeTo: node })
  node.offset({ x: box.width / 2, y: box.height / 2 })
  node.position({ x: node.x() + box.width / 2, y: node.y() + box.height / 2 })
}

// State capture for undo/redo
function startTransformTracking() {
  // Import dynamically to avoid circular dependencies
  import('../freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('../polygonTool').then(({ getCurrentPolygonStateString }) => {
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
  import('../freehandTool').then(({ getCurrentFreehandStateString }) => {
    import('../polygonTool').then(({ getCurrentPolygonStateString }) => {
      const endState = JSON.stringify({
        freehand: getCurrentFreehandStateString(),
        polygon: getCurrentPolygonStateString()
      })
      
      if (dragStartState !== endState) {
        executeCommand(operationName, () => {
          // The transformation has already been applied
          // This just captures it in the undo history
        })
      }
      
      dragStartState = null
    })
  })
}

export function getTransformer(): Konva.Transformer | undefined {
  return transformer
}
