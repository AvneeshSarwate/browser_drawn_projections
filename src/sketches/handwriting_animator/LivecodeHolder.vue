<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import Konva from 'konva';
import { getStroke } from 'perfect-freehand';
import Timeline from './Timeline.vue';

// Fix TypeScript issue with Konva.Path
declare module 'konva/lib/shapes/Path' {
  interface Path {
    getSelfRect(): { x: number; y: number; width: number; height: number; }
  }
}

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

// Transform controls
let transformer: Konva.Transformer | undefined = undefined

// Stroke data structure
interface Stroke {
  id: string
  points: number[]
  timestamps: number[]
  shape?: Konva.Path
  selected?: boolean
  originalPath?: string // Store original path data for animation
  creationTime: number // Absolute time when stroke was created
}

interface StrokeGroup {
  id: string
  strokeIds: string[]
  group?: Konva.Group
}

const strokes = ref<Map<string, Stroke>>(new Map())
const strokeGroups = ref<Map<string, StrokeGroup>>(new Map())
const selectedStrokes = ref<Set<string>>(new Set())
const showGrid = ref(false)
const gridSize = 20
const currentPlaybackTime = ref(0)
const drawMode = ref(true) // true = draw mode, false = select mode
const useRealTiming = ref(false) // false = use max threshold, true = use actual timing
const maxInterStrokeDelay = 300 // 0.3 seconds max gap between strokes

// Watch for draw mode changes
watch(drawMode, () => {
  updateCursor?.()
  
  // Update draggable state for all shapes
  strokes.value.forEach(stroke => {
    if (stroke.shape) {
      // Check if stroke is in a group
      let isInGroup = false
      strokeGroups.value.forEach(group => {
        if (group.strokeIds.includes(stroke.id)) {
          isInGroup = true
        }
      })
      
      // Only make draggable if in select mode AND not in a group
      stroke.shape.draggable(!drawMode.value && !isInGroup)
    }
  })
  
  // Update draggable state for all groups
  strokeGroups.value.forEach(strokeGroup => {
    if (strokeGroup.group) {
      strokeGroup.group.draggable(!drawMode.value)
    }
  })
  
  // Clear selection when switching to draw mode
  if (drawMode.value) {
    selectedStrokes.value.clear()
    updateSelectionVisuals()
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
const getStrokePath = (points: number[]): string => {
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
  
  const d = strokePoints.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length]
      return `${acc} ${x0},${y0} ${x1},${y1}`
    },
    `M ${strokePoints[0][0]},${strokePoints[0][1]} L`
  )
  
  return `${d} Z`
}

// Helper function to create a new stroke shape
const createStrokeShape = (points: number[], id: string, isInGroup: boolean = false): Konva.Path => {
  const path = new Konva.Path({
    data: getStrokePath(points),
    fill: 'black',
    strokeWidth: 0,
    id: id,
    draggable: !drawMode.value && !isInGroup, // Enable dragging only if in select mode AND not in a group
  })
  
  // Add click handler for selection
  path.on('click', (e) => {
    e.cancelBubble = true
    handleStrokeClick(id, e.evt.shiftKey)
  })
  
  // Add drag end handler to update position
  path.on('dragend', () => {
    // Force redraw after drag
    layer?.batchDraw()
  })
  
  return path
}

// Handle stroke selection
const handleStrokeClick = (strokeId: string, shiftKey: boolean) => {
  // Only allow selection in select mode
  if (drawMode.value) return
  
  if (shiftKey) {
    // Multi-select with shift
    if (selectedStrokes.value.has(strokeId)) {
      selectedStrokes.value.delete(strokeId)
    } else {
      selectedStrokes.value.add(strokeId)
    }
  } else {
    // Single select
    selectedStrokes.value.clear()
    selectedStrokes.value.add(strokeId)
  }
  
  updateSelectionVisuals()
}

