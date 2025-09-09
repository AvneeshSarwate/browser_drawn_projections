import Konva from 'konva'
import { ref } from 'vue'
import * as selectionStore from './selectionStore'
import { getCanvasItem } from './CanvasItem'
import { executeCommand } from './commands'
import { getCurrentFreehandStateString } from '../freehandTool'
import { getCurrentPolygonStateString } from '../polygonTool'

// Drag selection state
export const dragSelectionState = ref({
  isSelecting: false,
  startPos: { x: 0, y: 0 },
  currentPos: { x: 0, y: 0 },
  isShiftHeld: false
})

let selectionRect: Konva.Rect | undefined = undefined
let selectionLayer: Konva.Layer | undefined = undefined

// Selection drag state (drag entire selection by grabbing any selected node)
const selectionDragState = {
  isDragging: false,
  startPos: { x: 0, y: 0 },
  startNodePositions: new Map<Konva.Node, { x: number, y: number }>(),
  beforeState: '' as string
}

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
    // Escalate to top-most group whose parent is a Layer
    let node: Konva.Node = e.target
    let parent = node.getParent()
    while (parent && !(parent instanceof Konva.Layer)) {
      node = parent
      parent = node.getParent()
    }

    const item = getCanvasItem(node)
    if (item) {
      // Update selection depending on modifier and whether the clicked item is already selected
      const wasSelected = selectionStore.has(item)
      if (e.evt.shiftKey) {
        selectionStore.toggle(item, true)
      } else if (!wasSelected) {
        selectionStore.clear()
        selectionStore.add(item, true)
      }

      // Start selection drag if the clicked item is (now) part of the selection
      const nowSelected = selectionStore.has(item)
      if (nowSelected) {
        startSelectionDrag(stage)
      }
      return
    }
  }

  // If clicking on empty space, prepare for drag selection or clear selection
  // Start drag selection; whether to clear will be decided on pointer up
  dragSelectionState.value = {
    isSelecting: true,
    startPos: { x: pos.x, y: pos.y },
    currentPos: { x: pos.x, y: pos.y },
    isShiftHeld: e.evt.shiftKey
  }
  resetSelectionRect(pos.x, pos.y)
}

export function handleSelectPointerMove(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  // Selection drag has priority
  if (selectionDragState.isDragging) {
    updateSelectionDrag(stage)
    return
  }
  if (!dragSelectionState.value.isSelecting) return
  
  const pos = stage.getPointerPosition()
  if (!pos) return

  dragSelectionState.value.currentPos = { x: pos.x, y: pos.y }
  updateSelectionRect()
}

export function handleSelectPointerUp(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  // Finish selection drag if active
  if (selectionDragState.isDragging) {
    finishSelectionDrag()
    return
  }

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
  
  // Helper: filter only selectable nodes (exclude transformers and helpers)
  const isSelectableNode = (node: Konva.Node): boolean => {
    if (node instanceof Konva.Transformer) return false
    return node instanceof Konva.Path || node instanceof Konva.Line || node instanceof Konva.Group
  }

  // Check all layers that contain selectable items
  const layersToCheck: Konva.Layer[] = []
  
  // Find freehand and polygon layers dynamically
  const stage = selectionLayer?.getStage()
  if (stage) {
    stage.getLayers().forEach(layer => {
      // Check if this layer contains selectable content
      const hasSelectableItems = layer.getChildren().some(child => isSelectableNode(child))
      if (hasSelectableItems) {
        layersToCheck.push(layer)
      }
    })
  }
  
  // Check all selectable nodes in the found layers
  layersToCheck.forEach(layer => {
    layer.getChildren().forEach(node => {
      if (!isSelectableNode(node)) return
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

// ---------------- Selection Drag Implementation ----------------

function startSelectionDrag(stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos) return
  selectionDragState.isDragging = true
  selectionDragState.startPos = { x: pos.x, y: pos.y }
  selectionDragState.startNodePositions.clear()

  // Capture before-state for undo/redo
  selectionDragState.beforeState = JSON.stringify({
    freehand: getCurrentFreehandStateString(),
    polygon: getCurrentPolygonStateString()
  })

  // Store absolute start positions so we can move across different parents
  const nodes = selectionStore.selectedKonvaNodes.value
  nodes.forEach(node => {
    const abs = node.getAbsolutePosition()
    selectionDragState.startNodePositions.set(node, { x: abs.x, y: abs.y })
  })
}

function updateSelectionDrag(stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos) return
  const dx = pos.x - selectionDragState.startPos.x
  const dy = pos.y - selectionDragState.startPos.y

  selectionDragState.startNodePositions.forEach((startPos, node) => {
    node.absolutePosition({ x: startPos.x + dx, y: startPos.y + dy })
  })

  // Redraw affected layers
  const layers = new Set<Konva.Layer>()
  selectionDragState.startNodePositions.forEach((_, node) => {
    let p = node.getParent()
    while (p && !(p instanceof Konva.Layer)) p = p.getParent()
    if (p instanceof Konva.Layer) layers.add(p)
  })
  layers.forEach(l => l.batchDraw())
}

function finishSelectionDrag() {
  // Capture after-state and push a unified command if changed
  const afterState = JSON.stringify({
    freehand: getCurrentFreehandStateString(),
    polygon: getCurrentPolygonStateString()
  })

  if (selectionDragState.beforeState !== afterState) {
    // Use executeCommand wrapper; the action is a no-op because changes already applied
    executeCommand('Move Selection', () => { /* movement already applied */ })
  }

  selectionDragState.isDragging = false
  selectionDragState.startNodePositions.clear()
}
