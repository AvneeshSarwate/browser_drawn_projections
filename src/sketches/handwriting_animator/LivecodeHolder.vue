<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref, watch } from 'vue';
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
  if (!selected.includes(node)) selected.push(node) 
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
  
  // transformers
  if (selected.length === 1 && selected[0] instanceof Konva.Group) {
    if (!grpTr) { 
      grpTr = new Konva.Transformer({ rotateEnabled: true, keepRatio: true, padding: 6 }) 
      selectionLayer?.add(grpTr) 
    }
    grpTr.nodes([selected[0]])
    selTr.nodes([])
  } else {
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

// Function to update draggable state based on mode and group membership
const updateDraggableStates = () => {
  // Update all shapes
  strokes.forEach(stroke => {
    if (stroke.shape) {
      // Check if stroke is in a group by looking at parent
      const parent = stroke.shape.getParent()
      const isInGroup = parent && parent !== layer
      
      // Only draggable if in select mode AND not in a group
      stroke.shape.draggable(!drawMode.value && !isInGroup)
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
  
  // Add drag end handler to update position
  path.on('dragend', () => {
    // Force redraw after drag
    layer?.batchDraw()
  })
  
  return path
}

// Handle click following working example pattern
const handleClick = (target: Konva.Node, shiftKey: boolean) => {
  // Only allow selection in select mode  
  if (drawMode.value) return
  
  const group = topGroup(target)
  const nodeToSelect = group ?? target // escalate to top-group if exists
  
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
}

// Ungroup selected groups - simplified from working example
const ungroupSelectedStrokes = () => {
  if (!(selected.length === 1 && selected[0] instanceof Konva.Group)) return
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

  clearSelection()
  updateDraggableStates() // Update draggable states after ungrouping
  layer?.batchDraw()
}

// Delete selected items - simplified from working example
const deleteSelected = () => {
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

    // Create Konva container - it will be added to the Vue component's DOM
    const container = document.createElement('div')
    container.id = 'konva-container'
    container.style.width = resolution.width + 'px'
    container.style.height = resolution.height + 'px'
    container.style.backgroundColor = 'white'
    container.style.border = '1px solid black'
    
    // Add to component's DOM instead of body
    const konvaWrapper = document.getElementById('konva-wrapper')
    if (konvaWrapper) {
      konvaWrapper.appendChild(container)
    }

    // Initialize Konva
    stage = new Konva.Stage({
      container: 'konva-container',
      width: resolution.width,
      height: resolution.height,
    })
    
    // Update cursor based on mode
    updateCursor = () => {
      if (stage) {
        container.style.cursor = drawMode.value ? 'crosshair' : 'default'
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
    selectionLayer.add(selTr)

    // Initial grid draw
    drawGrid()
    
    // Start in select mode for testing
    drawMode.value = false
    updateCursor()

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
      }
      
      currentPoints = []
      currentTimestamps = []
    })

    // Keyboard shortcuts
    singleKeydownEvent('g', () => {
      showGrid.value = !showGrid.value
      drawGrid()
    })
    
    // Group selected strokes (Cmd/Ctrl + G)
    singleKeydownEvent('g', (ev) => {
      if (ev.metaKey || ev.ctrlKey) {
        ev.preventDefault()
        groupSelectedStrokes()
      }
    })
    
    // Ungroup selected groups (Cmd/Ctrl + Shift + G)
    singleKeydownEvent('g', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey) {
        ev.preventDefault()
        ungroupSelectedStrokes()
      }
    })
    
    singleKeydownEvent('Delete', () => {
      deleteSelected()
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
      <button @click="drawMode = !drawMode" :class="{ active: drawMode }">
        {{ drawMode ? '✏️ Draw' : '👆 Select' }}
      </button>
      <button @click="showGrid = !showGrid" :class="{ active: showGrid }">
        {{ showGrid ? '⊞ Grid On' : '⊡ Grid Off' }}
      </button>
      <span class="separator">|</span>
      <button @click="groupSelectedStrokes" :disabled="!canGroupRef">
        Group
      </button>
      <button @click="ungroupSelectedStrokes" :disabled="!isGroupSelected">
        Ungroup
      </button>
      <span class="separator">|</span>
      <button @click="deleteSelected" :disabled="selectedCount === 0">
        🗑️ Delete
      </button>
      <span class="separator">|</span>
      <button @click="useRealTiming = !useRealTiming" :class="{ active: useRealTiming }">
        {{ useRealTiming ? '⏱️ Real Time' : '⏱️ Max 0.3s' }}
      </button>
      <span class="separator">|</span>
      <span class="info">{{ selectedCount }} selected</span>
    </div>
    <div id="konva-wrapper" class="canvas-wrapper"></div>
    <Timeline 
      :strokes="strokes"
      :selectedStrokes="selectedStrokesForTimeline"
      :useRealTiming="useRealTiming"
      :maxInterStrokeDelay="maxInterStrokeDelay"
      :overrideDuration="timelineDuration > 0 ? timelineDuration : undefined"
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
</style>