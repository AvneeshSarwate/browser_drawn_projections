import Konva from 'konva'
import { ref } from 'vue'
import * as selectionStore from './selectionStore'
import { getCanvasItem } from './CanvasItem'

// Drag selection state
export const dragSelectionState = ref({
  isSelecting: false,
  startPos: { x: 0, y: 0 },
  currentPos: { x: 0, y: 0 },
  isShiftHeld: false
})

let selectionRect: Konva.Rect | undefined = undefined
let selectionLayer: Konva.Layer | undefined = undefined

export function initializeSelectTool(layer: Konva.Layer) {
  selectionLayer = layer
  
  selectionRect = new Konva.Rect({
    stroke: '#4A90E2',
    strokeWidth: 1,
    dash: [3, 3],
    fill: 'rgba(74, 144, 226, 0.1)',
    listening: false,
    visible: false
  })
  selectionLayer.add(selectionRect)
}

export function handleSelectPointerDown(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  const pos = stage.getPointerPosition()
  if (!pos) return

  // If clicking on a shape, handle selection
  if (e.target !== stage) {
    const item = getCanvasItem(e.target)
    if (item) {
      selectionStore.toggle(item, e.evt.shiftKey)
      return
    }
  }

  // If clicking on empty space, prepare for drag selection or clear selection
  if (!e.evt.shiftKey) {
    // Will clear selection if this ends up being just a click (not a drag)
    dragSelectionState.value = {
      isSelecting: true,
      startPos: { x: pos.x, y: pos.y },
      currentPos: { x: pos.x, y: pos.y },
      isShiftHeld: e.evt.shiftKey
    }
    
    resetSelectionRect(pos.x, pos.y)
  }
}

export function handleSelectPointerMove(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  if (!dragSelectionState.value.isSelecting) return
  
  const pos = stage.getPointerPosition()
  if (!pos) return

  dragSelectionState.value.currentPos = { x: pos.x, y: pos.y }
  updateSelectionRect()
}

export function handleSelectPointerUp(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  if (!dragSelectionState.value.isSelecting) return

  completeSelectionRect(dragSelectionState.value.isShiftHeld)
  
  dragSelectionState.value.isSelecting = false
}

function resetSelectionRect(x: number, y: number) {
  if (!selectionRect) return
  selectionRect.setAttrs({
    x: x,
    y: y,
    width: 0,
    height: 0,
    visible: false
  })
}

function updateSelectionRect() {
  if (!selectionRect || !dragSelectionState.value.isSelecting) return
  
  const { startPos, currentPos } = dragSelectionState.value
  const minX = Math.min(startPos.x, currentPos.x)
  const minY = Math.min(startPos.y, currentPos.y)
  const width = Math.abs(currentPos.x - startPos.x)
  const height = Math.abs(currentPos.y - startPos.y)
  
  selectionRect.setAttrs({
    x: minX,
    y: minY,
    width,
    height,
    visible: width > 5 || height > 5 // Only show if significant drag
  })
  selectionLayer?.batchDraw()
}

function completeSelectionRect(isShiftHeld: boolean = false) {
  if (!selectionRect) return
  
  // Check if this was actually a drag based on pointer movement, not rectangle size
  const { startPos, currentPos } = dragSelectionState.value
  const dx = Math.abs(currentPos.x - startPos.x)
  const dy = Math.abs(currentPos.y - startPos.y)
  const wasDragged = dx >= 5 || dy >= 5
  
  if (!wasDragged) {
    // This was just a click, not a drag - clear selection if not holding shift
    if (!isShiftHeld) {
      selectionStore.clear()
    }
    // Hide selection rectangle and return
    selectionRect.visible(false)
    selectionLayer?.batchDraw()
    return
  }
  
  // This was a drag - handle drag selection
  const intersectingItems: any[] = []
  
  // Get the actual rectangle dimensions for intersection testing
  const rectBox = selectionRect.getClientRect()
  
  // Check all layers that contain selectable items
  const layersToCheck: Konva.Layer[] = []
  
  // Find freehand and polygon layers dynamically
  const stage = selectionLayer?.getStage()
  if (stage) {
    stage.getLayers().forEach(layer => {
      // Check if this layer contains selectable content
      const hasSelectableItems = layer.getChildren().some(child => 
        child instanceof Konva.Path || 
        child instanceof Konva.Line ||
        child instanceof Konva.Group
      )
      if (hasSelectableItems) {
        layersToCheck.push(layer)
      }
    })
  }
  
  // Check all selectable nodes in the found layers
  layersToCheck.forEach(layer => {
    layer.getChildren().forEach(node => {
      if (node instanceof Konva.Path || node instanceof Konva.Line || node instanceof Konva.Group) {
        const nodeBox = node.getClientRect()
        
        // Check if rectangles intersect
        if (!(rectBox.x + rectBox.width < nodeBox.x || 
              nodeBox.x + nodeBox.width < rectBox.x ||
              rectBox.y + rectBox.height < nodeBox.y ||
              nodeBox.y + nodeBox.height < rectBox.y)) {
          const item = getCanvasItem(node)
          if (item) {
            intersectingItems.push(item)
          }
        }
      }
    })
  })
  
  // Clear existing selection if not holding shift
  if (!isShiftHeld) {
    selectionStore.clear()
  }
  
  // Add intersecting items to selection
  intersectingItems.forEach(item => selectionStore.add(item, true)) // additive = true
  
  // Hide and reset selection rectangle to prevent stale data
  selectionRect.setAttrs({ x: 0, y: 0, width: 0, height: 0, visible: false })
  selectionLayer?.batchDraw()
}
