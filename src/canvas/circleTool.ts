/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
import Konva from "konva"
import type { CircleRenderData, FlattenedCircle, CircleShapeRuntime } from "./canvasState"
import { executeCommand, pushCommandWithStates } from "./commands"
import { getCurrentFreehandStateString } from './freehandTool'
import { getCurrentPolygonStateString } from './polygonTool'
import { uid } from './canvasUtils'
import { createCircleItem, createGroupItem, getCanvasItem, removeCanvasItem } from './CanvasItem'
import * as selectionStore from './selectionStore'
import { circleShapes } from './canvasState'
import type { CanvasRuntimeState } from './canvasState'

// State-based layer initialization
export const initCircleLayers = (state: CanvasRuntimeState, _stage: Konva.Stage) => {
  const drawingLayer = state.layers.drawing
  const overlayLayer = state.layers.overlay

  if (!drawingLayer || !overlayLayer) {
    console.warn('Cannot initialize circle groups without required layers')
    return
  }

  if (!state.groups.circleShapes) {
    const shapesGroup = new Konva.Group({ name: 'circle-shapes' })
    state.groups.circleShapes = shapesGroup
    drawingLayer.add(shapesGroup)
  }

  if (!state.groups.circlePreview) {
    const previewGroup = new Konva.Group({ name: 'circle-preview' })
    state.groups.circlePreview = previewGroup
    overlayLayer.add(previewGroup)
  }
}

// Function to attach handlers to circle nodes
export const attachCircleHandlers = (state: CanvasRuntimeState, node: Konva.Circle) => {
  console.log('Attaching circle handlers to:', node.id())

  node.draggable(false) // Do not drag circles directly; use transformer in select mode

  // Selection handled by stage-level select tool; avoid node-level click toggles
  // Drag and transform tracking is handled by the unified select tool and transformer
}

// Circle drag tracking for undo/redo
export const startCircleDragTracking = (state: CanvasRuntimeState) => {
  // Capture combined state for unified undo/redo
  const before = JSON.stringify({
    freehand: getCurrentFreehandStateString(state),
    polygon: getCurrentPolygonStateString(state),
    circle: getCurrentCircleStateString(state)
  })
  state.circle.dragStartState = before
}

export const finishCircleDragTracking = (state: CanvasRuntimeState, nodeName: string) => {
  if (!state.circle.dragStartState) return

  const endCombined = JSON.stringify({
    freehand: getCurrentFreehandStateString(state),
    polygon: getCurrentPolygonStateString(state),
    circle: getCurrentCircleStateString(state)
  })
  if (state.circle.dragStartState !== endCombined) {
    // Push into unified command stack with combined state
    pushCommandWithStates(state, `Transform ${nodeName}`, state.circle.dragStartState, endCombined)
    updateBakedCircleData(state) // Update baked data after circle transformation
  }

  state.circle.dragStartState = null
}

// Get current circle state for undo/redo
export const getCurrentCircleState = (
  state: CanvasRuntimeState
) => {
  return selectionStore.withSelectionHighlightSuppressed(state, () => {
    const circleShapesGroup = state.groups.circleShapes
    const stageRef = state.stage
    if (!stageRef || !circleShapesGroup) return null

    try {
      const layerData = circleShapesGroup.toObject()
      // Serialize runtime data to plain objects (no Konva node references)
      const circlesData = Array.from(state.circle.shapes.entries()).map(([id, c]) => [
        id,
        {
          id: c.id,
          x: c.shape?.x() ?? c.x,
          y: c.shape?.y() ?? c.y,
          r: c.shape?.radius() ?? c.r,
          creationTime: c.creationTime,
        },
      ])

      const circleState = {
        layer: layerData,
        circles: circlesData,
      }

      return circleState
    } catch (error) {
      console.warn('Failed to get current circle state:', error)
      return null
    }
  })
}

export const getCurrentCircleStateString = (
  state: CanvasRuntimeState
): string => {
  const circleState = getCurrentCircleState(state)
  return JSON.stringify(circleState)
}

// Restore circle state from string
export const restoreCircleState = (
  canvasState: CanvasRuntimeState,
  stateString: string
) => {
  if (!stateString) return
  try {
    deserializeCircleState(canvasState, stateString)
  } catch (error) {
    console.warn('Failed to restore circle state:', error)
  }
}

// Circle state serialization functions
export const serializeCircleState = (
  canvasState: CanvasRuntimeState
) => {
  const circleShapesGroup = canvasState.groups.circleShapes
  const stageRef = canvasState.stage
  if (!stageRef || !circleShapesGroup) return

  try {
    const circleState = getCurrentCircleState(canvasState)
    if (!circleState) return

    canvasState.circle.serializedState = JSON.stringify(circleState)
    canvasState.callbacks.syncAppState?.(canvasState)
    console.log('Serialized circle state:', {
      layerChildren: circleState.layer?.children?.length || 0,
      circles: circleState.circles.length,
    })
  } catch (error) {
    console.warn('Failed to serialize circle state:', error)
  }
}

