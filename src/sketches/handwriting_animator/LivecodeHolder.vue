<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, resolution, type FreehandRenderData, type FlattenedStroke, type FlattenedStrokeGroup, type PolygonRenderData, type FlattenedPolygon, drawFlattenedStrokeGroup, stage, setStage, activeNode, metadataText, showMetadataEditor, getActiveSingleNode, selectedPolygons, selected } from './appState';
import { inject, onMounted, onUnmounted, ref, watch, computed, shallowReactive, type ShallowReactive, shallowRef } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import Konva from 'konva';
import { getStroke } from 'perfect-freehand';
import Timeline from './Timeline.vue';
import { findClosestPolygonLineAtPoint, lineToPointDistance } from '@/creativeAlgs/shapeHelpers';
import { clearFreehandSelection, createStrokeShape, currentPoints, currentTimestamps, deserializeFreehandState, drawingStartTime, executeFreehandCommand, finishFreehandDragTracking, freehandDrawingLayer, freehandDrawMode, freehandSelectionLayer, freehandShapeLayer, freehandStrokes, getPointsBounds, getStrokePath, gridSize, isAnimating, isDrawing, selTr, serializeFreehandState, setCurrentPoints, setCurrentTimestamps, setDrawingStartTime, setFreehandDrawingLayer, setFreehandSelectionLayer, setFreehandShapeLayer, setIsDrawing, setSelTr, showGrid, startFreehandDragTracking, updateBakedStrokeData, updateFreehandDraggableStates, updateTimelineState, type FreehandStroke, groupSelectedStrokes, ungroupSelectedStrokes, freehandCanGroupRef, isFreehandGroupSelected, freehandSelectedCount, undoFreehand, canUndoFreehand, canRedoFreehand, redoFreehand, useRealTiming, deleteFreehandSelected, selectedStrokesForTimeline, timelineDuration, handleTimeUpdate, maxInterStrokeDelay } from './freehandTool';

// ==================== common stuff ====================
const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

  const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

// Tool switching
const activeTool = ref<'freehand' | 'polygon'>('freehand')

// Callback for Timeline to set animation state  
const setAnimatingState = (animating: boolean) => {
  isAnimating.value = animating
  
  // Block/unblock all stage interactions when animation state changes
  if (stage) {
    if (animating) {
      // Disable all stage interactions
      stage.listening(false)
    } else {
      // Re-enable stage interactions  
      stage.listening(true)
    }
  }
}

// Add this ref near the other refs
const konvaContainer = ref<HTMLDivElement>()

let gridLayer: Konva.Layer | undefined = undefined

// Draw grid
const drawGrid = () => {
  if (!gridLayer || !stage) return
  
  gridLayer.destroyChildren()
  
  if (!showGrid.value) {
    gridLayer.batchDraw()
    return
  }
  
  const width = stage.width()
  const height = stage.height()
  
  // Vertical lines
  for (let x = 0; x <= width; x += gridSize) {
    gridLayer.add(new Konva.Line({
      points: [x, 0, x, height],
      stroke: '#ddd',
      strokeWidth: 1,
    }))
  }
  
  // Horizontal lines
  for (let y = 0; y <= height; y += gridSize) {
    gridLayer.add(new Konva.Line({
      points: [0, y, width, y],
      stroke: '#ddd',
      strokeWidth: 1,
    }))
  }

  
  gridLayer.batchDraw()
}

// Watch for tool changes to manage layer interactivity (not visibility)
watch(activeTool, (newTool) => {
  if (newTool === 'freehand') {
    // Enable freehand layers interaction, disable polygon layers interaction
    freehandShapeLayer?.listening(true)
    freehandDrawingLayer?.listening(true)
    freehandSelectionLayer?.listening(true)
    
    polygonShapesLayer?.listening(false)
    polygonPreviewLayer?.listening(false)
    polygonControlsLayer?.listening(false)
    polygonSelectionLayer?.listening(false)
  } else if (newTool === 'polygon') {
    // Disable freehand layers interaction, enable polygon layers interaction
    freehandShapeLayer?.listening(false)
    freehandDrawingLayer?.listening(false)
    freehandSelectionLayer?.listening(false)
    
    polygonShapesLayer?.listening(true)
    polygonPreviewLayer?.listening(true)
    polygonControlsLayer?.listening(true)
    polygonSelectionLayer?.listening(true)
  }
  
  // Clear selections when switching tools
  clearFreehandSelection()
  clearPolygonSelection()
  
  // Redraw stage
  stage?.batchDraw()
})



