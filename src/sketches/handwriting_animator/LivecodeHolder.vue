<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref, watch, computed } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import Konva from 'konva';
import { getStroke } from 'perfect-freehand';
import Timeline from './Timeline.vue';
import { findClosestPolygonLineAtPoint, lineToPointDistance } from '@/creativeAlgs/shapeHelpers';

// ==================== common stuff ====================
const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

let stage: Konva.Stage | undefined = undefined

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
  selectedPolygons.length = 0
  
  // Redraw stage
  stage?.batchDraw()
})


// ================  freehand stuff ====================

let freehandShapeLayer: Konva.Layer | undefined = undefined
let freehandDrawingLayer: Konva.Layer | undefined = undefined
let freehandSelectionLayer: Konva.Layer | undefined = undefined

// Drawing state
let isDrawing = false
let currentPoints: number[] = []
let currentTimestamps: number[] = []
let drawingStartTime = 0

// Transform controls - for freehand
let selTr: Konva.Transformer | undefined = undefined
let grpTr: Konva.Transformer | undefined = undefined

// Helper functions from working example
const freehandLockPivot = (node: Konva.Group | Konva.Node) => {
  //@ts-ignore
  const box = node.getClientRect({ relativeTo: node })
  node.offset({ x: box.width / 2, y: box.height / 2 })
  node.position({ x: node.x() + box.width / 2, y: node.y() + box.height / 2 })
}

// Return the top-most group (direct child of layer) for any descendant click
const freehandTopGroup = (node: Konva.Node): Konva.Group | null => {
  if (!freehandShapeLayer) return null
  let cur = node
  let candidate: Konva.Group | null = null
  while (cur && cur !== freehandShapeLayer) {
    if (cur instanceof Konva.Group) candidate = cur
    cur = cur.getParent()
  }
  return candidate
}

// Guard against selecting ancestor & descendant simultaneously
const hasAncestorConflict = (nodes: Konva.Node[]): boolean => {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].isAncestorOf(nodes[j]) || nodes[j].isAncestorOf(nodes[i])) return true
    }
  }
  return false
}

// Helper function to get all strokes that are selected (including those in groups)
const getSelectedStrokes = (): FreehandStroke[] => {
  const selectedStrokes: FreehandStroke[] = []
  const processedStrokeIds = new Set<string>()
  
  selected.forEach(node => {
    if (node instanceof Konva.Group) {
      // If it's a group, find all strokes in that group
      const findStrokesInGroup = (group: Konva.Group) => {
        group.getChildren().forEach(child => {
          if (child instanceof Konva.Group) {
            // Nested group
            findStrokesInGroup(child)
          } else if (child instanceof Konva.Path) {
            // Find corresponding stroke
            freehandStrokes.forEach(stroke => {
              if (stroke.shape === child && !processedStrokeIds.has(stroke.id)) {
                selectedStrokes.push(stroke)
                processedStrokeIds.add(stroke.id)
              }
            })
          }
        })
      }
      findStrokesInGroup(node)
    } else if (node instanceof Konva.Path) {
      // Individual stroke
      freehandStrokes.forEach(stroke => {
        if (stroke.shape === node && !processedStrokeIds.has(stroke.id)) {
          selectedStrokes.push(stroke)
          processedStrokeIds.add(stroke.id)
        }
      })
    }
  })
  
  return selectedStrokes
}

// Selection functions from working example
const freehandAddSelection = (node: Konva.Node) => { 
  console.log('Adding to selection:', node.id(), node.constructor.name)
  if (!selected.includes(node)) selected.push(node) 
  console.log('Selected array now has:', selected.length, 'items')
  freehandRefreshUI() 
}

const freehandToggleSelection = (node: Konva.Node) => { 
  const idx = selected.indexOf(node) 
  idx >= 0 ? selected.splice(idx, 1) : selected.push(node) 
  freehandRefreshUI() 
}

const clearFreehandSelection = () => { 
  selected.length = 0 
  freehandRefreshUI() 
}

