<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, resolution, drawFlattenedStrokeGroup, stage, setStage, showMetadataEditor, activeTool } from '../appState';
import * as selectionStore from './selectionStore';
import { getCanvasItem } from './CanvasItem';
import { inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import Konva from 'konva';
import Timeline from './Timeline.vue';
import HierarchicalMetadataEditor from './HierarchicalMetadataEditor.vue';
import VisualizationToggles from './VisualizationToggles.vue';
import { clearFreehandSelection, createStrokeShape, currentPoints, currentTimestamps, deserializeFreehandState, drawingStartTime, freehandDrawingLayer, freehandSelectionLayer, freehandShapeLayer, freehandStrokes, getStrokePath, gridSize, isAnimating, isDrawing, serializeFreehandState, setCurrentPoints, setCurrentTimestamps, setDrawingStartTime, setFreehandDrawingLayer, setFreehandSelectionLayer, setFreehandShapeLayer, setIsDrawing, showGrid, updateBakedStrokeData, updateFreehandDraggableStates, updateTimelineState, type FreehandStroke, useRealTiming, selectedStrokesForTimeline, timelineDuration, handleTimeUpdate, maxInterStrokeDelay, setUpdateCursor, updateCursor, downloadFreehandDrawing, uploadFreehandDrawing, setRefreshAVs, getCurrentFreehandStateString, restoreFreehandState } from './freehandTool';
import { getPointsBounds } from './canvasUtils';
import { CommandStack } from './commandStack';
import { setGlobalExecuteCommand, setGlobalPushCommand } from './commands';
import { ensureHighlightLayer } from '@/metadata';
import { polygonShapesLayer, polygonPreviewLayer, polygonControlsLayer, polygonSelectionLayer, clearPolygonSelection, updatePolygonControlPoints, deserializePolygonState, polygonMode, handlePolygonClick, isDrawingPolygon, handlePolygonMouseMove, handlePolygonEditMouseMove, currentPolygonPoints, finishPolygon, clearCurrentPolygon, serializePolygonState, setPolygonControlsLayer, setPolygonPreviewLayer, setPolygonSelectionLayer, setPolygonShapesLayer, getCurrentPolygonStateString, restorePolygonState, updateBakedPolygonData } from './polygonTool';
import { initAVLayer, refreshAnciliaryViz } from './ancillaryVisualizations';
import { initializeTransformer } from './transformerManager';
import { initializeSelectTool, handleSelectPointerDown, handleSelectPointerMove, handleSelectPointerUp, groupSelection, ungroupSelection, canGroupSelection, canUngroupSelection, duplicateSelection, deleteSelection } from './selectTool';
import { sinN } from '@/channels/channels';

// ==================== common stuff ====================
const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

// ==================== Unified Command Stack ====================
const captureCanvasState = () => {
  const freehandState = getCurrentFreehandStateString()
  const polygonState = getCurrentPolygonStateString()
  
  return JSON.stringify({
    freehand: freehandState,
    polygon: polygonState
  })
}

const restoreCanvasState = (stateString: string) => {
  if (!stateString) return
  
  try {
    const state = JSON.parse(stateString)
    if (state.freehand) {
      restoreFreehandState(state.freehand)
    }
    if (state.polygon) {
      restorePolygonState(state.polygon)
    }
  } catch (error) {
    console.warn('Failed to restore canvas state:', error)
  }
}

const onCanvasStateChange = () => {
  updateBakedStrokeData()
  updateBakedPolygonData()
  refreshAnciliaryViz()
}

// Create unified command stack instance
const commandStack = new CommandStack(captureCanvasState, restoreCanvasState, onCanvasStateChange)

// Expose command stack methods for use in templates and other functions
const executeCommand = (name: string, action: () => void) => commandStack.executeCommand(name, action)
const undo = () => commandStack.undo()
const redo = () => commandStack.redo()
const canUndo = () => commandStack.canUndo()
const canRedo = () => commandStack.canRedo()

// Grouping logic moved to core/selectTool

// Tool switching - now imported from appState

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



// Helper to consistently apply layer listening per tool
const applyToolMode = (tool: 'select' | 'freehand' | 'polygon') => {
  // Clear selections when switching tools
  selectionStore.clear()

  if (tool === 'select') {
    // Enable interaction with shape layers for selection
    freehandShapeLayer?.listening(true)
    polygonShapesLayer?.listening(true)

    // Disable drawing-specific layers
    freehandDrawingLayer?.listening(false)
    polygonPreviewLayer?.listening(false)
    polygonControlsLayer?.listening(false)

    // Keep selection layers active (transformer lives here)
    freehandSelectionLayer?.listening(true)
    polygonSelectionLayer?.listening(true)

    // Ensure transformer/selection overlay sits above shapes
    freehandSelectionLayer?.moveToTop()
    if (stage) ensureHighlightLayer(stage).moveToTop()
  } else if (tool === 'freehand') {
    // Freehand drawing mode
    freehandShapeLayer?.listening(true)
    freehandDrawingLayer?.listening(true)
    freehandSelectionLayer?.listening(true)

    // Disable polygon interactive layers
    polygonShapesLayer?.listening(false)
    polygonPreviewLayer?.listening(false)
    polygonControlsLayer?.listening(false)
    polygonSelectionLayer?.listening(false)
  } else if (tool === 'polygon') {
    // Polygon mode
    polygonShapesLayer?.listening(true)
    polygonPreviewLayer?.listening(true)
    polygonControlsLayer?.listening(true)
    polygonSelectionLayer?.listening(true)

    // Disable freehand interactive layers
    freehandShapeLayer?.listening(false)
    freehandDrawingLayer?.listening(false)
    freehandSelectionLayer?.listening(false)
  }

  // Manage polygon control points visibility lifecycle across tools
  if (tool === 'polygon') {
    if (polygonMode.value === 'edit') {
      updatePolygonControlPoints()
    } else {
      polygonControlsLayer?.destroyChildren()
      polygonControlsLayer?.batchDraw()
    }
  } else {
    // Leaving polygon tool – remove control points
    polygonControlsLayer?.destroyChildren()
    polygonControlsLayer?.batchDraw()
  }

  // Update node draggability to avoid conflicting with selection-drag logic
  const setAllDraggable = (draggable: boolean) => {
    freehandShapeLayer?.getChildren().forEach(node => {
      if (node instanceof Konva.Path || node instanceof Konva.Group) node.draggable(draggable)
    })
    polygonShapesLayer?.getChildren().forEach(node => {
      if (node instanceof Konva.Line || node instanceof Konva.Group) node.draggable(draggable)
    })
  }
  // Disable node-level drags; selection drag and transformer manage moves
  setAllDraggable(false)

  // Redraw
  stage?.batchDraw()
}

// Watch for tool changes - new three-tool system
watch(activeTool, (newTool) => {
  applyToolMode(newTool)
})


// Old metadata watchers removed – unified editor reads directly from selectionStore

// Callback for HierarchicalMetadataEditor to apply metadata via unified selection tool
const handleApplyMetadata = (node: Konva.Node, metadata: any) => {
  try {
    const item = getCanvasItem(node)
    if (item) {
      // Route through unified selection store (handles undo/redo + updates)
      selectionStore.setMetadata(item, metadata)
    } else {
      // Fallback for non-registered nodes (should be rare)
      node.setAttr('metadata', metadata === undefined || Object.keys(metadata).length === 0 ? undefined : metadata)
      updateBakedStrokeData()
      updateBakedPolygonData()
    }
  } catch (e) {
    // Safe fallback if metadata routing fails for any reason
    node.setAttr('metadata', metadata === undefined || Object.keys(metadata).length === 0 ? undefined : metadata)
    updateBakedStrokeData()
    updateBakedPolygonData()
  }
}

onMounted(async () => {
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

    // Update cursor based on active tool
    setUpdateCursor(() => {
      if (stage && konvaContainer.value) {
        konvaContainer.value.style.cursor = activeTool.value === 'freehand' ? 'crosshair' : 'default'
      }
    })
    updateCursor!()

    // Create layers

    setFreehandShapeLayer(new Konva.Layer())
    setFreehandDrawingLayer(new Konva.Layer())
    setFreehandSelectionLayer(new Konva.Layer())

    // Create polygon layers
    setPolygonShapesLayer(new Konva.Layer())
    setPolygonPreviewLayer(new Konva.Layer())
    setPolygonControlsLayer(new Konva.Layer())
    setPolygonSelectionLayer(new Konva.Layer())

    stage!.add(freehandShapeLayer!)
    stage!.add(freehandDrawingLayer!)
    stage!.add(freehandSelectionLayer!)
    stage!.add(polygonShapesLayer!)
    stage!.add(polygonPreviewLayer!)
    stage!.add(polygonControlsLayer!)
    stage!.add(polygonSelectionLayer!)
    
    // Initialize unified transformer
    initializeTransformer(freehandSelectionLayer!)
    
    // Initialize select tool
    initializeSelectTool(freehandSelectionLayer!)

    // Add metadata highlight layer on top
    const metadataHighlightLayer = ensureHighlightLayer(stage!)
    // Keep transformer layer above all interactive shape layers to prevent pointer blocking
    freehandSelectionLayer!.moveToTop()
    // Keep highlight visuals on top (non-listening, so it won't block interaction)
    metadataHighlightLayer.moveToTop()

    
    
    // Initialize ancillary visualizations layer
    initAVLayer()
    setRefreshAVs(refreshAnciliaryViz)
    
    // Set up executeCommand callbacks for tools
    setGlobalExecuteCommand(executeCommand)
    setGlobalPushCommand((name, beforeState, afterState) => commandStack.pushCommand(name, beforeState, afterState))

    
    // Selection rectangle is created by core/selectTool.initializeSelectTool

    // Apply initial tool mode AFTER layers exist (important for transformer interactivity post-HMR)
    applyToolMode(activeTool.value)

    // Unified transformer is initialized by core/transformerManager

    // Initialize polygon control points only if polygon tool is active and editing
    if (activeTool.value === 'polygon' && polygonMode.value === 'edit') {
      updatePolygonControlPoints()
    }

    // Initialize cursor
    updateCursor!()

    // Try to restore canvas state from hotreload (after all setup is complete)
    deserializeFreehandState()
    deserializePolygonState()

    // Re-apply tool mode after deserialization to ensure control points/transformer states are correct
    applyToolMode(activeTool.value)


    // Mouse/touch event handlers - new three-tool system
    stage!.on('mousedown touchstart', (e) => {
      const pos = stage!.getPointerPosition()
      if (!pos) return

      if (activeTool.value === 'select') {
        // Universal select tool handles all selection for both freehand and polygon
        handleSelectPointerDown(stage!, e)
      } else if (activeTool.value === 'freehand') {
        // Freehand tool always draws in this mode; selection via Select tool
        setIsDrawing(true)
        setCurrentPoints([pos.x, pos.y])
        setDrawingStartTime(performance.now())
        setCurrentTimestamps([0])

        // Clear selection when starting to draw
        selectionStore.clear()
      } else if (activeTool.value === 'polygon') {
        // Polygon tool handles polygon-specific interactions only (no selection)
        const parent = e.target.getParent?.()
        const isControlPoint = parent === polygonControlsLayer
        if (!isControlPoint) {
          handlePolygonClick(pos)
        }
      }
    })

    stage!.on('mousemove touchmove', (e) => {
      if (activeTool.value === 'select') {
        // Handle drag selection for select tool
        handleSelectPointerMove(stage!, e)
      } else if (activeTool.value === 'freehand') {
        if (isDrawing) {
          // Handle drawing
          const pos = stage!.getPointerPosition()
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
        }
      } else if (activeTool.value === 'polygon') {
        if (polygonMode.value === 'draw' && isDrawingPolygon.value) {
          handlePolygonMouseMove()
        } else if (polygonMode.value === 'edit') {
          handlePolygonEditMouseMove()
        }
        // Note: selection drag is handled by select tool when appropriate
      }
    })

    stage!.on('mouseup touchend', (e) => {
      if (activeTool.value === 'freehand' && isDrawing) {
        setIsDrawing(false)
        freehandDrawingLayer?.destroyChildren()

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
      } else {
        // Delegate to select tool for all other cases
        handleSelectPointerUp(stage!, e)
      }
    })

    // Original p5 setup
    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const rand = (n: number) => sinN(n * 123.23)

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
          const polygonMetadataColor = polygon.metadata?.color
          const color = polygonMetadataColor ?? randColor(idx)
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

      if (appState.freehandRenderData.length > 0) {
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

  // Clean up Konva
  stage?.destroy()
})

</script>

<template>
  <div class="canvas-root">
    <div class="control-panel">
      <!-- Tool Switcher Dropdown -->
      <select v-model="activeTool" :disabled="isAnimating" class="tool-dropdown">
        <option value="select">👆 Select</option>
        <option value="freehand">✏️ Freehand</option>
        <option value="polygon">⬟ Polygon</option>
      </select>
      <span class="separator">|</span>
      
      <!-- Unified Undo/Redo (works for both tools) -->
      <div class="button-group vertical">
        <button @click="undo" :disabled="!canUndo() || isAnimating" title="Undo (Ctrl/Cmd+Z)">
          ↶ Undo
        </button>
        <button @click="redo" :disabled="!canRedo() || isAnimating" title="Redo (Ctrl/Cmd+Shift+Z)">
          ↷ Redo
        </button>
      </div>
      <span class="separator">|</span>

      <!-- Select Tool Toolbar -->
      <template v-if="activeTool === 'select'">
        <div class="button-group vertical">
          <button @click="groupSelection" :disabled="!canGroupSelection() || isAnimating">
            Group
          </button>
          <button @click="ungroupSelection" :disabled="!canUngroupSelection() || isAnimating">
            Ungroup
          </button>
        </div>
        <span class="separator">|</span>
        <div class="button-group vertical">
          <button @click="duplicateSelection" :disabled="selectionStore.count() === 0 || isAnimating">
            📄 Duplicate
          </button>
          <button @click="deleteSelection" :disabled="selectionStore.count() === 0 || isAnimating">
            🗑️ Delete
          </button>
        </div>
        <span class="separator">|</span>
      </template>

      <!-- Freehand Tool Toolbar -->
      <template v-if="activeTool === 'freehand'">
        <button @click="showGrid = !showGrid" :class="{ active: showGrid }" :disabled="isAnimating">
          {{ showGrid ? '⊞ Grid On' : '⊡ Grid Off' }}
        </button>
        <div class="button-group vertical">
          <button @click="duplicateSelection" :disabled="selectionStore.count() === 0 || isAnimating">
            📄 Duplicate
          </button>
          <button @click="deleteSelection" :disabled="selectionStore.count() === 0 || isAnimating">
            🗑️ Delete
          </button>
        </div>
        <span class="separator">|</span>
        <button @click="useRealTiming = !useRealTiming" :class="{ active: useRealTiming }">
          {{ useRealTiming ? '⏱️ Real Time' : '⏱️ Max 0.3s' }}
        </button>
        <span class="separator">|</span>
        <button @click="showMetadataEditor = !showMetadataEditor" :class="{ active: showMetadataEditor }"
        :disabled="isAnimating">
        📝 Metadata
        </button>
          <span class="separator">|</span>
         <div class="button-group vertical">
           <button @click="downloadFreehandDrawing" :disabled="isAnimating">
             💾 Download
           </button>
           <button @click="uploadFreehandDrawing" :disabled="isAnimating">
             📁 Upload
           </button>
         </div>
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
        <button @click="clearCurrentPolygon" :disabled="!isDrawingPolygon || isAnimating">
        🗑️ Cancel Shape
        </button>
        <button @click="deleteSelection" :disabled="selectionStore.isEmpty() || isAnimating">
          🗑️ Delete
        </button>
        <span class="separator">|</span>
        <button @click="showMetadataEditor = !showMetadataEditor" :class="{ active: showMetadataEditor }"
          :disabled="isAnimating">
          📝 Metadata
        </button>
        <span v-if="isDrawingPolygon" class="info">Drawing: {{ currentPolygonPoints.length / 2 }} points</span>
      </template>
      <span class="separator">|</span>
      <span class="info">{{ selectionStore.count() }} selected</span>
    </div>
    <div class="canvas-wrapper">
      <div ref="konvaContainer" class="konva-container" :style="{
        width: resolution.width + 'px',
        height: resolution.height + 'px',
      }"></div>

      <!-- Smart Metadata Editor -->
      <div class="metadata-suite" v-if="showMetadataEditor">
        <VisualizationToggles />
        <HierarchicalMetadataEditor :on-apply-metadata="handleApplyMetadata" />
      </div>

      <Timeline :strokes="freehandStrokes" :selectedStrokes="selectedStrokesForTimeline" :useRealTiming="useRealTiming"
        :maxInterStrokeDelay="maxInterStrokeDelay"
        :overrideDuration="timelineDuration > 0 ? timelineDuration : undefined" :lockWhileAnimating="setAnimatingState"
        @timeUpdate="handleTimeUpdate" />
      <div v-if="isAnimating" class="animation-lock-warning">
        ⚠️ Timeline has modified elements - press Stop to unlock
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-root {
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
  flex-direction: column;
  align-items: center;
  gap: 20px;
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

.button-group.vertical {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.button-group.vertical button {
  margin: 0;
  padding: 3px 10px;
  font-size: 12px;
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

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.6;
  }
}

.konva-container {
  background-color: white;
  border: 1px solid black;
}





.metadata-suite {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 600px;
}
</style>
