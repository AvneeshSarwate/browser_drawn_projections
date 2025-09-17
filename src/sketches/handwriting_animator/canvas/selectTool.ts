import Konva from 'konva'

import * as selectionStore from './selectionStore'
import { getCanvasItem, createGroupItem, createPolygonItem, removeCanvasItem } from './CanvasItem'
import { polygonShapes, freehandStrokes, freehandStrokeGroups, type CanvasRuntimeState } from './canvasState'

import { executeCommand } from './commands'
import { globalStore } from '../appState'
import { getCurrentFreehandStateString, deepCloneWithNewIds, updateBakedStrokeData, updateTimelineState, refreshStrokeConnections } from './freehandTool'
import { getCurrentPolygonStateString, attachPolygonHandlers, serializePolygonState, updateBakedPolygonData } from './polygonTool'
import { hasAncestorConflict } from './canvasUtils'
import { uid } from './canvasUtils'
import { pushCommandWithStates } from './commands'



const store = globalStore()


export function initializeSelectTool(state: CanvasRuntimeState, layer: Konva.Layer) {
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

export function handleSelectPointerDown(state: CanvasRuntimeState, stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
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
      const wasSelected = selectionStore.has(state, item)
      if (e.evt.shiftKey) {
        selectionStore.toggle(state, item, true)
      } else if (!wasSelected) {
        selectionStore.clear(state)
        selectionStore.add(state, item, true)
      }

      // Start selection drag if the clicked item is (now) part of the selection
      const nowSelected = selectionStore.has(state, item)
      if (nowSelected) {
        startSelectionDrag(state, stage)
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
    resetSelectionRect(state, pos.x, pos.y)
  }
}

export function handleSelectPointerMove(state: CanvasRuntimeState, stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  // Selection drag has priority
  if (state.selection.selectionDragState.isDragging) {
    updateSelectionDrag(state, stage)
    return
  }
  if (!state.selection.dragSelectionState.value.isSelecting) return
  
  const pos = stage.getPointerPosition()
  if (!pos) return

  state.selection.dragSelectionState.value.currentPos = { x: pos.x, y: pos.y }
  updateSelectionRect(state)
}

export function handleSelectPointerUp(state: CanvasRuntimeState, stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) {
  // Finish selection drag if active
  if (state.selection.selectionDragState.isDragging) {
    finishSelectionDrag(state)
    return
  }

  if (!state.selection.dragSelectionState.value.isSelecting) return

  completeSelectionRect(state, state.selection.dragSelectionState.value.isShiftHeld)
  state.selection.dragSelectionState.value.isSelecting = false
}

function resetSelectionRect(state: CanvasRuntimeState, x: number, y: number) {
  if (!state.selection.selectionRect) return
  state.selection.selectionRect.setAttrs({
    x: x,
    y: y,
    width: 0,
    height: 0,
    visible: false
  })
}

function updateSelectionRect(state: CanvasRuntimeState) {
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

function completeSelectionRect(state: CanvasRuntimeState, isShiftHeld: boolean = false) {
  if (!state.selection.selectionRect) return
  
  // Check if this was actually a drag based on pointer movement, not rectangle size
  const { startPos, currentPos } = state.selection.dragSelectionState.value
  const dx = Math.abs(currentPos.x - startPos.x)
  const dy = Math.abs(currentPos.y - startPos.y)
  const wasDragged = dx >= 5 || dy >= 5
  
  if (!wasDragged) {
    // This was just a click, not a drag - clear selection if not holding shift
    if (!isShiftHeld) {
      selectionStore.clear(state)
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
    const freehandShapeLayer = state.layers.freehandShape
    if (freehandShapeLayer) layersToCheck.push(freehandShapeLayer)
    const polygonShapesLayer = state.layers.polygonShapes
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
    selectionStore.clear(state)
    updateTimelineState()
  }
  
  // Add intersecting items to selection
  intersectingItems.forEach(item => selectionStore.add(state, item, true)) // additive = true
  
  // Hide and reset selection rectangle to prevent stale data
  state.selection.selectionRect.setAttrs({ x: 0, y: 0, width: 0, height: 0, visible: false })
  state.layers.selectionOverlay?.batchDraw()
}

// ---------------- Selection Drag Implementation ----------------

function startSelectionDrag(state: CanvasRuntimeState, stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos) return
  state.selection.selectionDragState.isDragging = true
  state.selection.selectionDragState.startPos = { x: pos.x, y: pos.y }
  state.selection.selectionDragState.startNodePositions.clear()

  // Capture before-state for undo/redo
  state.selection.selectionDragState.beforeState = JSON.stringify({
    freehand: getCurrentFreehandStateString(state),
    polygon: getCurrentPolygonStateString(state)
  })

  // Store absolute start positions so we can move across different parents
  const nodes = state.selection.selectedKonvaNodes.value
  nodes.forEach(node => {
    const abs = node.getAbsolutePosition()
    state.selection.selectionDragState.startNodePositions.set(node, { x: abs.x, y: abs.y })
  })
}

function updateSelectionDrag(state: CanvasRuntimeState, stage: Konva.Stage) {
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

function finishSelectionDrag(state: CanvasRuntimeState) {
  // Capture after-state and push a unified command if changed
  const afterState = JSON.stringify({
    freehand: getCurrentFreehandStateString(state),
    polygon: getCurrentPolygonStateString(state)
  })

  if (state.selection.selectionDragState.beforeState !== afterState) {
    // Push command with captured states so undo/redo works
    pushCommandWithStates('Move Selection', state.selection.selectionDragState.beforeState, afterState)
  }

  state.selection.selectionDragState.isDragging = false
  state.selection.selectionDragState.startNodePositions.clear()
}

// ---------------- Grouping / Ungrouping (freehand-only groups) ----------------

function getSelectedNodes(state: CanvasRuntimeState): Konva.Node[] {
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

export function canGroupSelection(state: CanvasRuntimeState): boolean {
  const nodes = getSelectedNodes(state)
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

export function groupSelection(state: CanvasRuntimeState) {
  if (!canGroupSelection(state)) return
  const nodes = state.selection.selectedKonvaNodes.value.filter(n => (n instanceof Konva.Path) || (n instanceof Konva.Group))
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
    const item = createGroupItem(state, superGroup)
    selectionStore.clear(state)
    selectionStore.add(state, item)

    superGroup.getLayer()?.batchDraw()
    updateBakedStrokeData(state, store.appStateRef)
  })
}

export function canUngroupSelection(state: CanvasRuntimeState): boolean {
  const nodes = getSelectedNodes(state)
  if (nodes.length !== 1) return false
  // Polygons cannot participate
  if (nodes[0] instanceof Konva.Line) return false
  return nodes[0] instanceof Konva.Group
}

export function ungroupSelection(state: CanvasRuntimeState) {
  if (!canUngroupSelection(state)) return
  const grp = state.selection.selectedKonvaNodes.value[0] as Konva.Group
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

    selectionStore.clear(state)
    parent.getLayer()?.batchDraw()
    // Rebuild stroke connections after ungroup to keep data in sync
    try { refreshStrokeConnections() } catch {
      console.error('refreshStrokeConnections failed')
    }
    updateBakedStrokeData(state, store.appStateRef)
  })
}

// ---------------- Duplicate / Delete (unified) ----------------

function getTopLevelSelectedNodes(state: CanvasRuntimeState): Konva.Node[] {
  const nodes = state.selection.selectedKonvaNodes.value
  // keep only nodes that are not descendants of any other selected node
  return nodes.filter((node) => !nodes.some((other) => other !== node && other.isAncestorOf(node)))
}

export function duplicateSelection(state: CanvasRuntimeState) {
  const freehandShapeLayer = state.layers.freehandShape
  const selectedNodes = state.selection.selectedKonvaNodes.value
  if (selectedNodes.length === 0) return

  executeCommand('Duplicate', () => {
    selectionStore.withSelectionHighlightSuppressed(state, () => {
      const topLevelNodes = getTopLevelSelectedNodes(state)
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
          createPolygonItem(state, clone)
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
      selectionStore.clear(state)
      duplicates.forEach((node) => {
        const item = getCanvasItem(node)
        if (item) selectionStore.add(state, item, true)
      })

      // Refresh visuals/state
      freehandShapeLayer?.batchDraw()
      state.layers.polygonShapes?.batchDraw()
      updateBakedStrokeData(state, store.appStateRef)
      updateBakedPolygonData(state, store.appStateRef)
      serializePolygonState(state, store.appStateRef)
    })
  })
}

export function deleteSelection(state: CanvasRuntimeState) {
  const freehandShapeLayer = state.layers.freehandShape
  const selectedNodes = state.selection.selectedKonvaNodes.value
  if (selectedNodes.length === 0) return

  executeCommand('Delete Selected', () => {
    const topLevelNodes = getTopLevelSelectedNodes(state)

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

    selectionStore.clear(state)

    // Redraw/refresh
    freehandShapeLayer?.batchDraw()
    state.layers.polygonShapes?.batchDraw()
    updateBakedStrokeData(state, store.appStateRef)
    updateBakedPolygonData(state, store.appStateRef)
    serializePolygonState(state, store.appStateRef)

    // Ancillary viz cleanup (best-effort)
    import('./ancillaryVisualizations').then(({ refreshAnciliaryViz }) => refreshAnciliaryViz()).catch(() => {})
  })
}
