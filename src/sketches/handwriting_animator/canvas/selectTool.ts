import Konva from 'konva'

import * as selectionStore from './selectionStore'
import { getCanvasItem, createGroupItem, createPolygonItem, removeCanvasItem } from './CanvasItem'
import { getGlobalCanvasState, polygonShapes, freehandStrokes, freehandStrokeGroups } from './canvasState'

import { executeCommand } from './commands'
import { globalStore } from '../appState'
import { getCurrentFreehandStateString, deepCloneWithNewIds, updateBakedStrokeData, updateTimelineState, refreshStrokeConnections } from './freehandTool'
import { getCurrentPolygonStateString, attachPolygonHandlers, serializePolygonState, updateBakedPolygonData } from './polygonTool'
import { hasAncestorConflict } from './canvasUtils'
import { uid } from './canvasUtils'
import { pushCommandWithStates } from './commands'



const store = globalStore()


export function initializeSelectTool(layer: Konva.Layer) {
  const state = getGlobalCanvasState()
  state.layers.selectionOverlay = layer
  
  state.selection.selectionRect = new Konva.Rect({
    stroke: '#4A90E2',
    strokeWidth: 1,
    dash: [3, 3],
    fill: 'rgba(74, 144, 226, 0.1)',
    listening: false,
    visible: false
  })
  layer.add(state.selection.selectionRect)
}

export function handleSelectPointerDown(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  const state = getGlobalCanvasState()
  const pos = stage.getPointerPosition()
  if (!pos) return

  // Ignore interactions that begin on the transformer or its handles
  const isInTransformer = (node: Konva.Node): boolean => {
    let cur: Konva.Node | null = node
    while (cur && !(cur instanceof Konva.Stage)) {
      if (cur instanceof Konva.Transformer) return true
      cur = cur.getParent() as Konva.Node | null
    }
    return false
  }

  if (e.target && isInTransformer(e.target)) {
    // Let transformer manage transform; do not interfere with selection state or start drag-select
    return
  }

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

  // If clicking on empty canvas area (stage or any layer), prepare drag selection.
  // Transformer handles are already excluded above.
  if (e.target === stage || (e.target instanceof Konva.Layer)) {
    state.selection.dragSelectionState.value = {
      isSelecting: true,
      startPos: { x: pos.x, y: pos.y },
      currentPos: { x: pos.x, y: pos.y },
      isShiftHeld: e.evt.shiftKey
    }
    resetSelectionRect(pos.x, pos.y)
  }
}

export function handleSelectPointerMove(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  const state = getGlobalCanvasState()
  // Selection drag has priority
  if (state.selection.selectionDragState.isDragging) {
    updateSelectionDrag(stage)
    return
  }
  if (!state.selection.dragSelectionState.value.isSelecting) return
  
  const pos = stage.getPointerPosition()
  if (!pos) return

  state.selection.dragSelectionState.value.currentPos = { x: pos.x, y: pos.y }
  updateSelectionRect()
}

export function handleSelectPointerUp(stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  const state = getGlobalCanvasState()
  // Finish selection drag if active
  if (state.selection.selectionDragState.isDragging) {
    finishSelectionDrag()
    return
  }

  if (!state.selection.dragSelectionState.value.isSelecting) return

  completeSelectionRect(state.selection.dragSelectionState.value.isShiftHeld)
  state.selection.dragSelectionState.value.isSelecting = false
}

function resetSelectionRect(x: number, y: number) {
  const state = getGlobalCanvasState()
  if (!state.selection.selectionRect) return
  state.selection.selectionRect.setAttrs({
    x: x,
    y: y,
    width: 0,
    height: 0,
    visible: false
  })
}

function updateSelectionRect() {
  const state = getGlobalCanvasState()
  if (!state.selection.selectionRect || !state.selection.dragSelectionState.value.isSelecting) return
  
  const { startPos, currentPos } = state.selection.dragSelectionState.value
  const minX = Math.min(startPos.x, currentPos.x)
  const minY = Math.min(startPos.y, currentPos.y)
  const width = Math.abs(currentPos.x - startPos.x)
  const height = Math.abs(currentPos.y - startPos.y)
  
  state.selection.selectionRect.setAttrs({
    x: minX,
    y: minY,
    width,
    height,
    visible: width > 5 || height > 5 // Only show if significant drag
  })
  state.layers.selectionOverlay?.batchDraw()
}

