/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
import { TimeContext, CancelablePromiseProxy, launch } from "@/channels/base_time_context"
import { findClosestPolygonLineAtPoint } from "@/creativeAlgs/shapeHelpers"
import Konva from "konva"
import { type ShallowReactive, shallowReactive, ref, watch } from "vue"
import type { PolygonRenderData, FlattenedPolygon, TemplateAppState } from "../appState"
import { globalStore, stage, activeTool } from "../appState"
import { executeCommand, pushCommandWithStates } from "./commands"
import { getCurrentFreehandStateString } from './freehandTool'
import { uid } from './canvasUtils'
import { createPolygonItem, createGroupItem, getCanvasItem, removeCanvasItem } from './CanvasItem'
import * as selectionStore from './selectionStore'
import { getGlobalCanvasState, polygonShapes, polygonGroups } from './canvasState'
import type { CanvasRuntimeState } from './canvasState'
const store = globalStore()
export const appState = store.appStateRef

// State-based layer initialization
export const initPolygonLayers = (state: CanvasRuntimeState, stage: Konva.Stage) => {
  state.layers.polygonShapes = new Konva.Layer()
  state.layers.polygonPreview = new Konva.Layer()
  state.layers.polygonControls = new Konva.Layer()
  state.layers.polygonSelection = new Konva.Layer()
  
  stage.add(state.layers.polygonShapes)
  stage.add(state.layers.polygonPreview)
  stage.add(state.layers.polygonControls)
  stage.add(state.layers.polygonSelection)
}



// Polygon data structures
interface PolygonShape {
  id: string
  points: number[] // [x1, y1, x2, y2, ...]
  closed: boolean
  konvaShape?: Konva.Line
  controlPoints?: Konva.Circle[]
  creationTime: number
}

interface PolygonGroup {
  id: string
  polygonIds: string[]
  group?: Konva.Group
}


// All polygon data now accessed via convenience getters from canvasState.ts

// Function to toggle polygon selection - now using unified selection store
export const togglePolygonSelection = (polygonId: string) => {
  const polygon = stage?.findOne(`#${polygonId}`) as Konva.Line
  if (!polygon) return

  const item = getCanvasItem(polygon)
  if (item) {
    selectionStore.toggle(item, false) // not additive for polygons
  }
}

// Function to clear polygon selection - now using unified selection store  
export const clearPolygonSelection = () => {
  selectionStore.clear()
}

// Function to generate baked polygon data for external rendering (p5, three.js, etc.)
export const generateBakedPolygonData = (
  canvasState: CanvasRuntimeState
): PolygonRenderData => {
  const polygonShapesLayer = canvasState.layers.polygonShapes
  if (!polygonShapesLayer) return []

  const bakedPolygons: FlattenedPolygon[] = []

  // Helper function to transform points using world transform
  const transformPolygonPoints = (points: number[], node: Konva.Node): { x: number, y: number }[] => {
    const transformedPoints: { x: number, y: number }[] = []
    const transform = node.getAbsoluteTransform()
    
    for (let i = 0; i < points.length; i += 2) {
      const point = transform.point({ x: points[i], y: points[i + 1] })
      transformedPoints.push({ x: point.x, y: point.y })
    }
    
    return transformedPoints
  }

  // Process all polygon nodes in the layer
  polygonShapesLayer.getChildren().forEach((child: Konva.Node) => {
    if (child instanceof Konva.Line) {
      // Get the original points from the line
      const originalPoints = child.points()
      
      // Transform points to world coordinates
      const transformedPoints = transformPolygonPoints(originalPoints, child)
      
      // Extract metadata from the Konva node
      const metadata = child.getAttr('metadata')
      
      bakedPolygons.push({
        points: transformedPoints,
        ...(metadata && { metadata }) // Only include metadata if it exists
      })
    }
  })

  return bakedPolygons
}

// Function to update baked polygon data in app state
export const updateBakedPolygonData = (
  canvasState: CanvasRuntimeState,
  templateAppState: TemplateAppState
) => {
  templateAppState.polygonRenderData = generateBakedPolygonData(canvasState)
}