// Update timeline state based on current selection
const updateTimelineState = () => {
  const oldDuration = timelineDuration.value
  let newDuration = 0
  
  if (selected.length === 0) {
    // No selection - use all strokes
    selectedStrokesForTimeline.value = new Set()
    timelineDuration.value = 0 // Timeline component will calculate total duration
  } else {
    // Selection exists - calculate selected strokes and trimmed duration
    const selectedStrokes = getSelectedStrokes().filter(stroke => stroke.isFreehand)
    
    // Update selected strokes set for timeline
    const strokeIds = new Set(selectedStrokes.map(s => s.id))
    selectedStrokesForTimeline.value = strokeIds
    
    // Calculate trimmed timeline duration
    if (selectedStrokes.length > 0) {
      // Sort selected strokes by creation time
      const sortedStrokes = selectedStrokes.sort((a, b) => a.creationTime - b.creationTime)
      
      // Calculate total duration like in handleTimeUpdate
      let totalDuration = 0
      sortedStrokes.forEach((stroke, index) => {
        const strokeDuration = stroke.timestamps[stroke.timestamps.length - 1] || 0
        totalDuration += strokeDuration
        
        // Add gap if not the last stroke (0.1s for selections)
        if (index < sortedStrokes.length - 1) {
          totalDuration += 100 // 0.1s gap
        }
      })
      
      newDuration = totalDuration
      timelineDuration.value = totalDuration
    } else {
      timelineDuration.value = 0
    }
  }
  
  // Reset playback time if it's beyond the new duration
  if (newDuration > 0 && currentPlaybackTime.value > newDuration) {
    currentPlaybackTime.value = 0
    // Trigger time update to reset visual state
    handleTimeUpdate(0)
  }
}

// UI refresh function from working example
const freehandRefreshUI = () => {
  if (!selTr || !freehandShapeLayer) return
  
  // Ensure stroke connections are up to date
  refreshStrokeConnections()
  
  // transformers
  if (selected.length === 1 && selected[0] instanceof Konva.Group) {
    if (!grpTr) { 
      grpTr = new Konva.Transformer({ rotateEnabled: true, keepRatio: true, padding: 6 })
      
      // Add transform tracking to group transformer
      grpTr.on('transformstart', () => {
        startFreehandDragTracking()
      })
      
      grpTr.on('transformend', () => {
        finishFreehandDragTracking('Transform Group')
      })
      
      freehandSelectionLayer?.add(grpTr) 
    }
    console.log('Using group transformer for:', selected[0].id())
    grpTr.nodes([selected[0]])
    selTr.nodes([])
  } else {
    console.log('Using selection transformer for:', selected.length, 'nodes:', selected.map(n => n.id()))
    selTr.nodes(selected)
    if (grpTr) grpTr.nodes([])
  }

  // Update UI refs like working example
  freehandSelectedCount.value = selected.length
  isFreehandGroupSelected.value = selected.length === 1 && selected[0] instanceof Konva.Group
  
  // Update button states like working example
  const canGroup = selected.length >= 2 && !hasAncestorConflict(selected)
  freehandCanGroupRef.value = canGroup

  // Update timeline-related state
  updateTimelineState()

  freehandShapeLayer.batchDraw()
}

// Stroke data structure
interface FreehandStroke {
  id: string
  points: number[]
  timestamps: number[]
  shape?: Konva.Path
  selected?: boolean
  originalPath?: string // Store original path data for animation
  creationTime: number // Absolute time when stroke was created
  isFreehand: boolean // Track if this is a freehand stroke with timing info
}

interface FreehandStrokeGroup {
  id: string
  strokeIds: string[]
  group?: Konva.Group
}

const freehandStrokes = new Map<string, FreehandStroke>()
const freehandStrokeGroups = new Map<string, FreehandStrokeGroup>()
// Selection state - plain array like working example (no ref to avoid proxy issues)
const selected: Konva.Node[] = []

// Separate refs for UI state for freehand
const freehandSelectedCount = ref(0)
const isFreehandGroupSelected = ref(false)
const freehandCanGroupRef = ref(false)
const selectedStrokesForTimeline = ref(new Set<string>())
const timelineDuration = ref(0)
const showGrid = ref(false)
const gridSize = 20
const currentPlaybackTime = ref(0)
const freehandDrawMode = ref(true) // true = draw mode, false = select mode
const useRealTiming = ref(false) // false = use max threshold, true = use actual timing
const maxInterStrokeDelay = 300 // 0.3 seconds max gap between strokes

// Undo/Redo system for freehand
interface FreehandCommand {
  name: string
  beforeState: string
  afterState: string
}

const freehandCommandHistory = ref<FreehandCommand[]>([])
const freehandHistoryIndex = ref(-1)
const maxHistorySize = 50

// Track if we're currently in an undo/redo operation to prevent adding to history
let isUndoRedoOperation = false

