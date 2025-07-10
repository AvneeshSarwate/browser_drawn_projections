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


const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

// Konva setup
let stage: Konva.Stage | undefined = undefined
let layer: Konva.Layer | undefined = undefined
let gridLayer: Konva.Layer | undefined = undefined
let drawingLayer: Konva.Layer | undefined = undefined
let selectionLayer: Konva.Layer | undefined = undefined

// Drawing state
let isDrawing = false
let currentPoints: number[] = []
let currentTimestamps: number[] = []
let drawingStartTime = 0

// Transform controls - dual transformer setup like working example
let selTr: Konva.Transformer | undefined = undefined
let grpTr: Konva.Transformer | undefined = undefined

// Helper functions from working example
const lockPivot = (node: Konva.Group | Konva.Node) => {
  //@ts-ignore
  const box = node.getClientRect({ relativeTo: node })
  node.offset({ x: box.width / 2, y: box.height / 2 })
  node.position({ x: node.x() + box.width / 2, y: node.y() + box.height / 2 })
}

// Return the top-most group (direct child of layer) for any descendant click
const topGroup = (node: Konva.Node): Konva.Group | null => {
  if (!layer) return null
  let cur = node
  let candidate: Konva.Group | null = null
  while (cur && cur !== layer) {
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
const getSelectedStrokes = (): Stroke[] => {
  const selectedStrokes: Stroke[] = []
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
            strokes.forEach(stroke => {
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
      strokes.forEach(stroke => {
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
const add = (node: Konva.Node) => { 
  console.log('Adding to selection:', node.id(), node.constructor.name)
  if (!selected.includes(node)) selected.push(node) 
  console.log('Selected array now has:', selected.length, 'items')
  refreshUI() 
}

const toggle = (node: Konva.Node) => { 
  const idx = selected.indexOf(node) 
  idx >= 0 ? selected.splice(idx, 1) : selected.push(node) 
  refreshUI() 
}

const clearSelection = () => { 
  selected.length = 0 
  refreshUI() 
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
const refreshUI = () => {
  if (!selTr || !layer) return
  
  // Ensure stroke connections are up to date
  refreshStrokeConnections()
  
  // transformers
  if (selected.length === 1 && selected[0] instanceof Konva.Group) {
    if (!grpTr) { 
      grpTr = new Konva.Transformer({ rotateEnabled: true, keepRatio: true, padding: 6 })
      
      // Add transform tracking to group transformer
      grpTr.on('transformstart', () => {
        startDragTracking()
      })
      
      grpTr.on('transformend', () => {
        finishDragTracking('Transform Group')
      })
      
      selectionLayer?.add(grpTr) 
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
  selectedCount.value = selected.length
  isGroupSelected.value = selected.length === 1 && selected[0] instanceof Konva.Group
  
  // Update button states like working example
  const canGroup = selected.length >= 2 && !hasAncestorConflict(selected)
  canGroupRef.value = canGroup

  // Update timeline-related state
  updateTimelineState()

  layer.batchDraw()
}

// Stroke data structure
interface Stroke {
  id: string
  points: number[]
  timestamps: number[]
  shape?: Konva.Path
  selected?: boolean
  originalPath?: string // Store original path data for animation
  creationTime: number // Absolute time when stroke was created
  isFreehand: boolean // Track if this is a freehand stroke with timing info
}

interface StrokeGroup {
  id: string
  strokeIds: string[]
  group?: Konva.Group
}

const strokes = new Map<string, Stroke>()
const strokeGroups = new Map<string, StrokeGroup>()
// Selection state - plain array like working example (no ref to avoid proxy issues)
const selected: Konva.Node[] = []

// Separate refs for UI state
const selectedCount = ref(0)
const isGroupSelected = ref(false)
const canGroupRef = ref(false)
const selectedStrokesForTimeline = ref(new Set<string>())
const timelineDuration = ref(0)
const showGrid = ref(false)
const gridSize = 20
const currentPlaybackTime = ref(0)
const drawMode = ref(true) // true = draw mode, false = select mode
const useRealTiming = ref(false) // false = use max threshold, true = use actual timing
const maxInterStrokeDelay = 300 // 0.3 seconds max gap between strokes

// Undo/Redo system
interface Command {
  name: string
  beforeState: string
  afterState: string
}

const commandHistory = ref<Command[]>([])
const historyIndex = ref(-1)
const maxHistorySize = 50

// Track if we're currently in an undo/redo operation to prevent adding to history
let isUndoRedoOperation = false

// Track if animation is currently playing for UI locking
const isAnimating = ref(false)

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

// Get current canvas state for undo/redo
const getCurrentState = (): string => {
  if (!stage || !layer) return ''
  
  try {
    const layerJson = layer.toJSON()
    const layerData = JSON.parse(layerJson)
    const strokesData = Array.from(strokes.entries())
    const strokeGroupsData = Array.from(strokeGroups.entries())
    
    const canvasState = {
      layer: layerData,
      strokes: strokesData,
      strokeGroups: strokeGroupsData,
    }
    
    return JSON.stringify(canvasState)
  } catch (error) {
    console.warn('Failed to get current state:', error)
    return ''
  }
}

// Execute a command with undo/redo support
const executeCommand = (commandName: string, action: () => void) => {
  if (isUndoRedoOperation) {
    // If we're in an undo/redo, just execute the action without tracking
    action()
    return
  }
  
  const beforeState = getCurrentState()
  if (!beforeState) return
  
  // Execute the action
  action()
  
  const afterState = getCurrentState()
  if (!afterState || beforeState === afterState) return
  
  // Add command to history
  const command: Command = {
    name: commandName,
    beforeState,
    afterState
  }
  
  // Remove any commands after current index (when doing new action after undo)
  commandHistory.value = commandHistory.value.slice(0, historyIndex.value + 1)
  
  // Add new command
  commandHistory.value.push(command)
  historyIndex.value = commandHistory.value.length - 1
  
  // Limit history size
  if (commandHistory.value.length > maxHistorySize) {
    commandHistory.value.shift()
    historyIndex.value = commandHistory.value.length - 1
  }
  
  console.log(`Command "${commandName}" added to history. Index: ${historyIndex.value}`)
}

// Restore state from string
const restoreState = (stateString: string) => {
  if (!stateString) return
  
  isUndoRedoOperation = true
  try {
    // Reset animation state to prevent interference
    const wasAnimating = currentPlaybackTime.value > 0
    currentPlaybackTime.value = 0
    isAnimating.value = false
    
    // Temporarily store the state string
    const originalState = appState.konvaStateString
    appState.konvaStateString = stateString
    
    // Use existing deserialization logic
    deserializeKonvaState()
    
    // Restore original state string for hotreload
    appState.konvaStateString = originalState
    
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
const canUndo = computed(() => historyIndex.value >= 0)
const canRedo = computed(() => historyIndex.value < commandHistory.value.length - 1)

const undo = () => {
  if (!canUndo.value) return
  
  const command = commandHistory.value[historyIndex.value]
  console.log(`Undoing command: ${command.name}`)
  
  restoreState(command.beforeState)
  historyIndex.value--
}

const redo = () => {
  if (!canRedo.value) return
  
  historyIndex.value++
  const command = commandHistory.value[historyIndex.value]
  console.log(`Redoing command: ${command.name}`)
  
  restoreState(command.afterState)
}

// Transform tracking for drag operations
let dragStartState: string | null = null

const startDragTracking = () => {
  dragStartState = getCurrentState()
}

const finishDragTracking = (nodeName: string) => {
  if (!dragStartState) return
  
  const endState = getCurrentState()
  if (dragStartState !== endState) {
    // Manually add to history without using executeCommand to avoid double state capture
    const command: Command = {
      name: `Transform ${nodeName}`,
      beforeState: dragStartState,
      afterState: endState
    }
    
    commandHistory.value = commandHistory.value.slice(0, historyIndex.value + 1)
    commandHistory.value.push(command)
    historyIndex.value = commandHistory.value.length - 1
    
    if (commandHistory.value.length > maxHistorySize) {
      commandHistory.value.shift()
      historyIndex.value = commandHistory.value.length - 1
    }
    
    console.log(`Transform command added to history. Index: ${historyIndex.value}`)
  }
  
  dragStartState = null
}

// Add this ref near the other refs
const konvaContainer = ref<HTMLDivElement>()

// Function to refresh stroke-shape connections
const refreshStrokeConnections = () => {
  strokes.forEach((stroke, id) => {
    const currentShape = stage?.findOne(`#${id}`) as Konva.Path
    if (currentShape && currentShape !== stroke.shape) {
      console.log('Updating stroke connection for:', id)
      stroke.shape = currentShape
    }
  })
}

// Serialization functions for hotreloading
const serializeKonvaState = () => {
  if (!stage || !layer) return
  
  try {
    // Serialize only the essential canvas state
    const layerJson = layer.toJSON()
    const layerData = JSON.parse(layerJson)
    const strokesData = Array.from(strokes.entries())
    const strokeGroupsData = Array.from(strokeGroups.entries())
    
    const canvasState = {
      layer: layerData,
      strokes: strokesData,
      strokeGroups: strokeGroupsData,
    }
    
    appState.konvaStateString = JSON.stringify(canvasState)
    console.log('Serialized canvas state:', { 
      layerChildren: layerData?.children?.length || 0, 
      strokes: strokesData.length,
      strokeGroups: strokeGroupsData.length 
    })
  } catch (error) {
    console.warn('Failed to serialize Konva state:', error)
  }
}

const deserializeKonvaState = () => {
  if (!appState.konvaStateString || !stage || !layer) return
  
  try {
    const canvasState = JSON.parse(appState.konvaStateString)
    console.log('Deserializing canvas state:', { 
      layerChildren: canvasState.layer?.children?.length || 0, 
      strokes: canvasState.strokes?.length || 0,
      strokeGroups: canvasState.strokeGroups?.length || 0 
    })
    
    // Clear existing content
    layer.destroyChildren()
    strokes.clear()
    strokeGroups.clear()
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
          startDragTracking()
        })
        
        node.on('dragend', () => {
          finishDragTracking(node.constructor.name)
          layer?.batchDraw()
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
        layer.add(node)
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
        const stroke: Stroke = {
          id: strokeData.id,
          points: strokeData.points,
          timestamps: strokeData.timestamps,
          originalPath: strokeData.originalPath,
          creationTime: strokeData.creationTime,
          isFreehand: strokeData.isFreehand,
          shape: shape,
        }
        strokes.set(id, stroke)
      })
    }
    
    // Restore stroke groups
    if (canvasState.strokeGroups) {
      canvasState.strokeGroups.forEach(([id, groupData]: [string, any]) => {
        const group: StrokeGroup = {
          id: groupData.id,
          strokeIds: groupData.strokeIds,
          group: stage.findOne(`#${id}`) as Konva.Group,
        }
        strokeGroups.set(id, group)
      })
    }
    
    // Update UI states
    refreshStrokeConnections() // Ensure all connections are properly established
    updateDraggableStates()
    
    // Force refresh the transformers to ensure they work with restored shapes
    if (selTr) {
      selTr.nodes([])
      selTr.forceUpdate()
    }
    if (grpTr) {
      grpTr.nodes([])  
      grpTr.forceUpdate()
    }
    
    layer.batchDraw()
    
    console.log('Konva canvas state restored from hotreload')
    
    // Force a redraw to make sure everything is visible
    setTimeout(() => {
      layer.batchDraw()
    }, 100)
  } catch (error) {
    console.warn('Failed to deserialize Konva state:', error)
  }
}

// Function to update draggable state based on mode and group membership
const updateDraggableStates = () => {
  console.log('updateDraggableStates called, drawMode:', drawMode.value, 'strokes count:', strokes.size)
  
  // Update all shapes
  strokes.forEach((stroke, id) => {
    if (stroke.shape) {
      // Check if stroke is in a group by looking at parent
      const parent = stroke.shape.getParent()
      const isInGroup = parent && parent !== layer
      
      const shouldBeDraggable = !drawMode.value && !isInGroup
      console.log('Stroke', id, 'parent:', parent?.constructor.name, 'isInGroup:', isInGroup, 'shouldBeDraggable:', shouldBeDraggable)
      
      // Only draggable if in select mode AND not in a group
      stroke.shape.draggable(shouldBeDraggable)
    } else {
      console.log('Stroke', id, 'has no shape!')
    }
  })
  
  // Update all groups
  if (layer) {
    layer.getChildren().forEach(child => {
      if (child instanceof Konva.Group) {
        child.draggable(!drawMode.value)
      }
    })
  }
}

// Watch for draw mode changes - simplified based on working example
watch(drawMode, () => {
  updateCursor?.()
  
  // Update draggable states when mode changes
  updateDraggableStates()
  
  // Clear selection when switching to draw mode
  if (drawMode.value) {
    clearSelection()
  }
})

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

// Helper to get bounds of points
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
    startDragTracking()
  })
  
  path.on('dragend', () => {
    finishDragTracking('Stroke')
    layer?.batchDraw()
  })
  
  return path
}

// Handle click following working example pattern
const handleClick = (target: Konva.Node, shiftKey: boolean) => {
  // Only allow selection in select mode  
  if (drawMode.value) return
  
  console.log('Handle click on:', target.id(), target.constructor.name)
  
  const group = topGroup(target)
  const nodeToSelect = group ?? target // escalate to top-group if exists
  
  console.log('Node to select:', nodeToSelect.id(), nodeToSelect.constructor.name)
  
  if (shiftKey) toggle(nodeToSelect) 
  else { clearSelection(); add(nodeToSelect) }
}

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

// Group selected strokes - simplified from working example  
const groupSelectedStrokes = () => {
  if (selected.length < 2) return

  executeCommand('Group Strokes', () => {
    // compute common parent to insert new group into (layer by default)
    let commonParent = selected[0].getParent()
    for (const n of selected) if (n.getParent() !== commonParent) { commonParent = layer; break }

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

    lockPivot(superGroup)

    clearSelection()
    selected.push(superGroup)
    refreshUI()
    updateDraggableStates() // Update draggable states after grouping
    layer?.batchDraw()
  })
}

// Ungroup selected groups - simplified from working example
const ungroupSelectedStrokes = () => {
  if (!(selected.length === 1 && selected[0] instanceof Konva.Group)) return
  
  executeCommand('Ungroup Strokes', () => {
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

    clearSelection()
    updateDraggableStates() // Update draggable states after ungrouping
    layer?.batchDraw()
  })
}

// Delete selected items - simplified from working example
const deleteSelected = () => {
  if (selected.length === 0) return
  
  executeCommand('Delete Selected', () => {
    selected.forEach(node => {
      node.destroy()
      // Also remove from strokes map if it's a stroke
      strokes.forEach((stroke, id) => {
        if (stroke.shape === node) {
          strokes.delete(id)
        }
      })
    })
    clearSelection()
    updateTimelineState() // Update timeline state after deletion
    layer?.batchDraw()
  })
}

// Handle timeline updates and stroke animation - restored full logic
const handleTimeUpdate = (time: number) => {
  currentPlaybackTime.value = time
  
  // Get strokes to animate and sort them
  let strokesToAnimate: Stroke[] = []
  const isSelection = selected.length > 0
  
  if (isSelection) {
    // Get selected strokes including those in groups, but only freehand ones
    const selectedStrokes = getSelectedStrokes()
    strokesToAnimate = selectedStrokes.filter(stroke => stroke.isFreehand)
  } else {
    // All freehand strokes
    strokesToAnimate = Array.from(strokes.values()).filter(stroke => stroke.isFreehand)
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
          while (parent && parent !== layer) {
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
      strokes.forEach(stroke => {
        if (stroke.shape && stroke.originalPath && stroke.isFreehand) {
          stroke.shape.show()
          stroke.shape.data(stroke.originalPath)
        }
      })
      
      // Show all groups
      if (layer) {
        layer.getChildren().forEach(child => {
          if (child instanceof Konva.Group) {
            child.show()
          }
        })
      }
    }
    
    layer?.batchDraw()
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
    strokes.forEach(stroke => {
      if (stroke.shape && stroke.isFreehand) stroke.shape.hide()
    })
    
    // Hide all groups
    if (layer) {
      layer.getChildren().forEach(child => {
        if (child instanceof Konva.Group) {
          child.hide()
        }
      })
    }
  }
  
  // Calculate stroke timings
  let currentTimeOffset = 0
  const strokeTimings: Array<{stroke: Stroke, startTime: number, endTime: number}> = []
  
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
  const visibleGroups = new Set<Konva.Group>()
  
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
          while (parent && parent !== layer) {
            if (parent instanceof Konva.Group) {
              visibleGroups.add(parent)
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
      while (parent && parent !== layer) {
        if (parent instanceof Konva.Group) {
          visibleGroups.add(parent)
        }
        parent = parent.getParent()
      }
    }
  })
  
  // Show groups that have visible strokes
  visibleGroups.forEach(group => group.show())
  
  layer?.batchDraw()
}

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
        konvaContainer.value.style.cursor = drawMode.value ? 'crosshair' : 'default'
      }
    }
    updateCursor()

    // Create layers
    gridLayer = new Konva.Layer()
    layer = new Konva.Layer()
    drawingLayer = new Konva.Layer()
    selectionLayer = new Konva.Layer()
    
    stage.add(gridLayer)
    stage.add(layer)
    stage.add(drawingLayer)
    stage.add(selectionLayer)

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
      startDragTracking()
    })
    
    selTr.on('transformend', () => {
      finishDragTracking('Transform Selection')
    })
    
    selectionLayer.add(selTr)

    // Initial grid draw
    drawGrid()
    
    // Start in select mode for testing
    drawMode.value = false
    updateCursor()
    
    // Try to restore canvas state from hotreload (after all setup is complete)
    deserializeKonvaState()

    // Mouse/touch event handlers
    stage.on('mousedown touchstart', (e) => {
      const pos = stage.getPointerPosition()
      if (!pos) return
      
      if (drawMode.value) {
        // Drawing mode
        if (e.target !== stage) return
        
        isDrawing = true
        currentPoints = [pos.x, pos.y]
        drawingStartTime = performance.now()
        currentTimestamps = [0]
        
        // Clear selection when starting to draw
        clearSelection()
      } else {
        // Selection mode
        if (e.target === stage) {
          // Clicked on empty space - clear selection
          clearSelection()
        }
      }
    })

    stage.on('mousemove touchmove', (e) => {
      if (!isDrawing) return
      
      const pos = stage.getPointerPosition()
      if (!pos) return
      
      currentPoints.push(pos.x, pos.y)
      currentTimestamps.push(performance.now() - drawingStartTime)
      
      // Update preview
      drawingLayer?.destroyChildren()
      const previewPath = new Konva.Path({
        data: getStrokePath(currentPoints),
        fill: '#666',
        strokeWidth: 0,
      })
      drawingLayer?.add(previewPath)
      drawingLayer?.batchDraw()
    })

    stage.on('mouseup touchend', () => {
      if (!isDrawing) return
      
      isDrawing = false
      drawingLayer?.destroyChildren()
      
      if (currentPoints.length > 2) {
        executeCommand('Draw Stroke', () => {
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
          const stroke: Stroke = {
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
          strokes.set(strokeId, stroke)
          layer?.add(shape)
          updateDraggableStates() // Update draggable state for new stroke
          updateTimelineState() // Update timeline state when new stroke is added
          layer?.batchDraw()
        })
      }
      
      currentPoints = []
      currentTimestamps = []
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

  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  
  // Save state before unmounting (for hot reload)
  serializeKonvaState()
  
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
      <button @click="drawMode = !drawMode" :class="{ active: drawMode }" :disabled="isAnimating">
        {{ drawMode ? '✏️ Draw' : '👆 Select' }}
      </button>
      <button @click="showGrid = !showGrid" :class="{ active: showGrid }" :disabled="isAnimating">
        {{ showGrid ? '⊞ Grid On' : '⊡ Grid Off' }}
      </button>
      <span class="separator">|</span>
      <button @click="groupSelectedStrokes" :disabled="!canGroupRef || isAnimating">
        Group
      </button>
      <button @click="ungroupSelectedStrokes" :disabled="!isGroupSelected || isAnimating">
        Ungroup
      </button>
      <span class="separator">|</span>
      <button @click="deleteSelected" :disabled="selectedCount === 0 || isAnimating">
        🗑️ Delete
      </button>
      <span class="separator">|</span>
      <button @click="undo" :disabled="!canUndo || isAnimating" title="Undo (Ctrl/Cmd+Z)">
        ↶ Undo
      </button>
      <button @click="redo" :disabled="!canRedo || isAnimating" title="Redo (Ctrl/Cmd+Shift+Z)">
        ↷ Redo
      </button>
      <span class="separator">|</span>
      <button @click="useRealTiming = !useRealTiming" :class="{ active: useRealTiming }">
        {{ useRealTiming ? '⏱️ Real Time' : '⏱️ Max 0.3s' }}
      </button>
      <span class="separator">|</span>
      <span class="info">{{ selectedCount }} selected</span>
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
      :strokes="strokes"
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