// Function to apply metadata changes
const applyMetadata = () => {
  if (!activeNode.value) return
  try {
    const obj = JSON.parse(metadataText.value || '{}')
    activeNode.value.setAttr('metadata', obj)
    
    // Add to undo history
    if (selectedPolygons.some(node => node.id() === activeNode.value?.id())) {
      // For polygons - need to implement polygon command history if not exists
      console.log('Polygon metadata updated')
    } else {
      // For freehand shapes
      executeFreehandCommand('Edit Metadata', () => {
        // The actual change has already been applied above
      })
    }
  } catch (e) {
    alert('Invalid JSON format')
  }
}


// ================  freehand stuff ====================

// ================  polygon stuff ====================
let polygonShapesLayer: Konva.Layer | undefined = undefined
let polygonPreviewLayer: Konva.Layer | undefined = undefined
let polygonControlsLayer: Konva.Layer | undefined = undefined
let polygonSelectionLayer: Konva.Layer | undefined = undefined

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
const polygonShapes = new Map<string, PolygonShape>()
const polygonGroups = new Map<string, PolygonGroup>()

// Selection state tracking for visual feedback
const polygonOriginalStyles = new Map<string, { stroke: string, strokeWidth: number }>()

// Function to toggle polygon selection
const togglePolygonSelection = (polygonId: string) => {
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
const clearPolygonSelection = () => {
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
const generateBakedPolygonData = (): PolygonRenderData => {
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
const updateBakedPolygonData = () => {
  appState.polygonRenderData = generateBakedPolygonData()
}

// Polygon drawing state
const isDrawingPolygon = ref(false)
const currentPolygonPoints = ref<number[]>([])
const polygonMode = ref<'draw' | 'edit'>('draw')
const polygonProximityThreshold = 10 // pixels

// Separate Polygon Undo/Redo system
interface PolygonCommand {
  name: string
  beforeState: string
  afterState: string
}

const polygonCommandHistory = ref<PolygonCommand[]>([])
const polygonHistoryIndex = ref(-1)
const maxPolygonHistorySize = 50

// Track if we're currently in a polygon undo/redo operation
let isPolygonUndoRedoOperation = false

// Polygon Undo/Redo Functions
// Get current polygon state for undo/redo
const getCurrentPolygonState = () => {
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

const getCurrentPolygonStateString = (): string => {
  const state = getCurrentPolygonState()
  return JSON.stringify(state)
}

// Execute a polygon command with undo/redo support
const executePolygonCommand = (commandName: string, action: () => void) => {
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
const restorePolygonState = (stateString: string) => {
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
const canPolygonUndo = computed(() => polygonHistoryIndex.value >= 0)
const canPolygonRedo = computed(() => polygonHistoryIndex.value < polygonCommandHistory.value.length - 1)

const polygonUndo = () => {
  if (!canPolygonUndo.value) return
  
  const command = polygonCommandHistory.value[polygonHistoryIndex.value]
  console.log(`Undoing polygon command: ${command.name}`)
  
  restorePolygonState(command.beforeState)
  polygonHistoryIndex.value--
}

const polygonRedo = () => {
  if (!canPolygonRedo.value) return
  
  polygonHistoryIndex.value++
  const command = polygonCommandHistory.value[polygonHistoryIndex.value]
  console.log(`Redoing polygon command: ${command.name}`)
  
  restorePolygonState(command.afterState)
}

// Polygon drag tracking for drag operations
let polygonDragStartState: string | null = null

const startPolygonDragTracking = () => {
  polygonDragStartState = getCurrentPolygonStateString()
}

const finishPolygonDragTracking = (nodeName: string) => {
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
const serializePolygonState = () => {
  if (!stage || !polygonShapesLayer) return
  
  try {
    // Serialize only the essential polygon state
    const polygonState = getCurrentPolygonState()
    
    
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
const attachPolygonHandlers = (node: Konva.Line) => {
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

const deserializePolygonState = () => {
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
        polygonShapesLayer.add(node)
        console.log('Added polygon node to layer:', node.id(), node.isVisible())
        
        // Attach handlers to this polygon node
        attachPolygonHandlers(node)
      })
    }
    
    // Restore polygon data
    if (polygonState.polygons) {
      polygonState.polygons.forEach(([id, polygonData]: [string, any]) => {
        // Use stage.findOne to search for the polygon shape
        const shape = stage.findOne(`#${id}`) as Konva.Line
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
          group: stage.findOne(`#${id}`) as Konva.Group,
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

// Cursor update function (will be defined in onMounted)
let updateCursor: (() => void) | undefined

// Polygon tool functions
const handlePolygonClick = (pos: { x: number, y: number }) => {
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
            polygon.konvaShape.points(polygon.points)
            updatePolygonControlPoints() // Refresh control points
            serializePolygonState() // Serialize for hotreload
            polygonShapesLayer?.batchDraw()
          })
        }
      }
    }
  }
}

const handlePolygonMouseMove = () => {
  if (!isDrawingPolygon.value || polygonMode.value !== 'draw') return
  updatePolygonPreview()
}

const handlePolygonEditMouseMove = () => {
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

const updatePolygonPreview = () => {
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

const finishPolygon = () => {
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
const clearCurrentPolygon = () => {
  isDrawingPolygon.value = false
  currentPolygonPoints.value = []
  polygonPreviewLayer?.destroyChildren()
  polygonPreviewLayer?.batchDraw()
}

// Delete selected polygon
const deleteSelectedPolygon = () => {
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
const updatePolygonControlPoints = () => {
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
        polygonControlsLayer.add(controlPoint)
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

// Watch for selection changes to update metadata editor
watch([() => selected.length, () => selectedPolygons.length, activeNode], () => {
  const newActiveNode = getActiveSingleNode()
  activeNode.value = newActiveNode
  
  if (newActiveNode) {
    const metadata = newActiveNode.getAttr('metadata') ?? {}
    metadataText.value = JSON.stringify(metadata, null, 2)
    showMetadataEditor.value = true
  } else {
    metadataText.value = ''
    showMetadataEditor.value = false
  }
})



// ====================  main ====================

onMounted(() => {
  try {
    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    // Remove the manual container creation and use the ref instead
    if (!konvaContainer.value) {
      console.error('Konva container ref not found')
      return
    }

    // Initialize Konva using the ref
    setStage(new Konva.Stage({
      container: konvaContainer.value,
      width: resolution.width,
      height: resolution.height,
    }))
    
    // Update cursor based on mode
    updateCursor = () => {
      if (stage && konvaContainer.value) {
        konvaContainer.value.style.cursor = freehandDrawMode.value ? 'crosshair' : 'default'
      }
    }
    updateCursor()

    // Create layers
    gridLayer = new Konva.Layer()

    setFreehandShapeLayer(new Konva.Layer())
    setFreehandDrawingLayer(new Konva.Layer())
    setFreehandSelectionLayer(new Konva.Layer())
    
    // Create polygon layers
    polygonShapesLayer = new Konva.Layer()
    polygonPreviewLayer = new Konva.Layer()
    polygonControlsLayer = new Konva.Layer()
    polygonSelectionLayer = new Konva.Layer()
    
    stage.add(gridLayer)
    stage.add(freehandShapeLayer)
    stage.add(freehandDrawingLayer)
    stage.add(freehandSelectionLayer)
    stage.add(polygonShapesLayer)
    stage.add(polygonPreviewLayer)
    stage.add(polygonControlsLayer)
    stage.add(polygonSelectionLayer)
    
    // Set initial listening states based on active tool
    if (activeTool.value === 'freehand') {
      polygonShapesLayer.listening(false)
      polygonPreviewLayer.listening(false)
      polygonControlsLayer.listening(false)
      polygonSelectionLayer.listening(false)
    } else {
      freehandShapeLayer.listening(false)
      freehandDrawingLayer.listening(false)
      freehandSelectionLayer.listening(false)
    }

    // Create transformers like working example
    setSelTr(new Konva.Transformer({ 
      rotateEnabled: true, 
      keepRatio: true, 
      padding: 6,
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 5,
    }))
    
    // Add transform tracking to main transformer
    selTr.on('transformstart', () => {
      startFreehandDragTracking()
    })
    
    selTr.on('transformend', () => {
      finishFreehandDragTracking('Transform Selection')
    })
    
    freehandSelectionLayer.add(selTr)

    // Initial grid draw
    drawGrid()
    
    // Initialize polygon control points if needed  
    updatePolygonControlPoints()
    
    // Start in select mode for testing
    freehandDrawMode.value = false
    updateCursor()
    
    // Try to restore canvas state from hotreload (after all setup is complete)
    deserializeFreehandState()
    deserializePolygonState()

    // Mouse/touch event handlers
    stage.on('mousedown touchstart', (e) => {
      const pos = stage.getPointerPosition()
      if (!pos) return
      
      if (activeTool.value === 'freehand') {
        // Freehand tool logic
        if (freehandDrawMode.value) {
          // Drawing mode
          if (e.target !== stage) return
          
          setIsDrawing(true)
          setCurrentPoints([pos.x, pos.y])
          setDrawingStartTime(performance.now())
          setCurrentTimestamps([0])
          
          // Clear selection when starting to draw
          clearFreehandSelection()
        } else {
          // Selection mode
          if (e.target === stage) {
            // Clicked on empty space - clear selection
            clearFreehandSelection()
          }
        }
      } else if (activeTool.value === 'polygon') {
        // Polygon tool logic - handle draw and edit modes only
        if (e.target === stage || (polygonMode.value === 'edit' && e.target.getParent() !== polygonControlsLayer)) {
          //todo - maybe allow clicking on polygon in draw mode?
          // Handle clicks on canvas or polygon shapes (but not control points)
          handlePolygonClick(pos)
        }
      }
    })

    stage.on('mousemove touchmove', (e) => {
      if (activeTool.value === 'freehand' && isDrawing) {
        const pos = stage.getPointerPosition()
        if (!pos) return
        
        currentPoints.push(pos.x, pos.y)
        currentTimestamps.push(performance.now() - drawingStartTime)
        
        // Update preview
        freehandDrawingLayer?.destroyChildren()
        const previewPath = new Konva.Path({
          data: getStrokePath(currentPoints),
          fill: '#666',
          strokeWidth: 0,
        })
        freehandDrawingLayer?.add(previewPath)
        freehandDrawingLayer?.batchDraw()
      } else if (activeTool.value === 'polygon') {
        if (polygonMode.value === 'draw' && isDrawingPolygon.value) {
          handlePolygonMouseMove()
        } else if (polygonMode.value === 'edit') {
          handlePolygonEditMouseMove()
        }
      }
    })

    stage.on('mouseup touchend', () => {
      if (activeTool.value === 'freehand' && isDrawing) {
        setIsDrawing(false)
        freehandDrawingLayer?.destroyChildren()
        
        if (currentPoints.length > 2) {
        executeFreehandCommand('Draw Stroke', () => {
          // Create new stroke
          const creationTime = Date.now()
          const strokeId = `stroke-${creationTime}`
          
          // Get bounds for normalization
          const bounds = getPointsBounds(currentPoints)
          
          // Create normalized points
          const normalizedPoints: number[] = []
          for (let i = 0; i < currentPoints.length; i += 2) {
            normalizedPoints.push(currentPoints[i] - bounds.minX)
            normalizedPoints.push(currentPoints[i + 1] - bounds.minY)
          }
          
          const originalPath = getStrokePath(normalizedPoints)
          const stroke: FreehandStroke = {
            id: strokeId,
            points: currentPoints,
            timestamps: currentTimestamps,
            originalPath: originalPath,
            creationTime: creationTime,
            isFreehand: true, // This is a freehand stroke with timing info
          }
          
          // Create shape
          const shape = createStrokeShape(currentPoints, strokeId)
          stroke.shape = shape
          
          // Add to data structures
          freehandStrokes.set(strokeId, stroke)
          freehandShapeLayer?.add(shape)
          updateFreehandDraggableStates() // Update draggable state for new stroke
          updateTimelineState() // Update timeline state when new stroke is added
          freehandShapeLayer?.batchDraw()
          updateBakedStrokeData() // Update baked data after new stroke
        })
        }
        
        setCurrentPoints([])
        setCurrentTimestamps([])
      }
    })

    // Original p5 setup
    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const rand = (n: number) => sinN(n*123.23)

    const randColor = (seed: number) => {
      return {
        r: rand(seed) * 255,
        g: rand(seed + 1) * 255,
        b: rand(seed + 2) * 255,
        a: 1
      }
    }

    appState.drawFunctions.push((p: p5) => {
      // console.log("drawing circles", appState.circles.list.length)

      if (appState.polygonRenderData.length > 0) {
        p.push()
        appState.polygonRenderData.forEach((polygon, idx) => {
          const color = randColor(idx)
          p.fill(color.r, color.g, color.b, color.a)
          p.noStroke()
          p.beginShape()
          polygon.points.forEach(point => {
            p.vertex(point.x, point.y)
          })
          p.endShape()
        })
        p.pop()
      }

      if(appState.freehandRenderData.length > 0) {
        drawFlattenedStrokeGroup(p, appState.freehandRenderData)
      }
    })

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    
    // Escape key handling for polygon tool
    singleKeydownEvent('Escape', (ev) => {
      if (activeTool.value === 'polygon' && isDrawingPolygon.value) {
        // Auto-close the current polygon if it has at least 3 points
        if (currentPolygonPoints.value.length >= 6) {
          finishPolygon()
        } else {
          // Just cancel if not enough points
          clearCurrentPolygon()
        }
      }
    })

  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  
  // Save state before unmounting (for hot reload)
  serializeFreehandState()
  serializePolygonState()
  
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
  
  // Clean up Konva
  stage?.destroy()
})

</script>

<template>
  <div class="handwriting-animator-container">
    <div class="control-panel">
      <!-- Tool Switcher Dropdown -->
      <select v-model="activeTool" :disabled="isAnimating" class="tool-dropdown">
        <option value="freehand">✏️ Freehand</option>
        <option value="polygon">⬟ Polygon</option>
      </select>
      <span class="separator">|</span>
      
      <!-- Freehand Tool Toolbar -->
      <template v-if="activeTool === 'freehand'">
        <button @click="freehandDrawMode = !freehandDrawMode" :class="{ active: freehandDrawMode }" :disabled="isAnimating">
          {{ freehandDrawMode ? '✏️ Draw' : '👆 Select' }}
        </button>
        <button @click="showGrid = !showGrid" :class="{ active: showGrid }" :disabled="isAnimating">
          {{ showGrid ? '⊞ Grid On' : '⊡ Grid Off' }}
        </button>
        <span class="separator">|</span>
        <button @click="groupSelectedStrokes" :disabled="!freehandCanGroupRef || isAnimating">
          Group
        </button>
        <button @click="ungroupSelectedStrokes" :disabled="!isFreehandGroupSelected || isAnimating">
          Ungroup
        </button>
        <span class="separator">|</span>
        <button @click="deleteFreehandSelected" :disabled="freehandSelectedCount === 0 || isAnimating">
          🗑️ Delete
        </button>
        <span class="separator">|</span>
        <button @click="undoFreehand" :disabled="!canUndoFreehand || isAnimating" title="Undo (Ctrl/Cmd+Z)">
          ↶ Undo
        </button>
        <button @click="redoFreehand" :disabled="!canRedoFreehand || isAnimating" title="Redo (Ctrl/Cmd+Shift+Z)">
          ↷ Redo
        </button>
        <span class="separator">|</span>
        <button @click="useRealTiming = !useRealTiming" :class="{ active: useRealTiming }">
          {{ useRealTiming ? '⏱️ Real Time' : '⏱️ Max 0.3s' }}
        </button>
        <span class="separator">|</span>
        <button 
          @click="showMetadataEditor = !showMetadataEditor" 
          :class="{ active: showMetadataEditor }"
          :disabled="isAnimating"
        >
          📝 Metadata
        </button>
      </template>
      
      <!-- Polygon Tool Toolbar -->
      <template v-if="activeTool === 'polygon'">
        <button @click="polygonMode = 'draw'" :class="{ active: polygonMode === 'draw' }" :disabled="isAnimating">
          ✏️ New Shape
        </button>
        <button @click="polygonMode = 'edit'" :class="{ active: polygonMode === 'edit' }" :disabled="isAnimating">
          ✏️ Edit Shape
        </button>
        <button @click="showGrid = !showGrid" :class="{ active: showGrid }" :disabled="isAnimating">
          {{ showGrid ? '⊞ Grid On' : '⊡ Grid Off' }}
        </button>
        <span class="separator">|</span>
        <button @click="polygonUndo" :disabled="!canPolygonUndo || isAnimating" title="Undo (Ctrl/Cmd+Z)">
          ↶ Undo
        </button>
        <button @click="polygonRedo" :disabled="!canPolygonRedo || isAnimating" title="Redo (Ctrl/Cmd+Shift+Z)">
          ↷ Redo
        </button>
        <span class="separator">|</span>
        <button @click="clearCurrentPolygon" :disabled="!isDrawingPolygon || isAnimating">
          🗑️ Cancel Shape
        </button>
        <button @click="deleteSelectedPolygon" :disabled="selectedPolygons.length === 0 || isAnimating">
          🗑️ Delete
        </button>
        <span class="separator">|</span>
        <button 
          @click="showMetadataEditor = !showMetadataEditor" 
          :class="{ active: showMetadataEditor }"
          :disabled="isAnimating"
        >
          📝 Metadata
        </button>
        <span v-if="isDrawingPolygon" class="info">Drawing: {{ currentPolygonPoints.length / 2 }} points</span>
      </template>
      <span class="separator">|</span>
      <span class="info">{{ freehandSelectedCount }} selected</span>
    </div>
    <div class="canvas-wrapper">
      <div 
        ref="konvaContainer"
        class="konva-container"
        :style="{
          width: resolution.width + 'px',
          height: resolution.height + 'px',
        }"
      ></div>
    </div>
    
    <!-- Metadata Editor -->
    <div v-if="showMetadataEditor" class="metadata-panel">
      <div v-if="activeNode" class="metadata-editor">
        <h3>Shape Metadata</h3>
        <p class="metadata-help">Edit JSON metadata for the selected shape:</p>
        <textarea 
          v-model="metadataText" 
          class="metadata-textarea"
          rows="8" 
          placeholder="Enter JSON metadata..."
        ></textarea>
        <div class="metadata-buttons">
          <button @click="applyMetadata" class="save-button">Save Metadata</button>
          <button @click="showMetadataEditor = false" class="cancel-button">Close</button>
        </div>
      </div>
      <div v-else-if="selected.length > 1 || selectedPolygons.length > 1" class="multi-select-warning">
        <p>⚠️ Can only edit metadata for one shape at a time</p>
        <p>Please select a single shape to edit its metadata.</p>
      </div>
    </div>
    
    <Timeline 
      :strokes="freehandStrokes"
      :selectedStrokes="selectedStrokesForTimeline"
      :useRealTiming="useRealTiming"
      :maxInterStrokeDelay="maxInterStrokeDelay"
      :overrideDuration="timelineDuration > 0 ? timelineDuration : undefined"
      :lockWhileAnimating="setAnimatingState"
      @timeUpdate="handleTimeUpdate"
    />
    <div v-if="isAnimating" class="animation-lock-warning">
      ⚠️ Timeline has modified elements - press Stop to unlock
    </div>
  </div>
</template>

<style scoped>
.handwriting-animator-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 20px;
}

.control-panel {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px 15px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.canvas-wrapper {
  display: flex;
  justify-content: center;
}

.control-panel button {
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 5px 15px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.control-panel button:hover:not(:disabled) {
  background: #e0e0e0;
}

.control-panel button.active {
  background: #0066ff;
  color: white;
  border-color: #0066ff;
}

.control-panel button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tool-dropdown {
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 5px 10px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-dropdown:hover {
  background: #e0e0e0;
}

.tool-dropdown:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.separator {
  color: #ccc;
}

.info {
  color: #666;
  font-size: 14px;
}

.animation-lock-warning {
  color: #e67e22;
  font-size: 14px;
  font-weight: bold;
  text-align: center;
  background: #fef5e7;
  border: 1px solid #f39c12;
  border-radius: 4px;
  padding: 8px 15px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.konva-container {
  background-color: white;
  border: 1px solid black;
}

.metadata-panel {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  width: 100%;
}

.metadata-editor h3 {
  margin: 0 0 10px 0;
  color: #333;
}

.metadata-help {
  margin: 0 0 15px 0;
  color: #666;
  font-size: 14px;
}

.metadata-textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.4;
  resize: vertical;
  margin-bottom: 15px;
}

.metadata-textarea:focus {
  outline: none;
  border-color: #0066ff;
  box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.2);
}

.metadata-buttons {
  display: flex;
  gap: 10px;
}

.save-button {
  background: #28a745;
  color: white;
  border: 1px solid #28a745;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.save-button:hover {
  background: #218838;
  border-color: #218838;
}

.cancel-button {
  background: #6c757d;
  color: white;
  border: 1px solid #6c757d;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.cancel-button:hover {
  background: #5a6268;
  border-color: #5a6268;
}

.multi-select-warning {
  text-align: center;
  color: #e67e22;
  padding: 20px;
}

.multi-select-warning p {
  margin: 5px 0;
}
</style>