// Track if animation is currently playing for UI locking
const isAnimating = ref(false)



// Get current canvas state for undo/redo (freehand only)
const getCurrentFreehandState = () => {
  if (!stage || !freehandShapeLayer) return null
  
  try {
    const layerData = freehandShapeLayer.toObject()
    const strokesData = Array.from(freehandStrokes.entries())
    const strokeGroupsData = Array.from(freehandStrokeGroups.entries())
    
    const canvasState = {
      layer: layerData,
      strokes: strokesData,
      strokeGroups: strokeGroupsData,
    }
    
    return canvasState
  } catch (error) {
    console.warn('Failed to get current state:', error)
    return null
  }
}

const getCurrentFreehandStateString = (): string => {  
  const state = getCurrentFreehandState()
  return JSON.stringify(state)
}

// Execute a command with undo/redo support
const executeFreehandCommand = (commandName: string, action: () => void) => {
  if (isUndoRedoOperation) {
    // If we're in an undo/redo, just execute the action without tracking
    action()
    return
  }
  
  const beforeState = getCurrentFreehandStateString()
  if (!beforeState) return
  
  // Execute the action
  action()
  
  const afterState = getCurrentFreehandStateString()
  if (!afterState || beforeState === afterState) return
  
  // Add command to history
  const command: FreehandCommand = {
    name: commandName,
    beforeState,
    afterState
  }
  
  // Remove any commands after current index (when doing new action after undo)
  freehandCommandHistory.value = freehandCommandHistory.value.slice(0, freehandHistoryIndex.value + 1)
  
  // Add new command
  freehandCommandHistory.value.push(command)
  freehandHistoryIndex.value = freehandCommandHistory.value.length - 1
  
  // Limit history size
  if (freehandCommandHistory.value.length > maxHistorySize) {
    freehandCommandHistory.value.shift()
    freehandHistoryIndex.value = freehandCommandHistory.value.length - 1
  }
  
  console.log(`Command "${commandName}" added to history. Index: ${freehandHistoryIndex.value}`)
}

// Restore state from string (freehand only)
const restoreFreehandState = (stateString: string) => {
  if (!stateString) return
  
  isUndoRedoOperation = true
  try {
    // Reset animation state to prevent interference
    const wasAnimating = currentPlaybackTime.value > 0
    currentPlaybackTime.value = 0
    isAnimating.value = false
    
    // Temporarily store the state string
    const originalState = appState.freehandStateString
    appState.freehandStateString = stateString
    
    // Use existing deserialization logic
    deserializeFreehandState()
    
    // Restore original state string for hotreload
    appState.freehandStateString = originalState
    
    // If animation was running, reset it to ensure proper state
    if (wasAnimating) {
      handleTimeUpdate(0)
    }
  } catch (error) {
    console.warn('Failed to restore state:', error)
  } finally {
    isUndoRedoOperation = false
  }
}

// Undo/Redo functions
const canUndoFreehand = computed(() => freehandHistoryIndex.value >= 0)
const canRedoFreehand = computed(() => freehandHistoryIndex.value < freehandCommandHistory.value.length - 1)

const undoFreehand = () => {
  if (!canUndoFreehand.value) return
  
  const command = freehandCommandHistory.value[freehandHistoryIndex.value]
  console.log(`Undoing command: ${command.name}`)
  
  restoreFreehandState(command.beforeState)
  freehandHistoryIndex.value--
}

const redoFreehand = () => {
  if (!canRedoFreehand.value) return
  
  freehandHistoryIndex.value++
  const command = freehandCommandHistory.value[freehandHistoryIndex.value]
  console.log(`Redoing command: ${command.name}`)
  
  restoreFreehandState(command.afterState)
}

// Transform tracking for drag operations
let freehandDragStartState: string | null = null

const startFreehandDragTracking = () => {
  freehandDragStartState = getCurrentFreehandStateString()
}

const finishFreehandDragTracking = (nodeName: string) => {
  if (!freehandDragStartState) return
  
  const endState = getCurrentFreehandStateString()
  if (freehandDragStartState !== endState) {
    // Manually add to history without using executeCommand to avoid double state capture
    const command: FreehandCommand = {
      name: `Transform ${nodeName}`,
      beforeState: freehandDragStartState,
      afterState: endState
    }
    
    freehandCommandHistory.value = freehandCommandHistory.value.slice(0, freehandHistoryIndex.value + 1)
    freehandCommandHistory.value.push(command)
    freehandHistoryIndex.value = freehandCommandHistory.value.length - 1
    
    if (freehandCommandHistory.value.length > maxHistorySize) {
      freehandCommandHistory.value.shift()
      freehandHistoryIndex.value = freehandCommandHistory.value.length - 1
    }
    
    console.log(`Transform command added to history. Index: ${freehandHistoryIndex.value}`)
  }
  
  freehandDragStartState = null
}