// Polygon drawing state now managed via global canvas state

// Polygon Undo/Redo Functions
// Get current polygon state for undo/redo
export const getCurrentPolygonState = (
  state: CanvasRuntimeState = getGlobalCanvasState()
) => {
  return selectionStore.withSelectionHighlightSuppressed(state, () => {
    const polygonShapesLayer = state.layers.polygonShapes
    const stageRef = state.stage
    if (!stageRef || !polygonShapesLayer) return null

    try {
      const layerData = polygonShapesLayer.toObject()
      const polygonsData = Array.from(state.polygon.shapes.entries())
      const polygonGroupsData = Array.from(state.polygon.groups.entries())

      const polygonState = {
        layer: layerData,
        polygons: polygonsData,
        polygonGroups: polygonGroupsData,
      }

      return polygonState
    } catch (error) {
      console.warn('Failed to get current polygon state:', error)
      return null
    }
  })
}

export const getCurrentPolygonStateString = (
  state: CanvasRuntimeState = getGlobalCanvasState()
): string => {
  const polygonState = getCurrentPolygonState(state)
  return JSON.stringify(polygonState)
}

// Restore polygon state from string
export const restorePolygonState = (
  canvasState: CanvasRuntimeState,
  templateAppState: TemplateAppState,
  stateString: string
) => {
  if (!stateString) return
  try {
    const originalState = templateAppState.polygonStateString
    templateAppState.polygonStateString = stateString

    deserializePolygonState(canvasState, templateAppState, stateString)

    templateAppState.polygonStateString = originalState
  } catch (error) {
    console.warn('Failed to restore polygon state:', error)
  }
}

// Polygon drag tracking now handled via global state

export const startPolygonDragTracking = () => {
  const state = getGlobalCanvasState()
  // Capture combined state for unified undo/redo
  const before = JSON.stringify({
    freehand: getCurrentFreehandStateString(),
    polygon: getCurrentPolygonStateString()
  })
  state.polygon.dragStartState = before
}

export const finishPolygonDragTracking = (nodeName: string) => {
  const state = getGlobalCanvasState()
  if (!state.polygon.dragStartState) return
  
  const endCombined = JSON.stringify({
    freehand: getCurrentFreehandStateString(),
    polygon: getCurrentPolygonStateString()
  })
  if (state.polygon.dragStartState !== endCombined) {
    // Push into unified command stack with combined state
    pushCommandWithStates(`Transform ${nodeName}`, state.polygon.dragStartState, endCombined)
    updateBakedPolygonData(getGlobalCanvasState(), appState) // Update baked data after polygon transformation
  }
  
  state.polygon.dragStartState = null
}

// Polygon state serialization functions
export const serializePolygonState = (
  canvasState: CanvasRuntimeState,
  templateAppState: TemplateAppState
) => {
  const polygonShapesLayer = canvasState.layers.polygonShapes
  const stageRef = canvasState.stage
  if (!stageRef || !polygonShapesLayer) return

  try {
    const polygonState = getCurrentPolygonState(canvasState)
    if (!polygonState) return

    templateAppState.polygonStateString = JSON.stringify(polygonState)
    console.log('Serialized polygon state:', {
      layerChildren: polygonState.layer?.children?.length || 0,
      polygons: polygonState.polygons.length,
      polygonGroups: polygonState.polygonGroups.length
    })
  } catch (error) {
    console.warn('Failed to serialize polygon state:', error)
  }
}

// Function to attach handlers to polygon nodes
export const attachPolygonHandlers = (node: Konva.Line) => {
  console.log('Attaching polygon handlers to:', node.id())
  
  node.draggable(false) // Do not drag polygons directly; use transformer in select mode

  // Selection handled by stage-level select tool; avoid node-level click toggles

  // Add drag tracking handlers for undo/redo
  // If we ever re-enable node drags (e.g., special mode), these handlers keep undo/redo correct
  node.on('dragstart', () => startPolygonDragTracking())
  node.on('dragend', () => { finishPolygonDragTracking('Polygon Drag'); serializePolygonState(getGlobalCanvasState(), appState) })
}