export const deserializeCircleState = (
  canvasState: CanvasRuntimeState,
  stateString: string
) => {
  const circleShapesGroup = canvasState.groups.circleShapes
  const stageRef = canvasState.stage
  if (!stateString || !stageRef || !circleShapesGroup) return

  try {
    const circleState = JSON.parse(stateString)
    console.log('Deserializing circle state:', {
      layerChildren: circleState.layer?.children?.length || 0,
      circles: circleState.circles?.length || 0,
    })

    circleShapesGroup.destroyChildren()
    canvasState.circle.shapes.clear()
    selectionStore.clear(canvasState)

    const layerData = circleState.layer
    if (layerData && layerData.children) {
      console.log('Restoring', layerData.children.length, 'circle shapes')
      layerData.children.forEach((childData: any, index: number) => {
        console.log('Creating circle node', index, 'of type', childData.className)
        const node = Konva.Node.create(childData)
        circleShapesGroup.add(node)
        console.log('Added circle node to layer:', node.id(), node.isVisible())

        if (node instanceof Konva.Group) {
          createGroupItem(canvasState, node)
        }
      })
    }

    // Rebuild runtime map by traversing all circles (including nested in groups)
    const allCircles = circleShapesGroup.find('Circle') as unknown as Konva.Circle[]
    canvasState.circle.shapes.clear()
    allCircles.forEach(shape => {
      if (!shape.id()) shape.id(uid('circle_'))
      const circle: CircleShapeRuntime = {
        id: shape.id(),
        x: shape.x(),
        y: shape.y(),
        r: shape.radius(),
        creationTime: shape.getAttr('creationTime') ?? Date.now(),
        shape,
      }
      canvasState.circle.shapes.set(circle.id, circle)
      attachCircleHandlers(canvasState, shape)
      createCircleItem(canvasState, shape)
    })

    circleShapesGroup.getLayer()?.batchDraw()
    canvasState.circle.serializedState = stateString
    updateBakedCircleData(canvasState)

    console.log('Circle state restored from hotreload')
  } catch (error) {
    console.warn('Failed to deserialize circle state:', error)
  }
}

// Circle tool functions
export const handleCirclePointerDown = (state: CanvasRuntimeState, pos: { x: number, y: number }) => {
  const circlePreviewGroup = state.groups.circlePreview
  if (!circlePreviewGroup) return

  state.circle.isDrawing.value = true
  state.circle.currentCenter.value = pos
  state.circle.currentRadius.value = 0
  
  // Clear any existing preview
  circlePreviewGroup.destroyChildren()
  circlePreviewGroup.getLayer()?.batchDraw()
}

export const handleCirclePointerMove = (state: CanvasRuntimeState) => {
  const circlePreviewGroup = state.groups.circlePreview
  const stageRef = state.stage
  if (!state.circle.isDrawing.value || !circlePreviewGroup || !stageRef) return

  const mousePos = stageRef.getPointerPosition()
  if (!mousePos || !state.circle.currentCenter.value) return

  const center = state.circle.currentCenter.value
  const radius = Math.sqrt(
    Math.pow(mousePos.x - center.x, 2) + 
    Math.pow(mousePos.y - center.y, 2)
  )
  
  state.circle.currentRadius.value = radius

  // Update preview
  circlePreviewGroup.destroyChildren()
  
  const previewCircle = new Konva.Circle({
    x: center.x,
    y: center.y,
    radius: radius,
    stroke: '#999',
    strokeWidth: 2,
    dash: [5, 5],
    listening: false
  })
  
  circlePreviewGroup.add(previewCircle)
  circlePreviewGroup.getLayer()?.batchDraw()
}