// Function to refresh stroke-shape connections
const refreshStrokeConnections = () => {
  freehandStrokes.forEach((stroke, id) => {
    const currentShape = stage?.findOne(`#${id}`) as Konva.Path
    if (currentShape && currentShape !== stroke.shape) {
      console.log('Updating stroke connection for:', id)
      stroke.shape = currentShape
    }
  })
}

// Serialization functions for hotreloading
const serializeFreehandState = () => {
  if (!stage || !freehandShapeLayer) return
  
  try {
    const canvasState = getCurrentFreehandState()
    
    appState.freehandStateString = JSON.stringify(canvasState)
    console.log('Serialized canvas state:', { 
      layerChildren: canvasState.layer?.children?.length || 0, 
      strokes: canvasState.strokes.length,
      strokeGroups: canvasState.strokeGroups.length 
    })
  } catch (error) {
    console.warn('Failed to serialize Konva state:', error)
  }
}

const deserializeFreehandState = () => {
  if (!appState.freehandStateString || !stage || !freehandShapeLayer) return
  
  try {
    const canvasState = JSON.parse(appState.freehandStateString)
    console.log('Deserializing canvas state:', { 
      layerChildren: canvasState.layer?.children?.length || 0, 
      strokes: canvasState.strokes?.length || 0,
      strokeGroups: canvasState.strokeGroups?.length || 0 
    })
    
    // Clear existing content
    freehandShapeLayer.destroyChildren()
    freehandStrokes.clear()
    freehandStrokeGroups.clear()
    selected.length = 0
    
    // Function to recursively attach handlers to all nodes
    const attachHandlersRecursively = (node: Konva.Node) => {
      // Shared setup for both Path and Group nodes
      if (node instanceof Konva.Path || node instanceof Konva.Group) {
        const nodeType = node instanceof Konva.Path ? 'path' : 'group'
        console.log(`Attaching handlers to ${nodeType}:`, node.id())
        
        node.draggable(true)
      
        node.on('click', (e) => {
          e.cancelBubble = true
          handleClick(node, e.evt.shiftKey)
        })
        
        node.on('dragstart', () => {
          startFreehandDragTracking()
        })
        
        node.on('dragend', () => {
          finishFreehandDragTracking(node.constructor.name)
          freehandShapeLayer?.batchDraw()
        })
        
        // Group-specific logic: recursively attach handlers to all children
        if (node instanceof Konva.Group) {
          node.getChildren().forEach(child => {
            attachHandlersRecursively(child)
          })
        }
      }
    }
    
    // Restore layer content using Konva.Node.create
    const layerData = canvasState.layer
    if (layerData && layerData.children) {
      console.log('Restoring', layerData.children.length, 'children')
      layerData.children.forEach((childData: any, index: number) => {
        console.log('Creating node', index, 'of type', childData.className)
        const node = Konva.Node.create(JSON.stringify(childData))
        freehandShapeLayer.add(node)
        console.log('Added node to layer:', node.id(), node.isVisible())
        
        // Recursively attach handlers to this node and all its children
        attachHandlersRecursively(node)
      })
    }
    
    // Restore stroke data
    if (canvasState.strokes) {
      canvasState.strokes.forEach(([id, strokeData]: [string, any]) => {
        // Use stage.findOne to search recursively through all groups
        const shape = stage.findOne(`#${id}`) as Konva.Path
        console.log('Restoring stroke:', id, 'found shape:', !!shape)
        const stroke: FreehandStroke = {
          id: strokeData.id,
          points: strokeData.points,
          timestamps: strokeData.timestamps,
          originalPath: strokeData.originalPath,
          creationTime: strokeData.creationTime,
          isFreehand: strokeData.isFreehand,
          shape: shape,
        }
        freehandStrokes.set(id, stroke)
      })
    }
    
    // Restore stroke groups
    if (canvasState.strokeGroups) {
      canvasState.strokeGroups.forEach(([id, groupData]: [string, any]) => {
        const group: FreehandStrokeGroup = {
          id: groupData.id,
          strokeIds: groupData.strokeIds,
          group: stage.findOne(`#${id}`) as Konva.Group,
        }
        freehandStrokeGroups.set(id, group)
      })
    }
    
    // Update UI states
    refreshStrokeConnections() // Ensure all connections are properly established
    updateFreehandDraggableStates()
    
    // Force refresh the transformers to ensure they work with restored shapes
    if (selTr) {
      selTr.nodes([])
      selTr.forceUpdate()
    }
    if (grpTr) {
      grpTr.nodes([])  
      grpTr.forceUpdate()
    }
    
    freehandShapeLayer.batchDraw()
    
    console.log('Konva canvas state restored from hotreload')
    
    // Force a redraw to make sure everything is visible
    setTimeout(() => {
      freehandShapeLayer.batchDraw()
    }, 30)
  } catch (error) {
    console.warn('Failed to deserialize Konva state:', error)
  }
}