export const deserializePolygonState = (
  canvasState: CanvasRuntimeState,
  templateAppState: TemplateAppState,
  stateString: string
) => {
  const polygonShapesLayer = canvasState.layers.polygonShapes
  const polygonControlsLayer = canvasState.layers.polygonControls
  const stageRef = canvasState.stage
  if (!stateString || !stageRef || !polygonShapesLayer) return

  try {
    const polygonState = JSON.parse(stateString)
    console.log('Deserializing polygon state:', {
      layerChildren: polygonState.layer?.children?.length || 0,
      polygons: polygonState.polygons?.length || 0,
      polygonGroups: polygonState.polygonGroups?.length || 0
    })

    polygonShapesLayer.destroyChildren()
    canvasState.polygon.shapes.clear()
    canvasState.polygon.groups.clear()
    selectionStore.clear()

    const layerData = polygonState.layer
    if (layerData && layerData.children) {
      console.log('Restoring', layerData.children.length, 'polygon shapes')
      layerData.children.forEach((childData: any, index: number) => {
        console.log('Creating polygon node', index, 'of type', childData.className)
        const node = Konva.Node.create(JSON.stringify(childData))
        polygonShapesLayer.add(node)
        console.log('Added polygon node to layer:', node.id(), node.isVisible())

        if (node instanceof Konva.Line) {
          attachPolygonHandlers(node)
          createPolygonItem(canvasState, node)
        } else if (node instanceof Konva.Group) {
          createGroupItem(canvasState, node)
        }
      })
    }

    if (polygonState.polygons) {
      polygonState.polygons.forEach(([id, polygonData]: [string, any]) => {
        const shape = stageRef.findOne(`#${id}`) as Konva.Line
        console.log('Restoring polygon:', id, 'found shape:', !!shape)
        const polygon: PolygonShape = {
          id: polygonData.id,
          points: polygonData.points,
          closed: polygonData.closed,
          creationTime: polygonData.creationTime,
          konvaShape: shape,
          controlPoints: [],
        }
        canvasState.polygon.shapes.set(id, polygon)
      })
    }

    if (polygonState.polygonGroups) {
      polygonState.polygonGroups.forEach(([id, groupData]: [string, any]) => {
        const group: PolygonGroup = {
          id: groupData.id,
          polygonIds: groupData.polygonIds,
          group: stageRef.findOne(`#${id}`) as Konva.Group,
        }
        canvasState.polygon.groups.set(id, group)
      })
    }

    polygonControlsLayer?.destroyChildren()

    if (activeTool.value === 'polygon' && canvasState.polygon.mode.value === 'edit') {
      updatePolygonControlPoints()
    }

    polygonShapesLayer.batchDraw()
    updateBakedPolygonData(canvasState, templateAppState)

    console.log('Polygon state restored from hotreload')
  } catch (error) {
    console.warn('Failed to deserialize polygon state:', error)
  }
}