function completeSelectionRect(isShiftHeld: boolean = false) {
  const state = getGlobalCanvasState()
  if (!state.selection.selectionRect) return
  
  // Check if this was actually a drag based on pointer movement, not rectangle size
  const { startPos, currentPos } = state.selection.dragSelectionState.value
  const dx = Math.abs(currentPos.x - startPos.x)
  const dy = Math.abs(currentPos.y - startPos.y)
  const wasDragged = dx >= 5 || dy >= 5
  
  if (!wasDragged) {
    // This was just a click, not a drag - clear selection if not holding shift
    if (!isShiftHeld) {
      selectionStore.clear()
    }
    // Hide selection rectangle and return
    state.selection.selectionRect.visible(false)
    state.layers.selectionOverlay?.batchDraw()
    return
  }
  
  // This was a drag - handle drag selection
  const intersectingItems: any[] = []
  
  // Get the actual rectangle dimensions for intersection testing
  const rectBox = state.selection.selectionRect.getClientRect()
  
  // Helper: filter only selectable nodes (exclude transformers and helpers)
  const isSelectableNode = (node: Konva.Node): boolean => {
    if (node instanceof Konva.Transformer) return false
    return node instanceof Konva.Path || node instanceof Konva.Line || node instanceof Konva.Group
  }

  // Check only canonical shape layers to avoid accidental matches in helper/preview layers
  const layersToCheck: Konva.Layer[] = []
  const stage = state.layers.selectionOverlay?.getStage()
  if (stage) {
    const freehandShapeLayer = getGlobalCanvasState().layers.freehandShape
    if (freehandShapeLayer) layersToCheck.push(freehandShapeLayer)
    const polygonShapesLayer = getGlobalCanvasState().layers.polygonShapes
  if (polygonShapesLayer) layersToCheck.push(polygonShapesLayer)
    // Fallback: if neither available, scan for layers with selectable content
    if (layersToCheck.length === 0) {
      stage.getLayers().forEach(layer => {
        const hasSelectableItems = layer.getChildren().some(child => isSelectableNode(child))
        if (hasSelectableItems) layersToCheck.push(layer)
      })
    }
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
    updateTimelineState()
  }
  
  // Add intersecting items to selection
  intersectingItems.forEach(item => selectionStore.add(item, true)) // additive = true
  
  // Hide and reset selection rectangle to prevent stale data
  state.selection.selectionRect.setAttrs({ x: 0, y: 0, width: 0, height: 0, visible: false })
  state.layers.selectionOverlay?.batchDraw()
}

// ---------------- Selection Drag Implementation ----------------

function startSelectionDrag(stage: Konva.Stage) {
  const state = getGlobalCanvasState()
  const pos = stage.getPointerPosition()
  if (!pos) return
  state.selection.selectionDragState.isDragging = true
  state.selection.selectionDragState.startPos = { x: pos.x, y: pos.y }
  state.selection.selectionDragState.startNodePositions.clear()

  // Capture before-state for undo/redo
  state.selection.selectionDragState.beforeState = JSON.stringify({
    freehand: getCurrentFreehandStateString(),
    polygon: getCurrentPolygonStateString()
  })

  // Store absolute start positions so we can move across different parents
  const nodes = state.selection.selectedKonvaNodes.value
  nodes.forEach(node => {
    const abs = node.getAbsolutePosition()
    state.selection.selectionDragState.startNodePositions.set(node, { x: abs.x, y: abs.y })
  })
}

function updateSelectionDrag(stage: Konva.Stage) {
  const state = getGlobalCanvasState()
  const pos = stage.getPointerPosition()
  if (!pos) return
  const dx = pos.x - state.selection.selectionDragState.startPos.x
  const dy = pos.y - state.selection.selectionDragState.startPos.y

  state.selection.selectionDragState.startNodePositions.forEach((startPos, node) => {
    node.absolutePosition({ x: startPos.x + dx, y: startPos.y + dy })
  })

  // Redraw affected layers
  const layers = new Set<Konva.Layer>()
  state.selection.selectionDragState.startNodePositions.forEach((_, node) => {
    let p = node.getParent()
    while (p && !(p instanceof Konva.Layer)) p = p.getParent()
    if (p instanceof Konva.Layer) layers.add(p)
  })
  layers.forEach(l => l.batchDraw())
}

function finishSelectionDrag() {
  const state = getGlobalCanvasState()
  // Capture after-state and push a unified command if changed
  const afterState = JSON.stringify({
    freehand: getCurrentFreehandStateString(),
    polygon: getCurrentPolygonStateString()
  })

  if (state.selection.selectionDragState.beforeState !== afterState) {
    // Push command with captured states so undo/redo works
    pushCommandWithStates('Move Selection', state.selection.selectionDragState.beforeState, afterState)
  }

  state.selection.selectionDragState.isDragging = false
  state.selection.selectionDragState.startNodePositions.clear()
}