// Function to update draggable state based on mode and group membership
const updateFreehandDraggableStates = () => {
  console.log('updateDraggableStates called, drawMode:', freehandDrawMode.value, 'strokes count:', freehandStrokes.size)
  
  // Update all shapes
  freehandStrokes.forEach((stroke, id) => {
    if (stroke.shape) {
      // Check if stroke is in a group by looking at parent
      const parent = stroke.shape.getParent()
      const isInGroup = parent && parent !== freehandShapeLayer
      
      const shouldBeDraggable = !freehandDrawMode.value && !isInGroup
      console.log('Stroke', id, 'parent:', parent?.constructor.name, 'isInGroup:', isInGroup, 'shouldBeDraggable:', shouldBeDraggable)
      
      // Only draggable if in select mode AND not in a group
      stroke.shape.draggable(shouldBeDraggable)
    } else {
      console.log('Stroke', id, 'has no shape!')
    }
  })
  
  // Update all groups
  if (freehandShapeLayer) {
    freehandShapeLayer.getChildren().forEach(child => {
      if (child instanceof Konva.Group) {
        child.draggable(!freehandDrawMode.value)
      }
    })
  }
}

// Helper function to convert points to perfect-freehand stroke
const getStrokePath = (points: number[], normalize: boolean = false): string => {
  if (points.length < 4) return ''
  
  // Convert flat array to point pairs
  const inputPoints: [number, number][] = []
  for (let i = 0; i < points.length; i += 2) {
    inputPoints.push([points[i], points[i + 1]])
  }
  
  // Get stroke outline using perfect-freehand
  const strokePoints = getStroke(inputPoints, {
    size: 8,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: true,
  })
  
  // Convert to SVG path
  if (strokePoints.length === 0) return ''
  
  let finalPoints = strokePoints
  
  // If normalizing, find bounds and translate to 0,0
  if (normalize) {
    let minX = Infinity, minY = Infinity
    strokePoints.forEach(([x, y]) => {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
    })
    finalPoints = strokePoints.map(([x, y]) => [x - minX, y - minY] as [number, number])
  }
  
  const d = finalPoints.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      return `${acc} ${x0},${y0} ${x1},${y1}`
    },
    `M ${finalPoints[0][0]},${finalPoints[0][1]} L`
  )
  
  return `${d} Z`
}

const getPointsBounds = (points: number[]): { minX: number, minY: number, maxX: number, maxY: number } => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i])
    maxX = Math.max(maxX, points[i])
    minY = Math.min(minY, points[i + 1])
    maxY = Math.max(maxY, points[i + 1])
  }
  return { minX, minY, maxX, maxY }
}

// Helper function to create a new stroke shape
const createStrokeShape = (points: number[], id: string): Konva.Path => {
  // Get bounds to position the shape
  const bounds = getPointsBounds(points)
  
  // Create normalized points (starting at 0,0)
  const normalizedPoints: number[] = []
  for (let i = 0; i < points.length; i += 2) {
    normalizedPoints.push(points[i] - bounds.minX)
    normalizedPoints.push(points[i + 1] - bounds.minY)
  }
  
  const path = new Konva.Path({
    data: getStrokePath(normalizedPoints),
    fill: 'black',
    strokeWidth: 0,
    id: id,
    x: bounds.minX,
    y: bounds.minY,
    draggable: true, // Start draggable like working example
  })
  
  // Add click handler for selection
  path.on('click', (e) => {
    e.cancelBubble = true
    handleClick(path, e.evt.shiftKey)
  })
  
  // Add drag tracking handlers
  path.on('dragstart', () => {
    startFreehandDragTracking()
  })
  
  path.on('dragend', () => {
    finishFreehandDragTracking('Stroke')
    freehandShapeLayer?.batchDraw()
  })
  
  return path
}