// Polygon tool functions
export const handlePolygonClick = (pos: { x: number, y: number }) => {
  const state = getGlobalCanvasState()
  const polygonShapesLayer = state.layers.polygonShapes
  if (!polygonShapesLayer) return
  
  if (state.polygon.mode.value === 'draw') {
    // New shape mode - point-by-point drawing
    if (!state.polygon.isDrawing.value) {
      // Start new polygon
      state.polygon.isDrawing.value = true
      state.polygon.currentPoints.value = [pos.x, pos.y]
    } else {
      // Check if close to first point (close polygon)
      const firstX = state.polygon.currentPoints.value[0]
      const firstY = state.polygon.currentPoints.value[1]
      const distance = Math.sqrt((pos.x - firstX) ** 2 + (pos.y - firstY) ** 2)
      
      if (distance < state.polygon.proximityThreshold && state.polygon.currentPoints.value.length >= 6) {
        // Close the polygon
        finishPolygon()
      } else {
        // Add new point
        state.polygon.currentPoints.value.push(pos.x, pos.y)
        updatePolygonPreview()
      }
    }
    updatePolygonPreview()
  } else if (state.polygon.mode.value === 'edit') {
    // Edit shape mode - add points to existing polygons only if not clicking on a control point
    const polygonArray = Array.from(polygonShapes().values()).map(p => {
      const line = p.konvaShape
      const t = line ? line.getAbsoluteTransform() : null
      const pts: { x: number, y: number }[] = []
      for (let i = 0; i < p.points.length; i += 2) {
        if (t) {
          const wp = t.point({ x: p.points[i], y: p.points[i + 1] })
          pts.push({ x: wp.x, y: wp.y })
        } else {
          pts.push({ x: p.points[i], y: p.points[i + 1] })
        }
      }
      return { points: pts }
    })
    
    if (polygonArray.length > 0) {
      const result = findClosestPolygonLineAtPoint(polygonArray, pos)
      
      if (result.polygonIndex >= 0 && result.distance < state.polygon.proximityThreshold * 2) {
        // Add point to the middle of the closest line segment
        const polygonId = Array.from(polygonShapes().keys())[result.polygonIndex]
        const polygon = polygonShapes().get(polygonId)
        
        if (polygon && polygon.konvaShape) {
          executeCommand('Add Polygon Point', () => {
            const points = polygon.points
            const insertIndex = (result.lineIndex + 1) * 2 // Convert to flat array index
            
            // Calculate midpoint of the line segment
            const p1x = points[result.lineIndex * 2]
            const p1y = points[result.lineIndex * 2 + 1]
            const p2x = points[((result.lineIndex + 1) * 2) % points.length]
            const p2y = points[((result.lineIndex + 1) * 2 + 1) % points.length]
            
            const midX = (p1x + p2x) / 2
            const midY = (p1y + p2y) / 2
            
            // Insert the new point
            polygon.points.splice(insertIndex, 0, midX, midY)
            
            // Update the Konva shape and control points
            polygon.konvaShape!.points(polygon.points)
            updatePolygonControlPoints() // Refresh control points
            serializePolygonState(getGlobalCanvasState(), appState) // Serialize for hotreload
            polygonShapesLayer?.batchDraw()
            updateBakedPolygonData(getGlobalCanvasState(), appState) // ensure baked data reflects edit
          })
        }
      }
    }
  }
}

export const handlePolygonMouseMove = () => {
  const state = getGlobalCanvasState()
  if (!state.polygon.isDrawing.value || state.polygon.mode.value !== 'draw') return
  updatePolygonPreview()
}