export const handleCirclePointerUp = (state: CanvasRuntimeState) => {
  const circleShapesGroup = state.groups.circleShapes
  const circlePreviewGroup = state.groups.circlePreview
  
  if (!state.circle.isDrawing.value) return
  
  const center = state.circle.currentCenter.value
  const radius = state.circle.currentRadius.value
  
  // Clear drawing state
  state.circle.isDrawing.value = false
  circlePreviewGroup?.destroyChildren()
  circlePreviewGroup?.getLayer()?.batchDraw()
  
  // Only create circle if radius is large enough
  if (!center || radius < 2) return

  executeCommand(state, 'Create Circle', () => {
    const circleId = uid('circle_')
    const creationTime = Date.now()
    const circle: CircleShapeRuntime = {
      id: circleId,
      x: center.x,
      y: center.y,
      r: radius,
      creationTime: creationTime
    }
    
    // Create Konva shape
    const circleShape = new Konva.Circle({
      x: center.x,
      y: center.y,
      radius: radius,
      stroke: '#000',
      strokeWidth: 2,
      fill: 'rgba(0, 100, 255, 0.1)',
      draggable: false,
      id: circleId
    })
    
    // Store creationTime in node attrs for persistence
    circleShape.setAttr('creationTime', creationTime)

    attachCircleHandlers(state, circleShape)
    
    circle.shape = circleShape
    circleShapes(state).set(circleId, circle)
    circleShapesGroup?.add(circleShape)
    
    // Register as CanvasItem
    createCircleItem(state, circleShape)
    
    // Reset drawing state
    state.circle.currentCenter.value = null
    state.circle.currentRadius.value = 0
    
    // Serialize circle state for hotreload
    serializeCircleState(state)
    
    circleShapesGroup?.getLayer()?.batchDraw()
    updateBakedCircleData(state) // Update baked data after creating circle
  })
}

// Function to generate baked circle data for external rendering (p5, three.js, etc.)
export const generateBakedCircleData = (
  canvasState: CanvasRuntimeState
): { data: CircleRenderData, groupMap: Record<string, number[]> } => {
  const circleShapesGroup = canvasState.groups.circleShapes
  if (!circleShapesGroup) return { data: [], groupMap: {} }

  // Track circle indices and group map
  let circleIndex = 0
  const groupMap: Record<string, number[]> = {}

  // Helper function to process a Konva node recursively
  const processNode = (node: Konva.Node): FlattenedCircle | null => {
    if (node instanceof Konva.Circle) {
      const r = node.radius()
      const t = node.getAbsoluteTransform()
      
      // Transform center and axes
      const c = t.point({ x: 0, y: 0 })  // Center in node-local coords
      const ex = t.point({ x: r, y: 0 })
      const ey = t.point({ x: 0, y: r })
      
      const rx = Math.hypot(ex.x - c.x, ex.y - c.y)
      const ry = Math.hypot(ey.x - c.x, ey.y - c.y)
      const rotation = Math.atan2(ex.y - c.y, ex.x - c.x)
      
      // Extract metadata from the Konva node
      const metadata = node.getAttr('metadata')
      
      // Find the runtime circle to get its ID
      const circleRuntime = Array.from(canvasState.circle.shapes.values()).find(c => c.shape === node)
      const circleId = circleRuntime?.id || node.id()
      
      // If circle metadata has a "name", add it to the group map as a group with 1 circle
      if (metadata && metadata.name && typeof metadata.name === 'string') {
        if (!groupMap[metadata.name]) {
          groupMap[metadata.name] = []
        }
        groupMap[metadata.name].push(circleIndex)
      }

      // Increment circle index for this concrete circle
      circleIndex++

      return {
        type: 'circle',
        id: circleId,
        center: { x: c.x, y: c.y },
        r: Math.abs(rx - ry) < 1e-3 ? rx : undefined,  // Only include r if it's a true circle
        rx,
        ry,
        rotation,
        ...(metadata && { metadata }) // Only include metadata if it exists
      }
    } else if (node instanceof Konva.Group) {
      // Track circle indices for this group
      const groupStartIndex = circleIndex

      // Process group children recursively
      node.getChildren().forEach(child => {
        processNode(child)
      })

      // Extract metadata from the group node
      const metadata = node.getAttr('metadata')

      // Record group in groupMap using metadata.name or fallback to node id
      const groupCircleIndices: number[] = []
      for (let i = groupStartIndex; i < circleIndex; i++) {
        groupCircleIndices.push(i)
      }
      const groupKey = (metadata && metadata.name && typeof metadata.name === 'string') 
        ? metadata.name 
        : node.id()
      if (groupKey) {
        groupMap[groupKey] = groupCircleIndices
      }

      return null
    }

    return null
  }

  // Collect all processed circles
  const bakedCircles: FlattenedCircle[] = []

  circleShapesGroup.getChildren().forEach(child => {
    const processed = processNode(child)
    if (processed) {
      bakedCircles.push(processed)
    }
  })

  return { data: bakedCircles, groupMap }
}

// Function to update baked circle data in app state
export const updateBakedCircleData = (
  canvasState: CanvasRuntimeState
) => {
  const result = generateBakedCircleData(canvasState)
  canvasState.circle.bakedRenderData = result.data
  canvasState.circle.bakedGroupMap = result.groupMap
  canvasState.callbacks.syncAppState?.(canvasState)
}
