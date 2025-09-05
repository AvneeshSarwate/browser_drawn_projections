/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
import { TimeContext, CancelablePromisePoxy, launch } from "@/channels/base_time_context"
import { findClosestPolygonLineAtPoint } from "@/creativeAlgs/shapeHelpers"
import Konva from "konva"
import { type ShallowReactive, shallowReactive, ref, computed, watch } from "vue"
import type { PolygonRenderData, FlattenedPolygon, TemplateAppState } from "./appState"
import { globalStore, stage, activeNode, metadataText, showMetadataEditor, getActiveSingleNode, selectedPolygons } from "./appState"

const store = globalStore()
export const appState = store.appStateRef

export let polygonShapesLayer: Konva.Layer | undefined = undefined
export const setPolygonShapesLayer = (ls: Konva.Layer) => polygonShapesLayer = ls
export let polygonPreviewLayer: Konva.Layer | undefined = undefined
export const setPolygonPreviewLayer = (pl: Konva.Layer) => polygonPreviewLayer = pl
export let polygonControlsLayer: Konva.Layer | undefined = undefined
export const setPolygonControlsLayer = (cl: Konva.Layer) => polygonControlsLayer = cl
export let polygonSelectionLayer: Konva.Layer | undefined = undefined
export const setPolygonSelectionLayer = (sl: Konva.Layer) => polygonSelectionLayer = sl

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


// Polygon tool state
export const polygonShapes = new Map<string, PolygonShape>()
export const polygonGroups = new Map<string, PolygonGroup>()

// Selection state tracking for visual feedback
export const polygonOriginalStyles = new Map<string, { stroke: string, strokeWidth: number }>()

// Function to toggle polygon selection
export const togglePolygonSelection = (polygonId: string) => {
  const polygon = stage?.findOne(`#${polygonId}`) as Konva.Line
  if (!polygon) return

  // Clear previous selection
  clearPolygonSelection()

  // Select the clicked polygon
  selectedPolygons.push(polygon)
  
  // Store original styling
  polygonOriginalStyles.set(polygonId, {
    stroke: polygon.stroke() as string,
    strokeWidth: polygon.strokeWidth()
  })
  
  // Apply highlight styling
  polygon.stroke('#ff6b35') // Orange highlight
  polygon.strokeWidth(4)
  
  polygonShapesLayer?.batchDraw()
}

// Function to clear polygon selection
export const clearPolygonSelection = () => {
  selectedPolygons.forEach(node => {
    const polygon = node as Konva.Line
    const originalStyle = polygonOriginalStyles.get(polygon.id())
    if (originalStyle) {
      polygon.stroke(originalStyle.stroke)
      polygon.strokeWidth(originalStyle.strokeWidth)
    }
  })
  
  selectedPolygons.length = 0
  polygonOriginalStyles.clear()
  polygonShapesLayer?.batchDraw()
}