export const handlePolygonEditMouseMove = () => {
  const polygonPreviewLayer = getGlobalCanvasState().layers.polygonPreview
  const polygonControlsLayer = getGlobalCanvasState().layers.polygonControls
  if (!polygonPreviewLayer || !stage || polygonShapes().size === 0) return
  
  const mousePos = stage.getPointerPosition()
  if (!mousePos) return
  
  // Check if mouse is over a control point - if so, don't show edge preview
  const mouseTarget = stage.getIntersection(mousePos)
  if (mouseTarget && mouseTarget.getParent() === polygonControlsLayer) {
    // Mouse is over a control point, clear preview
    polygonPreviewLayer.destroyChildren()
    polygonPreviewLayer.batchDraw()
    return
  }
  
  // Find the closest polygon edge (in world coordinates)
  const polygonArray = Array.from(polygonShapes().values()).map(p => {
    const line = p.konvaShape
    const t = line ? line.getAbsoluteTransform() : null
    const pts: { x: number, y: number }[] = []
    for (let i = 0; i < p.points.length; i += 2) {
      if (t) {
        const wp = t.point({ x: p.points[i], y: p.points[i + 1] })
        pts.push({ x: wp.x, y: wp.y })
      } else {
        pts.push({ x: p.points[i], y: p.points[i + 1] })
      }
    }
    return { points: pts }
  })
  
  if (polygonArray.length > 0) {
    const result = findClosestPolygonLineAtPoint(polygonArray, mousePos)
    
    polygonPreviewLayer.destroyChildren()
    
    if (result.polygonIndex >= 0 && result.distance < 20) {
      const polygon = Array.from(polygonShapes().values())[result.polygonIndex]
      const points = polygon.points
      const line = polygon.konvaShape
      const t = line ? line.getAbsoluteTransform() : null
      
      // Get the edge endpoints
      const p1x = points[result.lineIndex * 2]
      const p1y = points[result.lineIndex * 2 + 1]
      const p2x = points[((result.lineIndex + 1) * 2) % points.length]
      const p2y = points[((result.lineIndex + 1) * 2 + 1) % points.length]
      const wp1 = t ? t.point({ x: p1x, y: p1y }) : { x: p1x, y: p1y }
      const wp2 = t ? t.point({ x: p2x, y: p2y }) : { x: p2x, y: p2y }
      
      // Calculate midpoint in world coordinates
      const midWX = (wp1.x + wp2.x) / 2
      const midWY = (wp1.y + wp2.y) / 2
      
      // Highlight the edge
      const edgeLine = new Konva.Line({
        points: [wp1.x, wp1.y, wp2.x, wp2.y],
        stroke: '#00ff00',
        strokeWidth: 4,
        opacity: 0.8
      })
      polygonPreviewLayer.add(edgeLine)
      
      // Show midpoint where new point would be added
      const midpointCircle = new Konva.Circle({
        x: midWX,
        y: midWY,
        radius: 5,
        fill: '#00ff00',
        stroke: '#00aa00',
        strokeWidth: 2,
        opacity: 0.9
      })
      polygonPreviewLayer.add(midpointCircle)
    }
    
    polygonPreviewLayer.batchDraw()
  }
}

export const updatePolygonPreview = () => {
  const state = getGlobalCanvasState()
  const polygonPreviewLayer = state.layers.polygonPreview
  if (!polygonPreviewLayer || !stage) return
  
  polygonPreviewLayer.destroyChildren()
  
  if (state.polygon.currentPoints.value.length < 4) {
    // If we only have one point, just show that point as a circle
    if (state.polygon.currentPoints.value.length === 2) {
      const pointCircle = new Konva.Circle({
        x: state.polygon.currentPoints.value[0],
        y: state.polygon.currentPoints.value[1],
        radius: 4,
        fill: '#0066ff',
        stroke: '#004499',
        strokeWidth: 1,
        listening: false
      })
      polygonPreviewLayer.add(pointCircle)
    }
    polygonPreviewLayer.batchDraw()
    return
  }
  
  const mousePos = stage.getPointerPosition()
  if (!mousePos) return
  
  // Draw all current points as circles
  for (let i = 0; i < state.polygon.currentPoints.value.length; i += 2) {
    const pointCircle = new Konva.Circle({
      x: state.polygon.currentPoints.value[i],
      y: state.polygon.currentPoints.value[i + 1],
      radius: 4,
      fill: '#0066ff',
      stroke: '#004499',
      strokeWidth: 1,
      listening: false
    })
    polygonPreviewLayer.add(pointCircle)
  }
  
  // Create preview line from current points to mouse position
  const previewPoints = [...state.polygon.currentPoints.value, mousePos.x, mousePos.y]
  
  const previewLine = new Konva.Line({
    points: previewPoints,
    stroke: '#999',
    strokeWidth: 2,
    fill: 'rgba(153, 153, 153, 0.1)',
    closed: false,
    dash: [5, 5],
    listening: false
  })
  
  polygonPreviewLayer.add(previewLine)
  
  // Show first point indicator for closing
  if (state.polygon.currentPoints.value.length >= 6) {
    const firstX = state.polygon.currentPoints.value[0]
    const firstY = state.polygon.currentPoints.value[1]
    const distance = Math.sqrt((mousePos.x - firstX) ** 2 + (mousePos.y - firstY) ** 2)
    
    const firstPointIndicator = new Konva.Circle({
      x: firstX,
      y: firstY,
      radius: state.polygon.proximityThreshold,
      stroke: distance < state.polygon.proximityThreshold ? '#00ff00' : '#ff0000',
      strokeWidth: 2,
      fill: 'transparent',
      listening: false
    })
    
    polygonPreviewLayer.add(firstPointIndicator)
  }
  
  polygonPreviewLayer.batchDraw()
}