// Handle click following working example pattern
const handleClick = (target: Konva.Node, shiftKey: boolean) => {
  // Only allow selection in select mode  
  if (freehandDrawMode.value) return
  
  console.log('Handle click on:', target.id(), target.constructor.name)
  
  const group = freehandTopGroup(target)
  const nodeToSelect = group ?? target // escalate to top-group if exists
  
  console.log('Node to select:', nodeToSelect.id(), nodeToSelect.constructor.name)
  
  if (shiftKey) freehandToggleSelection(nodeToSelect) 
  else { clearFreehandSelection(); freehandAddSelection(nodeToSelect) }
}

// Group selected strokes - simplified from working example  
const groupSelectedStrokes = () => {
  if (selected.length < 2) return

  executeFreehandCommand('Group Strokes', () => {
    // compute common parent to insert new group into (layer by default)
    let commonParent = selected[0].getParent()
    for (const n of selected) if (n.getParent() !== commonParent) { commonParent = freehandShapeLayer; break }

    const superGroup = new Konva.Group({ draggable: true })
    commonParent?.add(superGroup)

    if (selTr) selTr.nodes([])
    if (grpTr) grpTr.nodes([])

    selected.forEach((node) => {
      node.draggable(false)
      const absPos = node.getAbsolutePosition()
      const absRot = node.getAbsoluteRotation()
      const absScale = node.getAbsoluteScale()
      node.moveTo(superGroup)
      node.position(absPos)
      node.rotation(absRot)
      node.scale(absScale)
    })

    freehandLockPivot(superGroup)

    clearFreehandSelection()
    selected.push(superGroup)
    freehandRefreshUI()
    updateFreehandDraggableStates() // Update draggable states after grouping
    freehandShapeLayer?.batchDraw()
  })
}

// Ungroup selected groups - simplified from working example
const ungroupSelectedStrokes = () => {
  if (!(selected.length === 1 && selected[0] instanceof Konva.Group)) return
  
  executeFreehandCommand('Ungroup Strokes', () => {
    const grp = selected[0] as Konva.Group
    const parent = grp.getParent()
    if (grpTr) grpTr.nodes([])

    // Snapshot children so iteration is safe during re-parenting
    const children = [...grp.getChildren()]
    children.forEach((child) => {
      const absPos = child.getAbsolutePosition()
      const absRot = child.getAbsoluteRotation()
      const absScale = child.getAbsoluteScale()
      child.moveTo(parent!)
      child.position(absPos)
      child.rotation(absRot)
      child.scale(absScale)
      child.draggable(true)
    })

    grp.destroy()

    // Update stroke data to ensure shapes are properly connected after ungrouping
    refreshStrokeConnections()

    clearFreehandSelection()
    updateFreehandDraggableStates() // Update draggable states after ungrouping
    freehandShapeLayer?.batchDraw()
  })
}

// Delete selected items - simplified from working example
const deleteSelected = () => {
  if (selected.length === 0) return
  
  executeFreehandCommand('Delete Selected', () => {
    selected.forEach(node => {
      node.destroy()
      // Also remove from strokes map if it's a stroke
      freehandStrokes.forEach((stroke, id) => {
        if (stroke.shape === node) {
          freehandStrokes.delete(id)
        }
      })
    })
    clearFreehandSelection()
    updateTimelineState() // Update timeline state after deletion
    freehandShapeLayer?.batchDraw()
  })
}