// Function to generate baked polygon data for external rendering (p5, three.js, etc.)
export const generateBakedPolygonData = (): PolygonRenderData => {
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
  polygonShapesLayer.getChildren().forEach(child => {
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
export const updateBakedPolygonData = () => {
  appState.polygonRenderData = generateBakedPolygonData()
}

// Polygon drawing state
export const isDrawingPolygon = ref(false)
export const currentPolygonPoints = ref<number[]>([])
export const polygonMode = ref<'draw' | 'edit'>('draw')
export const polygonProximityThreshold = 10 // pixels

// Separate Polygon Undo/Redo system
interface PolygonCommand {
  name: string
  beforeState: string
  afterState: string
}

export const polygonCommandHistory = ref<PolygonCommand[]>([])
export const polygonHistoryIndex = ref(-1)
export const maxPolygonHistorySize = 50

// Track if we're currently in a polygon undo/redo operation
export let isPolygonUndoRedoOperation = false
export const setIsPolygonUndoRedoOperation = (isUndoRedo: boolean) => isPolygonUndoRedoOperation = isUndoRedo

// Polygon Undo/Redo Functions
// Get current polygon state for undo/redo
export const getCurrentPolygonState = () => {
  if (!stage || !polygonShapesLayer) return null
  
  try {
    const layerData = polygonShapesLayer.toObject()
    const polygonsData = Array.from(polygonShapes.entries())
    const polygonGroupsData = Array.from(polygonGroups.entries())
    
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
}

export const getCurrentPolygonStateString = (): string => {
  const state = getCurrentPolygonState()
  return JSON.stringify(state)
}

// Execute a polygon command with undo/redo support
export const executePolygonCommand = (commandName: string, action: () => void) => {
  if (isPolygonUndoRedoOperation) {
    // If we're in a polygon undo/redo, just execute the action without tracking
    action()
    return
  }
  
  const beforeState = getCurrentPolygonStateString()
  if (!beforeState) return
  
  // Execute the action
  action()
  
  const afterState = getCurrentPolygonStateString()
  if (!afterState || beforeState === afterState) return
  
  // Add command to polygon history
  const command: PolygonCommand = {
    name: commandName,
    beforeState,
    afterState
  }
  
  // Remove any commands after current index (when doing new action after undo)
  polygonCommandHistory.value = polygonCommandHistory.value.slice(0, polygonHistoryIndex.value + 1)
  
  // Add new command
  polygonCommandHistory.value.push(command)
  polygonHistoryIndex.value = polygonCommandHistory.value.length - 1
  
  // Limit history size
  if (polygonCommandHistory.value.length > maxPolygonHistorySize) {
    polygonCommandHistory.value.shift()
    polygonHistoryIndex.value = polygonCommandHistory.value.length - 1
  }
  
  console.log(`Polygon Command "${commandName}" added to history. Index: ${polygonHistoryIndex.value}`)
}

// Restore polygon state from string
export const restorePolygonState = (stateString: string) => {
  if (!stateString) return
  
  isPolygonUndoRedoOperation = true
  try {
    // Temporarily store the state string
    const originalState = appState.polygonStateString
    appState.polygonStateString = stateString
    
    // Use existing deserialization logic
    deserializePolygonState()
    
    // Restore original state string for hotreload
    appState.polygonStateString = originalState
  } catch (error) {
    console.warn('Failed to restore polygon state:', error)
  } finally {
    isPolygonUndoRedoOperation = false
  }
}

// Polygon Undo/Redo functions
export const canPolygonUndo = computed(() => polygonHistoryIndex.value >= 0)
export const canPolygonRedo = computed(() => polygonHistoryIndex.value < polygonCommandHistory.value.length - 1)

export const polygonUndo = () => {
  if (!canPolygonUndo.value) return
  
  const command = polygonCommandHistory.value[polygonHistoryIndex.value]
  console.log(`Undoing polygon command: ${command.name}`)
  
  restorePolygonState(command.beforeState)
  polygonHistoryIndex.value--
}

export const polygonRedo = () => {
  if (!canPolygonRedo.value) return
  
  polygonHistoryIndex.value++
  const command = polygonCommandHistory.value[polygonHistoryIndex.value]
  console.log(`Redoing polygon command: ${command.name}`)
  
  restorePolygonState(command.afterState)
}

// Polygon drag tracking for drag operations
export let polygonDragStartState: string | null = null
export const setPolygonDragStartState = (state: string | null) => polygonDragStartState = state

export const startPolygonDragTracking = () => {
  polygonDragStartState = getCurrentPolygonStateString()
}

export const finishPolygonDragTracking = (nodeName: string) => {
  if (!polygonDragStartState) return
  
  const endState = getCurrentPolygonStateString()
  if (polygonDragStartState !== endState) {
    // Manually add to polygon history without using executePolygonCommand to avoid double state capture
    const command: PolygonCommand = {
      name: `Transform ${nodeName}`,
      beforeState: polygonDragStartState,
      afterState: endState
    }
    
    polygonCommandHistory.value = polygonCommandHistory.value.slice(0, polygonHistoryIndex.value + 1)
    polygonCommandHistory.value.push(command)
    polygonHistoryIndex.value = polygonCommandHistory.value.length - 1
    
    if (polygonCommandHistory.value.length > maxPolygonHistorySize) {
      polygonCommandHistory.value.shift()
      polygonHistoryIndex.value = polygonCommandHistory.value.length - 1
    }
    
    console.log(`Polygon transform command added to history. Index: ${polygonHistoryIndex.value}`)
    updateBakedPolygonData() // Update baked data after polygon transformation
  }
  
  polygonDragStartState = null
}

// Polygon state serialization functions
export const serializePolygonState = () => {
  if (!stage || !polygonShapesLayer) return
  
  try {
    // Serialize only the essential polygon state
    const polygonState = getCurrentPolygonState()!
    
    
    appState.polygonStateString = JSON.stringify(polygonState)
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
  
  node.draggable(false) // Polygons are not draggable, controlled by control points

  // Add any polygon-specific event handlers here if needed
  node.on('click', () => {
    if(polygonMode.value === 'draw') {
      console.log('Polygon clicked draw:', node.id())
    } else if(polygonMode.value === 'edit') {
        console.log('Polygon clicked edit:', node.id())
        togglePolygonSelection(node.id())
    }
  })
}

export const deserializePolygonState = () => {
  if (!appState.polygonStateString || !stage || !polygonShapesLayer) return
  
  try {
    const polygonState = JSON.parse(appState.polygonStateString)
    console.log('Deserializing polygon state:', { 
      layerChildren: polygonState.layer?.children?.length || 0, 
      polygons: polygonState.polygons?.length || 0,
      polygonGroups: polygonState.polygonGroups?.length || 0 
    })
    
    // Clear existing polygon content
    polygonShapesLayer.destroyChildren()
    polygonShapes.clear()
    polygonGroups.clear()
    selectedPolygons.length = 0
    
    // Restore polygon layer content using Konva.Node.create
    const layerData = polygonState.layer
    if (layerData && layerData.children) {
      console.log('Restoring', layerData.children.length, 'polygon shapes')
      layerData.children.forEach((childData: any, index: number) => {
        console.log('Creating polygon node', index, 'of type', childData.className)
        const node = Konva.Node.create(JSON.stringify(childData)) as Konva.Line
        polygonShapesLayer!.add(node)
        console.log('Added polygon node to layer:', node.id(), node.isVisible())
        
        // Attach handlers to this polygon node
        attachPolygonHandlers(node)
      })
    }
    
    // Restore polygon data
    if (polygonState.polygons) {
      polygonState.polygons.forEach(([id, polygonData]: [string, any]) => {
        // Use stage.findOne to search for the polygon shape
        const shape = stage!.findOne(`#${id}`) as Konva.Line
        console.log('Restoring polygon:', id, 'found shape:', !!shape)
        const polygon: PolygonShape = {
          id: polygonData.id,
          points: polygonData.points,
          closed: polygonData.closed,
          creationTime: polygonData.creationTime,
          konvaShape: shape,
          controlPoints: [], // Will be recreated by updatePolygonControlPoints
        }
        polygonShapes.set(id, polygon)
      })
    }
    
    // Restore polygon groups
    if (polygonState.polygonGroups) {
      polygonState.polygonGroups.forEach(([id, groupData]: [string, any]) => {
        const group: PolygonGroup = {
          id: groupData.id,
          polygonIds: groupData.polygonIds,
          group: stage!.findOne(`#${id}`) as Konva.Group,
        }
        polygonGroups.set(id, group)
      })
    }
    
    // Clear any existing control points first
    polygonControlsLayer?.destroyChildren()
    
    // Update polygon control points if in edit mode
    if (polygonMode.value === 'edit') {
      updatePolygonControlPoints()
    }
    
    polygonShapesLayer.batchDraw()
    updateBakedPolygonData() // Update baked data after deserialization
    
    console.log('Polygon state restored from hotreload')
  } catch (error) {
    console.warn('Failed to deserialize polygon state:', error)
  }
}

// Polygon tool functions
export const handlePolygonClick = (pos: { x: number, y: number }) => {
  if (!polygonShapesLayer) return
  
  if (polygonMode.value === 'draw') {
    // New shape mode - point-by-point drawing
    if (!isDrawingPolygon.value) {
      // Start new polygon
      isDrawingPolygon.value = true
      currentPolygonPoints.value = [pos.x, pos.y]
    } else {
      // Check if close to first point (close polygon)
      const firstX = currentPolygonPoints.value[0]
      const firstY = currentPolygonPoints.value[1]
      const distance = Math.sqrt((pos.x - firstX) ** 2 + (pos.y - firstY) ** 2)
      
      if (distance < polygonProximityThreshold && currentPolygonPoints.value.length >= 6) {
        // Close the polygon
        finishPolygon()
      } else {
        // Add new point
        currentPolygonPoints.value.push(pos.x, pos.y)
        updatePolygonPreview()
      }
    }
    updatePolygonPreview()
  } else if (polygonMode.value === 'edit') {
    // Edit shape mode - add points to existing polygons only if not clicking on a control point
    const polygonArray = Array.from(polygonShapes.values()).map(p => ({ 
      points: p.points.map((val, idx) => idx % 2 === 0 ? { x: val, y: p.points[idx + 1] } : null)
        .filter(p => p !== null) as { x: number, y: number }[] 
    }))
    
    if (polygonArray.length > 0) {
      const result = findClosestPolygonLineAtPoint(polygonArray, pos)
      
      if (result.polygonIndex >= 0 && result.distance < 20) {
        // Add point to the middle of the closest line segment
        const polygonId = Array.from(polygonShapes.keys())[result.polygonIndex]
        const polygon = polygonShapes.get(polygonId)
        
        if (polygon && polygon.konvaShape) {
          executePolygonCommand('Add Polygon Point', () => {
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
            serializePolygonState() // Serialize for hotreload
            polygonShapesLayer?.batchDraw()
          })
        }
      }
    }
  }
}

export const handlePolygonMouseMove = () => {
  if (!isDrawingPolygon.value || polygonMode.value !== 'draw') return
  updatePolygonPreview()
}

export const handlePolygonEditMouseMove = () => {
  if (!polygonPreviewLayer || !stage || polygonShapes.size === 0) return
  
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
  
  // Find the closest polygon edge
  const polygonArray = Array.from(polygonShapes.values()).map(p => ({ 
    points: p.points.map((val, idx) => idx % 2 === 0 ? { x: val, y: p.points[idx + 1] } : null)
      .filter(p => p !== null) as { x: number, y: number }[] 
  }))
  
  if (polygonArray.length > 0) {
    const result = findClosestPolygonLineAtPoint(polygonArray, mousePos)
    
    polygonPreviewLayer.destroyChildren()
    
    if (result.polygonIndex >= 0 && result.distance < 20) {
      const polygon = Array.from(polygonShapes.values())[result.polygonIndex]
      const points = polygon.points
      
      // Get the edge endpoints
      const p1x = points[result.lineIndex * 2]
      const p1y = points[result.lineIndex * 2 + 1]
      const p2x = points[((result.lineIndex + 1) * 2) % points.length]
      const p2y = points[((result.lineIndex + 1) * 2 + 1) % points.length]
      
      // Calculate midpoint
      const midX = (p1x + p2x) / 2
      const midY = (p1y + p2y) / 2
      
      // Highlight the edge
      const edgeLine = new Konva.Line({
        points: [p1x, p1y, p2x, p2y],
        stroke: '#00ff00',
        strokeWidth: 4,
        opacity: 0.8
      })
      polygonPreviewLayer.add(edgeLine)
      
      // Show midpoint where new point would be added
      const midpointCircle = new Konva.Circle({
        x: midX,
        y: midY,
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
  if (!polygonPreviewLayer || !stage) return
  
  polygonPreviewLayer.destroyChildren()
  
  if (currentPolygonPoints.value.length < 4) {
    // If we only have one point, just show that point as a circle
    if (currentPolygonPoints.value.length === 2) {
      const pointCircle = new Konva.Circle({
        x: currentPolygonPoints.value[0],
        y: currentPolygonPoints.value[1],
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
  for (let i = 0; i < currentPolygonPoints.value.length; i += 2) {
    const pointCircle = new Konva.Circle({
      x: currentPolygonPoints.value[i],
      y: currentPolygonPoints.value[i + 1],
      radius: 4,
      fill: '#0066ff',
      stroke: '#004499',
      strokeWidth: 1,
      listening: false
    })
    polygonPreviewLayer.add(pointCircle)
  }
  
  // Create preview line from current points to mouse position
  const previewPoints = [...currentPolygonPoints.value, mousePos.x, mousePos.y]
  
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
  if (currentPolygonPoints.value.length >= 6) {
    const firstX = currentPolygonPoints.value[0]
    const firstY = currentPolygonPoints.value[1]
    const distance = Math.sqrt((mousePos.x - firstX) ** 2 + (mousePos.y - firstY) ** 2)
    
    const firstPointIndicator = new Konva.Circle({
      x: firstX,
      y: firstY,
      radius: polygonProximityThreshold,
      stroke: distance < polygonProximityThreshold ? '#00ff00' : '#ff0000',
      strokeWidth: 2,
      fill: 'transparent',
      listening: false
    })
    
    polygonPreviewLayer.add(firstPointIndicator)
  }
  
  polygonPreviewLayer.batchDraw()
}

export const finishPolygon = () => {
  if (currentPolygonPoints.value.length < 6) return // Need at least 3 points
  
  executePolygonCommand('Create Polygon', () => {
    const polygonId = `polygon-${Date.now()}`
    const polygon: PolygonShape = {
      id: polygonId,
      points: [...currentPolygonPoints.value],
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
    polygonShapes.set(polygonId, polygon)
    polygonShapesLayer?.add(polygonLine)
    
    // Reset drawing state to allow drawing new shapes
    isDrawingPolygon.value = false
    currentPolygonPoints.value = []
    polygonPreviewLayer?.destroyChildren()
    
    // Update control points if in edit mode
    updatePolygonControlPoints()
    
    // Serialize polygon state for hotreload
    serializePolygonState()
    
    polygonShapesLayer?.batchDraw()
    polygonPreviewLayer?.batchDraw()
    updateBakedPolygonData() // Update baked data after creating polygon
  })
}

// Clear current polygon being drawn
export const clearCurrentPolygon = () => {
  isDrawingPolygon.value = false
  currentPolygonPoints.value = []
  polygonPreviewLayer?.destroyChildren()
  polygonPreviewLayer?.batchDraw()
}

// Delete selected polygon
export const deleteSelectedPolygon = () => {
  if (selectedPolygons.length === 0) return
  
  executePolygonCommand('Delete Selected Polygon', () => {
    selectedPolygons.forEach(node => {
      const polygonId = node.id()
      node.destroy()
      // Remove from polygons map
      polygonShapes.delete(polygonId)
    })
    clearPolygonSelection()
    polygonShapesLayer?.batchDraw()
    updateBakedPolygonData() // Update baked data after polygon deletion
  })
}

// Show/hide control points for polygon editing
export const updatePolygonControlPoints = () => {
  if (!polygonControlsLayer) return
  
  // Clear existing control points
  polygonControlsLayer.destroyChildren()
  
  if (polygonMode.value === 'edit') {
    // Show control points for all polygons
    polygonShapes.forEach((polygon) => {
      // Clear existing control points array
      polygon.controlPoints = []
      
      // Create control points for each vertex
      for (let i = 0; i < polygon.points.length; i += 2) {
        const pointIndex = i // Capture the index for the closure
        const x = polygon.points[pointIndex]
        const y = polygon.points[pointIndex + 1]
        
        const controlPoint = new Konva.Circle({
          x: x,
          y: y,
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
          // Update the polygon points array
          polygon.points[pointIndex] = controlPoint.x()
          polygon.points[pointIndex + 1] = controlPoint.y()
          // Update the Konva shape
          if (polygon.konvaShape) {
            polygon.konvaShape.points(polygon.points)
            polygonShapesLayer?.batchDraw()
          }
        })
        
        // Add drag end handler to track final state and serialize
        controlPoint.on('dragend', () => {
          finishPolygonDragTracking('Polygon Control Point')
          serializePolygonState()
        })
        
        polygon.controlPoints.push(controlPoint)
        polygonControlsLayer!.add(controlPoint)
      }
    })
  }
  
  polygonControlsLayer.batchDraw()
}

// Watch for polygon mode changes to update control points and reset state
watch(polygonMode, (newMode) => {
  // Clear selection when switching modes
  clearPolygonSelection()
  
  if (newMode === 'draw') {
    // When switching to draw mode, clear any current drawing state
    isDrawingPolygon.value = false
    currentPolygonPoints.value = []
    polygonPreviewLayer?.destroyChildren()
    polygonPreviewLayer?.batchDraw()
  } else if (newMode === 'edit') {
    // When switching to edit mode, clear any drawing preview
    polygonPreviewLayer?.destroyChildren()
    polygonPreviewLayer?.batchDraw()
  }
  updatePolygonControlPoints()
  clearPolygonSelection()
})