// ---------------- Grouping / Ungrouping (freehand-only groups) ----------------

function getSelectedNodes(): Konva.Node[] {
  const state = getGlobalCanvasState()
  return state.selection.selectedKonvaNodes.value
}

function nodeLayer(node: Konva.Node): Konva.Layer | null {
  let p: Konva.Node | null = node
  while (p && !(p instanceof Konva.Layer)) p = p.getParent() as Konva.Node | null
  return (p instanceof Konva.Layer) ? p : null
}

// Preserve visual appearance when reparenting by recomputing local transform
function reparentPreserveAbsolute(node: Konva.Node, newParent: Konva.Container) {
  const absBefore = node.getAbsoluteTransform().copy()
  node.moveTo(newParent)
  const parentAbs = (newParent as unknown as Konva.Node).getAbsoluteTransform().copy()
  parentAbs.invert()
  const local = parentAbs.multiply(absBefore)
  const dec = local.decompose()
  node.setAttrs({
    x: dec.x,
    y: dec.y,
    scaleX: dec.scaleX,
    scaleY: dec.scaleY,
    rotation: dec.rotation,
    skewX: dec.skewX,
    skewY: dec.skewY
  })
}

export function canGroupSelection(): boolean {
  const nodes = getSelectedNodes()
  if (nodes.length < 1) return false
  // Polygons cannot participate
  if (nodes.some(n => n instanceof Konva.Line)) return false
  // Must all be in the same layer
  const layers = new Set(nodes.map(n => nodeLayer(n)))
  if (layers.size !== 1) return false
  // Groupable nodes are Paths or Groups
  const groupable = nodes.filter(n => (n instanceof Konva.Path) || (n instanceof Konva.Group))
  if (groupable.length < 1) return false
  // Prevent ancestor/descendant conflicts
  if (hasAncestorConflict(groupable)) return false
  return true
}

export function groupSelection() {
  if (!canGroupSelection()) return
  const nodes = getSelectedNodes().filter(n => (n instanceof Konva.Path) || (n instanceof Konva.Group))
  if (nodes.length < 1) return

  executeCommand('Group Selection', () => {
    // Use top-level nodes only (no descendant/ancestor pairs)
    const topLevel = nodes.filter(node => !nodes.some(other => other !== node && other.isAncestorOf(node)))
    // Determine common parent or fallback to layer of first node
    const targetLayer = nodeLayer(topLevel[0])
    if (!targetLayer) return
    let commonParent: Konva.Container = topLevel[0].getParent() as Konva.Container
    if (!topLevel.every(n => n.getParent() === commonParent)) commonParent = targetLayer

    const superGroup = new Konva.Group({ draggable: false })
    commonParent.add(superGroup)

    topLevel.forEach((node) => {
      reparentPreserveAbsolute(node, superGroup)
    })

    // Register group and select it
    const item = createGroupItem(getGlobalCanvasState(), superGroup)
    selectionStore.clear()
    selectionStore.add(item)

    superGroup.getLayer()?.batchDraw()
    updateBakedStrokeData(getGlobalCanvasState(), store.appStateRef)
  })
}

export function canUngroupSelection(): boolean {
  const nodes = getSelectedNodes()
  if (nodes.length !== 1) return false
  // Polygons cannot participate
  if (nodes[0] instanceof Konva.Line) return false
  return nodes[0] instanceof Konva.Group
}

export function ungroupSelection() {
  if (!canUngroupSelection()) return
  const grp = getSelectedNodes()[0] as Konva.Group
  const parent = grp.getParent()
  if (!parent) return

  executeCommand('Ungroup Selection', () => {
    const children = [...grp.getChildren()]
    children.forEach(child => {
      reparentPreserveAbsolute(child, parent)
      child.draggable(false)
    })

    const id = grp.id()
    grp.destroy()
    removeCanvasItem(id)

    selectionStore.clear()
    parent.getLayer()?.batchDraw()
    // Rebuild stroke connections after ungroup to keep data in sync
    try { refreshStrokeConnections() } catch {
      console.error('refreshStrokeConnections failed')
    }
    updateBakedStrokeData(getGlobalCanvasState(), store.appStateRef)
  })
}

// ---------------- Duplicate / Delete (unified) ----------------