// Update selection visuals
const updateSelectionVisuals = () => {
  // Clear transformer
  if (transformer) {
    transformer.nodes([])
  }
  
  const selectedNodes: Konva.Node[] = []
  const processedGroups = new Set<string>()
  
  selectedStrokes.value.forEach(strokeId => {
    // First check if this stroke is part of a group
    let isInGroup = false
    strokeGroups.value.forEach((group, groupId) => {
      if (group.strokeIds.includes(strokeId) && group.group && !processedGroups.has(groupId)) {
        // Add the entire group if any stroke in it is selected
        selectedNodes.push(group.group)
        processedGroups.add(groupId)
        isInGroup = true
      }
    })
    
    // If not in a group, add the individual stroke
    if (!isInGroup) {
      const stroke = strokes.value.get(strokeId)
      if (stroke?.shape) {
        selectedNodes.push(stroke.shape)
      }
    }
  })
  
  // Update transformer with selected nodes
  if (transformer && selectedNodes.length > 0) {
    transformer.nodes(selectedNodes)
    selectionLayer?.batchDraw()
  }
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

// Group selected strokes
const groupSelectedStrokes = () => {
  if (selectedStrokes.value.size < 2) return
  
  const group = new Konva.Group({
    draggable: false, // Will be enabled dynamically based on mode
  })
  
  const groupId = `group-${Date.now()}`
  const strokeIds: string[] = []
  
  // Move strokes to group
  selectedStrokes.value.forEach(strokeId => {
    const stroke = strokes.value.get(strokeId)
    if (stroke?.shape) {
      strokeIds.push(strokeId)
      stroke.shape.moveTo(group)
      // Disable individual dragging when in a group
      stroke.shape.draggable(false)
    }
  })
  
  // Add click handler to group
  group.on('click', (e) => {
    e.cancelBubble = true
    
    // Only handle selection in select mode
    if (drawMode.value) return
    
    // When clicking a group, select all its strokes
    selectedStrokes.value.clear()
    strokeIds.forEach(id => selectedStrokes.value.add(id))
    updateSelectionVisuals()
  })
  
  // Enable dragging only in select mode
  group.draggable(!drawMode.value)
  
  // Create group data
  const strokeGroup: StrokeGroup = {
    id: groupId,
    strokeIds: strokeIds,
    group: group,
  }
  
  strokeGroups.value.set(groupId, strokeGroup)
  layer?.add(group)
  
  // Clear selection
  selectedStrokes.value.clear()
  updateSelectionVisuals()
  layer?.batchDraw()
}

// Ungroup selected strokes
const ungroupSelectedStrokes = () => {
  // Find groups that contain selected strokes
  const groupsToUngroup = new Set<string>()
  
  selectedStrokes.value.forEach(strokeId => {
    strokeGroups.value.forEach((group, groupId) => {
      if (group.strokeIds.includes(strokeId)) {
        groupsToUngroup.add(groupId)
      }
    })
  })
  
  // Ungroup each group
  groupsToUngroup.forEach(groupId => {
    const strokeGroup = strokeGroups.value.get(groupId)
    if (strokeGroup?.group) {
      // Move strokes back to main layer preserving their absolute transforms
      strokeGroup.strokeIds.forEach(strokeId => {
        const stroke = strokes.value.get(strokeId)
        if (stroke?.shape) {
          // Get the absolute transform before moving
          const transform = stroke.shape.getAbsoluteTransform()
          const attrs = transform.decompose()
          
          // Move to layer and apply the absolute transform
          stroke.shape.moveTo(layer!)
          stroke.shape.setAttrs(attrs)
          // Re-enable dragging if in select mode
          stroke.shape.draggable(!drawMode.value)
        }
      })
      
      // Remove group
      strokeGroup.group.destroy()
      strokeGroups.value.delete(groupId)
    }
  })
  
  // Clear selection and update visuals
  selectedStrokes.value.clear()
  updateSelectionVisuals()
  layer?.batchDraw()
}

// Delete selected strokes
const deleteSelected = () => {
  selectedStrokes.value.forEach(strokeId => {
    const stroke = strokes.value.get(strokeId)
    if (stroke?.shape) {
      stroke.shape.destroy()
      strokes.value.delete(strokeId)
    }
  })
  selectedStrokes.value.clear()
  updateSelectionVisuals()
  layer?.batchDraw()
}

// Handle timeline updates and stroke animation
const handleTimeUpdate = (time: number) => {
  currentPlaybackTime.value = time
  
  // Get strokes to animate and sort them
  let strokesToAnimate: Stroke[] = []
  const isSelection = selectedStrokes.value.size > 0
  
  if (isSelection) {
    // Get selected strokes including those in groups
    const selectedStrokeIds = new Set<string>()
    selectedStrokes.value.forEach(strokeId => {
      selectedStrokeIds.add(strokeId)
      // Also add strokes from selected groups
      strokeGroups.value.forEach(group => {
        if (group.strokeIds.includes(strokeId)) {
          group.strokeIds.forEach(id => selectedStrokeIds.add(id))
        }
      })
    })
    
    selectedStrokeIds.forEach(id => {
      const stroke = strokes.value.get(id)
      if (stroke) strokesToAnimate.push(stroke)
    })
  } else {
    strokesToAnimate = Array.from(strokes.value.values())
  }
  
  // Sort by creation time
  strokesToAnimate.sort((a, b) => a.creationTime - b.creationTime)
  
  // If time is 0, restore state
  if (time === 0) {
    if (isSelection) {
      // Only restore selected strokes
      strokesToAnimate.forEach(stroke => {
        if (stroke.shape && stroke.originalPath) {
          stroke.shape.show()
          stroke.shape.data(stroke.originalPath)
        }
      })
      
      // Show groups containing selected strokes
      const groupsToShow = new Set<string>()
      strokesToAnimate.forEach(stroke => {
        strokeGroups.value.forEach((group, groupId) => {
          if (group.strokeIds.includes(stroke.id)) {
            groupsToShow.add(groupId)
          }
        })
      })
      groupsToShow.forEach(groupId => {
        const group = strokeGroups.value.get(groupId)
        if (group?.group) group.group.show()
      })
    } else {
      // Restore all strokes
      strokes.value.forEach(stroke => {
        if (stroke.shape && stroke.originalPath) {
          stroke.shape.show()
          stroke.shape.data(stroke.originalPath)
        }
      })
      strokeGroups.value.forEach(group => {
        if (group.group) group.group.show()
      })
    }
    
    layer?.batchDraw()
    return
  }
  
  // Hide strokes that will be animated
  if (isSelection) {
    strokesToAnimate.forEach(stroke => {
      if (stroke.shape) stroke.shape.hide()
    })
  } else {
    strokes.value.forEach(stroke => {
      if (stroke.shape) stroke.shape.hide()
    })
    strokeGroups.value.forEach(group => {
      if (group.group) group.group.hide()
    })
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
  const visibleGroups = new Set<string>()
  
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
          stroke.shape.show()
          stroke.shape.data(getStrokePath(visiblePoints))
          
          // Check if this stroke is in a group
          strokeGroups.value.forEach((group, groupId) => {
            if (group.strokeIds.includes(stroke.id)) {
              visibleGroups.add(groupId)
            }
          })
        }
      }
    } else if (time > endTime) {
      // Stroke is complete
      stroke.shape.show()
      stroke.shape.data(stroke.originalPath!)
      
      // Check if this stroke is in a group
      strokeGroups.value.forEach((group, groupId) => {
        if (group.strokeIds.includes(stroke.id)) {
          visibleGroups.add(groupId)
        }
      })
    }
  })
  
  // Show groups that have visible strokes
  visibleGroups.forEach(groupId => {
    const group = strokeGroups.value.get(groupId)
    if (group?.group) {
      group.group.show()
    }
  })
  
  layer?.batchDraw()
}