// Handle timeline updates and stroke animation - restored full logic
const handleTimeUpdate = (time: number) => {
  currentPlaybackTime.value = time
  
  // Get strokes to animate and sort them
  let strokesToAnimate: FreehandStroke[] = []
  const isSelection = selected.length > 0
  
  if (isSelection) {
    // Get selected strokes including those in groups, but only freehand ones
    const selectedStrokes = getSelectedStrokes()
    strokesToAnimate = selectedStrokes.filter(stroke => stroke.isFreehand)
  } else {
    // All freehand strokes
    strokesToAnimate = Array.from(freehandStrokes.values()).filter(stroke => stroke.isFreehand)
  }
  
  // Sort by creation time
  strokesToAnimate.sort((a, b) => a.creationTime - b.creationTime)
  
  // If time is 0, restore state
  if (time === 0) {
    if (isSelection) {
      // Only restore selected strokes and their groups
      const groupsToShow = new Set<Konva.Group>()
      strokesToAnimate.forEach(stroke => {
        if (stroke.shape && stroke.originalPath) {
          stroke.shape.show()
          stroke.shape.data(stroke.originalPath)
          
          // Check if stroke is in a group and mark group for showing
          let parent = stroke.shape.getParent()
          while (parent && parent !== freehandShapeLayer) {
            if (parent instanceof Konva.Group) {
              groupsToShow.add(parent)
            }
            parent = parent.getParent()
          }
        }
      })
      
      // Show all groups that contain selected strokes
      groupsToShow.forEach(group => group.show())
    } else {
      // Restore all freehand strokes and all groups
      freehandStrokes.forEach(stroke => {
        if (stroke.shape && stroke.originalPath && stroke.isFreehand) {
          stroke.shape.show()
          stroke.shape.data(stroke.originalPath)
        }
      })
      
      // Show all groups
      if (freehandShapeLayer) {
        freehandShapeLayer.getChildren().forEach(child => {
          if (child instanceof Konva.Group) {
            child.show()
          }
        })
      }
    }
    
    freehandShapeLayer?.batchDraw()
    return
  }
  
  // Hide strokes that will be animated
  if (isSelection) {
    // Hide only the selected strokes that will be animated
    strokesToAnimate.forEach(stroke => {
      if (stroke.shape) stroke.shape.hide()
    })
  } else {
    // Hide all freehand strokes and all groups
    freehandStrokes.forEach(stroke => {
      if (stroke.shape && stroke.isFreehand) stroke.shape.hide()
    })
    
    // Hide all groups
    if (freehandShapeLayer) {
      freehandShapeLayer.getChildren().forEach(child => {
        if (child instanceof Konva.Group) {
          child.hide()
        }
      })
    }
  }
  
  // Calculate stroke timings
  let currentTimeOffset = 0
  const strokeTimings: Array<{stroke: FreehandStroke, startTime: number, endTime: number}> = []
  
  if (isSelection) {
    // For selections, use 0.1s gaps
    strokesToAnimate.forEach((stroke, index) => {
      const duration = stroke.timestamps[stroke.timestamps.length - 1] || 0
      strokeTimings.push({
        stroke,
        startTime: currentTimeOffset,
        endTime: currentTimeOffset + duration
      })
      currentTimeOffset += duration + (index < strokesToAnimate.length - 1 ? 100 : 0) // 0.1s gap
    })
  } else {
    // For all strokes, use original gaps (with optional max threshold)
    let lastEndTime = 0
    strokesToAnimate.forEach((stroke, index) => {
      const duration = stroke.timestamps[stroke.timestamps.length - 1] || 0
      
      if (index === 0) {
        strokeTimings.push({
          stroke,
          startTime: 0,
          endTime: duration
        })
        lastEndTime = stroke.creationTime + duration
        currentTimeOffset = duration
      } else {
        // Gap is between end of previous stroke and start of current stroke
        let gap = Math.max(0, stroke.creationTime - lastEndTime)
        // Apply max threshold if not using real timing
        if (!useRealTiming.value && gap > maxInterStrokeDelay) {
          gap = maxInterStrokeDelay
        }
        const startTime = currentTimeOffset + gap
        strokeTimings.push({
          stroke,
          startTime: startTime,
          endTime: startTime + duration
        })
        currentTimeOffset = startTime + duration
        lastEndTime = stroke.creationTime + duration
      }
    })
  }
  
  // Track which groups should be visible
  const freehandVisibleGroups = new Set<Konva.Group>()
  
  // Animate strokes based on current time
  strokeTimings.forEach(({stroke, startTime, endTime}) => {
    if (!stroke.shape || !stroke.timestamps) return
    
    if (time >= startTime && time <= endTime) {
      // Stroke is currently being drawn
      const strokeTime = time - startTime
      let visiblePointIndex = -1
      
      for (let i = 0; i < stroke.timestamps.length; i++) {
        if (stroke.timestamps[i] <= strokeTime) {
          visiblePointIndex = i
        } else {
          break
        }
      }
      
      if (visiblePointIndex >= 0) {
        const visiblePoints = stroke.points.slice(0, (visiblePointIndex + 1) * 2)
        if (visiblePoints.length >= 4) {
          // Get bounds for the original stroke
          const fullBounds = getPointsBounds(stroke.points)
          
          // Normalize the visible points
          const normalizedVisiblePoints: number[] = []
          for (let i = 0; i < visiblePoints.length; i += 2) {
            normalizedVisiblePoints.push(visiblePoints[i] - fullBounds.minX)
            normalizedVisiblePoints.push(visiblePoints[i + 1] - fullBounds.minY)
          }
          
          stroke.shape.show()
          stroke.shape.data(getStrokePath(normalizedVisiblePoints))
          
          // Check if this stroke is in a group and mark for showing
          let parent = stroke.shape.getParent()
          while (parent && parent !== freehandShapeLayer) {
            if (parent instanceof Konva.Group) {
              freehandVisibleGroups.add(parent)
            }
            parent = parent.getParent()
          }
        }
      }
    } else if (time > endTime) {
      // Stroke is complete
      stroke.shape.show()
      stroke.shape.data(stroke.originalPath!)
      
      // Check if this stroke is in a group and mark for showing  
      let parent = stroke.shape.getParent()
      while (parent && parent !== freehandShapeLayer) {
        if (parent instanceof Konva.Group) {
          freehandVisibleGroups.add(parent)
        }
        parent = parent.getParent()
      }
    }
  })
  
  // Show groups that have visible strokes
  freehandVisibleGroups.forEach(group => group.show())
  
  freehandShapeLayer?.batchDraw()
}