function getTopLevelSelectedNodes(): Konva.Node[] {
  const state = getGlobalCanvasState()
  const nodes = state.selection.selectedKonvaNodes.value
  // keep only nodes that are not descendants of any other selected node
  return nodes.filter((node) => !nodes.some((other) => other !== node && other.isAncestorOf(node)))
}

export function duplicateSelection() {
  const state = getGlobalCanvasState()
  const freehandShapeLayer = state.layers.freehandShape
  const selectedNodes = state.selection.selectedKonvaNodes.value
  if (selectedNodes.length === 0) return

  executeCommand('Duplicate', () => {
    const topLevelNodes = getTopLevelSelectedNodes()
    const duplicates: Konva.Node[] = []

    topLevelNodes.forEach((node) => {
      // Freehand strokes and groups
      if (node instanceof Konva.Path || node instanceof Konva.Group) {
        const dup = deepCloneWithNewIds(node, 50, 50)
        const parent = node.getParent()
        if (parent) parent.add(dup)
        duplicates.push(dup)
      }
      // Polygons
      else if (node instanceof Konva.Line) {
        const clone = node.clone({ x: node.x() + 50, y: node.y() + 50 }) as Konva.Line
        // assign new id and register in polygon state
        const newId = uid('poly_')
        clone.id(newId)
        const parent = node.getParent()
        if (parent) parent.add(clone)

        // register data structures and handlers
        createPolygonItem(getGlobalCanvasState(), clone)
        attachPolygonHandlers(clone)
        polygonShapes().set(newId, {
          id: newId,
          points: [...clone.points()],
          closed: !!clone.closed(),
          creationTime: Date.now(),
          konvaShape: clone
        } as any)

        duplicates.push(clone)
      }
    })

    // Update selection to new duplicates
    selectionStore.clear()
    duplicates.forEach((node) => {
      const item = getCanvasItem(node)
      if (item) selectionStore.add(item, true)
    })

    // Refresh visuals/state
    freehandShapeLayer?.batchDraw()
    getGlobalCanvasState().layers.polygonShapes?.batchDraw()
    updateBakedStrokeData(getGlobalCanvasState(), store.appStateRef)
    updateBakedPolygonData(getGlobalCanvasState(), store.appStateRef)
    serializePolygonState(getGlobalCanvasState(), store.appStateRef)
  })
}

export function deleteSelection() {
  const state = getGlobalCanvasState()
  const freehandShapeLayer = state.layers.freehandShape
  const selectedNodes = state.selection.selectedKonvaNodes.value
  if (selectedNodes.length === 0) return

  executeCommand('Delete Selected', () => {
    const topLevelNodes = getTopLevelSelectedNodes()

    topLevelNodes.forEach((node) => {
      // Collect descendants we need to clean from registries before destroy
      const collect: Konva.Node[] = []
      const walk = (n: Konva.Node) => {
        collect.push(n)
        if (n instanceof Konva.Container) {
          n.getChildren().forEach((c) => walk(c))
        }
      }
      walk(node)

      // Remove registry/state entries for all collected nodes
      collect.forEach((n) => {
        // Freehand stroke record cleanup
        if (n instanceof Konva.Path) {
          // delete stroke entry matching this node id or shape
          freehandStrokes().delete(n.id())
          // fallback: by shape reference
          Array.from(freehandStrokes().entries()).forEach(([id, s]) => {
            if (s.shape === n) freehandStrokes().delete(id)
          })
          // remove from any group stroke lists
          Array.from(freehandStrokeGroups().values()).forEach((g) => {
            g.strokeIds = g.strokeIds.filter((sid) => sid !== n.id())
          })
        }
        // Freehand group record cleanup
        if (n instanceof Konva.Group) {
          freehandStrokeGroups().delete(n.id())
        }
        // Polygon record cleanup
        if (n instanceof Konva.Line) {
          polygonShapes().delete(n.id())
        }
        // Remove from CanvasItem registry
        removeCanvasItem(n.id())
      })

      // Destroy the node subtree
      node.destroy()
    })

    selectionStore.clear()

    // Redraw/refresh
    freehandShapeLayer?.batchDraw()
    getGlobalCanvasState().layers.polygonShapes?.batchDraw()
    updateBakedStrokeData(getGlobalCanvasState(), store.appStateRef)
    updateBakedPolygonData(getGlobalCanvasState(), store.appStateRef)
    serializePolygonState(getGlobalCanvasState(), store.appStateRef)

    // Ancillary viz cleanup (best-effort)
    import('./ancillaryVisualizations').then(({ refreshAnciliaryViz }) => refreshAnciliaryViz()).catch(() => {})
  })
}