onMounted(() => {
  try {
    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    // Create Konva container
    const container = document.createElement('div')
    container.id = 'konva-container'
    container.style.position = 'absolute'
    container.style.top = '0'
    container.style.left = '0'
    container.style.width = '800px'
    container.style.height = '600px'
    container.style.backgroundColor = 'white'
    container.style.border = '1px solid #ccc'
    document.body.appendChild(container)

    // Initialize Konva
    stage = new Konva.Stage({
      container: 'konva-container',
      width: 800,
      height: 600,
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

    // Create transformer
    transformer = new Konva.Transformer({
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 5,
      keepRatio: false, // Allow free scaling
      enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
      boundBoxFunc: (oldBox, newBox) => {
        // Limit minimum size
        if (newBox.width < 10 || newBox.height < 10) {
          return oldBox
        }
        return newBox
      },
    })
    
    // Add transform events to track changes
    transformer.on('transformstart', () => {
      // Store initial transforms if needed
    })
    
    transformer.on('transformend', () => {
      // Update after transformation
      layer?.batchDraw()
    })
    
    selectionLayer.add(transformer)

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
        selectedStrokes.value.clear()
        updateSelectionVisuals()
      } else {
        // Selection mode
        if (e.target === stage) {
          // Clicked on empty space - clear selection
          selectedStrokes.value.clear()
          updateSelectionVisuals()
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
        const originalPath = getStrokePath(currentPoints)
        const stroke: Stroke = {
          id: strokeId,
          points: currentPoints,
          timestamps: currentTimestamps,
          originalPath: originalPath,
          creationTime: creationTime,
        }
        
        // Create shape
        const shape = createStrokeShape(currentPoints, strokeId)
        stroke.shape = shape
        
        // Add to data structures
        strokes.value.set(strokeId, stroke)
        layer?.add(shape)
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
  const container = document.getElementById('konva-container')
  container?.remove()
})

</script>

<template>
  <div>
    <div class="control-panel">
      <button @click="drawMode = !drawMode" :class="{ active: drawMode }">
        {{ drawMode ? '✏️ Draw' : '👆 Select' }}
      </button>
      <button @click="showGrid = !showGrid" :class="{ active: showGrid }">
        {{ showGrid ? '⊞ Grid On' : '⊡ Grid Off' }}
      </button>
      <span class="separator">|</span>
      <button @click="groupSelectedStrokes" :disabled="selectedStrokes.size < 2">
        Group
      </button>
      <button @click="ungroupSelectedStrokes" :disabled="selectedStrokes.size === 0">
        Ungroup
      </button>
      <span class="separator">|</span>
      <button @click="deleteSelected" :disabled="selectedStrokes.size === 0">
        🗑️ Delete
      </button>
      <span class="separator">|</span>
      <button @click="useRealTiming = !useRealTiming" :class="{ active: useRealTiming }">
        {{ useRealTiming ? '⏱️ Real Time' : '⏱️ Max 0.3s' }}
      </button>
      <span class="separator">|</span>
      <span class="info">{{ selectedStrokes.size }} selected</span>
    </div>
    <Timeline 
      :strokes="strokes"
      :selectedStrokes="selectedStrokes"
      :useRealTiming="useRealTiming"
      :maxInterStrokeDelay="maxInterStrokeDelay"
      @timeUpdate="handleTimeUpdate"
    />
  </div>
</template>

<style scoped>
.control-panel {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px 15px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
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