// Watch for draw mode changes - simplified based on working example
watch(freehandDrawMode, () => {
  updateCursor?.()
  
  // Update draggable states when mode changes
  updateFreehandDraggableStates()
  
  // Clear selection when switching to draw mode
  if (freehandDrawMode.value) {
    clearFreehandSelection()
  }
})

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
const selectedPolygons: Konva.Node[] = []

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
    
    console.log('Polygon state restored from hotreload')
  } catch (error) {
    console.warn('Failed to deserialize polygon state:', error)
  }
}

// Cursor update function (will be defined in onMounted)
let updateCursor: (() => void) | undefined

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

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
  })
}

// Clear current polygon being drawn
const clearCurrentPolygon = () => {
  isDrawingPolygon.value = false
  currentPolygonPoints.value = []
  polygonPreviewLayer?.destroyChildren()
  polygonPreviewLayer?.batchDraw()
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
    stage = new Konva.Stage({
      container: konvaContainer.value,
      width: resolution.width,
      height: resolution.height,
    })
    
    // Update cursor based on mode
    updateCursor = () => {
      if (stage && konvaContainer.value) {
        konvaContainer.value.style.cursor = freehandDrawMode.value ? 'crosshair' : 'default'
      }
    }
    updateCursor()

    // Create layers
    gridLayer = new Konva.Layer()
    freehandShapeLayer = new Konva.Layer()
    freehandDrawingLayer = new Konva.Layer()
    freehandSelectionLayer = new Konva.Layer()
    
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
    selTr = new Konva.Transformer({ 
      rotateEnabled: true, 
      keepRatio: true, 
      padding: 6,
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 5,
    })
    
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
          
          isDrawing = true
          currentPoints = [pos.x, pos.y]
          drawingStartTime = performance.now()
          currentTimestamps = [0]
          
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
        isDrawing = false
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
        })
        }
        
        currentPoints = []
        currentTimestamps = []
      }
    })

    // Original p5 setup
    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    appState.drawFunctions.push((p: p5) => {
      // console.log("drawing circles", appState.circles.list.length)
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
        <button @click="deleteSelected" :disabled="freehandSelectedCount === 0 || isAnimating">
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
        <span v-if="isDrawingPolygon" class="info">Drawing: {{ currentPolygonPoints.length / 2 }} points</span>
      </template>
      <span class="separator">|</span>
      <span class="info">{{ freehandSelectedCount }} selected</span>
      <span v-if="isAnimating" class="animation-lock-warning">
        ⚠️ Timeline has modified elements - press Stop to unlock
      </span>
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
    <Timeline 
      :strokes="freehandStrokes"
      :selectedStrokes="selectedStrokesForTimeline"
      :useRealTiming="useRealTiming"
      :maxInterStrokeDelay="maxInterStrokeDelay"
      :overrideDuration="timelineDuration > 0 ? timelineDuration : undefined"
      :lockWhileAnimating="setAnimatingState"
      @timeUpdate="handleTimeUpdate"
    />
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
</style>