export const finishPolygon = () => {
  const state = getGlobalCanvasState()
  const polygonShapesLayer = state.layers.polygonShapes
  const polygonPreviewLayer = state.layers.polygonPreview
  if (state.polygon.currentPoints.value.length < 6) return // Need at least 3 points
  
  executeCommand('Create Polygon', () => {
    const polygonId = `polygon-${Date.now()}`
    const polygon: PolygonShape = {
      id: polygonId,
      points: [...state.polygon.currentPoints.value],
      closed: true,
      creationTime: Date.now()
    }
    
    // Create Konva shape
    const polygonLine = new Konva.Line({
      points: polygon.points,
      stroke: '#000',
      strokeWidth: 2,
      fill: 'rgba(0, 100, 255, 0.1)',
      closed: true,
      draggable: false, // Will be handled by control points in edit mode
      id: polygonId
    })

    attachPolygonHandlers(polygonLine)
    
    polygon.konvaShape = polygonLine
    polygonShapes().set(polygonId, polygon)
    polygonShapesLayer?.add(polygonLine)
    
    // Register as CanvasItem
    createPolygonItem(state, polygonLine)
    
    // Reset drawing state to allow drawing new shapes
    state.polygon.isDrawing.value = false
    state.polygon.currentPoints.value = []
    polygonPreviewLayer?.destroyChildren()
    
    // Update control points if in edit mode
    updatePolygonControlPoints()
    
    // Serialize polygon state for hotreload
    serializePolygonState(getGlobalCanvasState(), appState)
    
    polygonShapesLayer?.batchDraw()
    polygonPreviewLayer?.batchDraw()
    updateBakedPolygonData(getGlobalCanvasState(), appState) // Update baked data after creating polygon
  })
}

// Clear current polygon being drawn
export const clearCurrentPolygon = () => {
  const state = getGlobalCanvasState()
  const polygonPreviewLayer = state.layers.polygonPreview
  state.polygon.isDrawing.value = false
  state.polygon.currentPoints.value = []
  polygonPreviewLayer?.destroyChildren()
  polygonPreviewLayer?.batchDraw()
}

// Delete selected polygon
export const deleteSelectedPolygon = () => {
  const polygonShapesLayer = getGlobalCanvasState().layers.polygonShapes
  const selectedNodes = selectionStore.selectedKonvaNodes.value
  if (selectedNodes.length === 0) return
  
  executeCommand('Delete Selected Polygon', () => {
    selectedNodes.forEach((node: Konva.Node) => {
      const polygonId = node.id()
      node.destroy()
      // Remove from polygons map
      polygonShapes().delete(polygonId)
      // Remove from registry
      removeCanvasItem(polygonId)
    })
    clearPolygonSelection()
    polygonShapesLayer?.batchDraw()
    updateBakedPolygonData(getGlobalCanvasState(), appState) // Update baked data after polygon deletion
  })
}

