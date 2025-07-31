<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, resolution, type FreehandRenderData, type FlattenedStroke, type FlattenedStrokeGroup, type PolygonRenderData, type FlattenedPolygon, drawFlattenedStrokeGroup, stage, setStage, activeNode, metadataText, showMetadataEditor, getActiveSingleNode, selectedPolygons, selected } from './appState';
import { inject, onMounted, onUnmounted, ref, watch, computed, shallowReactive, type ShallowReactive, shallowRef } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import Konva from 'konva';
import Timeline from './Timeline.vue';
import { clearFreehandSelection, createStrokeShape, currentPoints, currentTimestamps, deserializeFreehandState, drawingStartTime, executeFreehandCommand, finishFreehandDragTracking, freehandDrawingLayer, freehandDrawMode, freehandSelectionLayer, freehandShapeLayer, freehandStrokes, getPointsBounds, getStrokePath, gridSize, isAnimating, isDrawing, selTr, serializeFreehandState, setCurrentPoints, setCurrentTimestamps, setDrawingStartTime, setFreehandDrawingLayer, setFreehandSelectionLayer, setFreehandShapeLayer, setIsDrawing, setSelTr, showGrid, startFreehandDragTracking, updateBakedStrokeData, updateFreehandDraggableStates, updateTimelineState, type FreehandStroke, groupSelectedStrokes, ungroupSelectedStrokes, freehandCanGroupRef, isFreehandGroupSelected, freehandSelectedCount, undoFreehand, canUndoFreehand, canRedoFreehand, redoFreehand, useRealTiming, deleteFreehandSelected, selectedStrokesForTimeline, timelineDuration, handleTimeUpdate, maxInterStrokeDelay } from './freehandTool';
import { polygonShapesLayer, polygonPreviewLayer, polygonControlsLayer, polygonSelectionLayer, clearPolygonSelection, updatePolygonControlPoints, deserializePolygonState, polygonMode, handlePolygonClick, isDrawingPolygon, handlePolygonMouseMove, handlePolygonEditMouseMove, currentPolygonPoints, finishPolygon, clearCurrentPolygon, serializePolygonState, setPolygonControlsLayer, setPolygonPreviewLayer, setPolygonSelectionLayer, setPolygonShapesLayer, polygonUndo, polygonRedo, canPolygonUndo, canPolygonRedo, deleteSelectedPolygon } from './polygonTool';

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

// Cursor update function (will be defined in onMounted)
let updateCursor: (() => void) | undefined

// ================  polygon stuff ====================

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
    setPolygonShapesLayer(new Konva.Layer())
    setPolygonPreviewLayer(new Konva.Layer())
    setPolygonControlsLayer(new Konva.Layer())
    setPolygonSelectionLayer(new Konva.Layer())
    
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