// Show/hide control points for polygon editing
export const updatePolygonControlPoints = () => {
  const polygonControlsLayer = getGlobalCanvasState().layers.polygonControls
  const polygonShapesLayer = getGlobalCanvasState().layers.polygonShapes
  if (!polygonControlsLayer) return
  
  // Clear existing control points
  polygonControlsLayer.destroyChildren()
  
  if (getGlobalCanvasState().polygon.mode.value === 'edit') {
    // Show control points for all polygons
    polygonShapes().forEach((polygon) => {
      // Clear existing control points array
      polygon.controlPoints = []
      
      // Create control points for each vertex
      for (let i = 0; i < polygon.points.length; i += 2) {
        const pointIndex = i // Capture the index for the closure
        const localX = polygon.points[pointIndex]
        const localY = polygon.points[pointIndex + 1]
        // Convert local polygon coords to world coords for control point placement
        let worldX = localX
        let worldY = localY
        if (polygon.konvaShape) {
          const t = polygon.konvaShape.getAbsoluteTransform()
          const wp = t.point({ x: localX, y: localY })
          worldX = wp.x
          worldY = wp.y
        }
        
        const controlPoint = new Konva.Circle({
          x: worldX,
          y: worldY,
          radius: 6,
          fill: '#ff6600',
          stroke: '#ff4400',
          strokeWidth: 2,
          draggable: true,
          id: `${polygon.id}-control-${pointIndex/2}`
        })
        
        // Add hover effects
        controlPoint.on('mouseenter', () => {
          controlPoint.fill('#ffaa00')
          controlPoint.radius(8)
          polygonControlsLayer?.batchDraw()
        })
        
        controlPoint.on('mouseleave', () => {
          controlPoint.fill('#ff6600')
          controlPoint.radius(6)
          polygonControlsLayer?.batchDraw()
        })
        
        // Add drag start handler to track initial state
        controlPoint.on('dragstart', () => {
          startPolygonDragTracking()
        })
        
        // Add drag handler to update polygon points
        controlPoint.on('dragmove', () => {
          // Convert control point world position back into polygon local coords
          const wp = { x: controlPoint.x(), y: controlPoint.y() }
          if (polygon.konvaShape) {
            const inv = polygon.konvaShape.getAbsoluteTransform().copy()
            inv.invert()
            const lp = inv.point(wp)
            polygon.points[pointIndex] = lp.x
            polygon.points[pointIndex + 1] = lp.y
          } else {
            polygon.points[pointIndex] = wp.x
            polygon.points[pointIndex + 1] = wp.y
          }
          // Update the Konva shape
          if (polygon.konvaShape) {
            polygon.konvaShape.points(polygon.points)
            polygonShapesLayer?.batchDraw()
          }
        })
        
        // Add drag end handler to track final state and serialize
        controlPoint.on('dragend', () => {
          finishPolygonDragTracking('Polygon Control Point')
          serializePolygonState(getGlobalCanvasState(), appState)
        })
        
        polygon.controlPoints.push(controlPoint)
        polygonControlsLayer!.add(controlPoint)
      }
    })
  }
  
  polygonControlsLayer.batchDraw()
}

// Watch for polygon mode changes to update control points and reset state
// Note: This watch will be moved to CanvasRoot.vue as part of the migration
export const setupPolygonModeWatcher = () => {
  const state = getGlobalCanvasState()
  
  return watch(() => state.polygon.mode.value, (newMode) => {
    const polygonControlsLayer = state.layers.polygonControls
    const polygonPreviewLayer = state.layers.polygonPreview
    // If polygon tool is not active, don't create/show control points
    if (activeTool.value !== 'polygon') {
      polygonControlsLayer?.destroyChildren()
      polygonControlsLayer?.batchDraw()
      return
    }

    // Clear selection when switching modes
    clearPolygonSelection()
    
    if (newMode === 'draw') {
      // When switching to draw mode, clear any current drawing state
      state.polygon.isDrawing.value = false
      state.polygon.currentPoints.value = []
      polygonPreviewLayer?.destroyChildren()
      polygonPreviewLayer?.batchDraw()
      
      // Disable dragging in polygon tool mode; drawing only
      polygonShapes().forEach(polygon => { polygon.konvaShape?.draggable(false) })
    } else if (newMode === 'edit') {
      // When switching to edit mode, clear any drawing preview
      polygonPreviewLayer?.destroyChildren()
      polygonPreviewLayer?.batchDraw()
      
      // Disable dragging during vertex editing
      polygonShapes().forEach(polygon => { polygon.konvaShape?.draggable(false) })
    }
    updatePolygonControlPoints()
    clearPolygonSelection()
  })
}
