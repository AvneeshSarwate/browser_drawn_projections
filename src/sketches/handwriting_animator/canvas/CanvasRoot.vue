<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, resolution, drawFlattenedStrokeGroup, stage, setStage, showMetadataEditor, activeTool } from '../appState';
import { createCanvasRuntimeState, type CanvasRuntimeState, setGlobalCanvasState } from './canvasState';
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
import { clearFreehandSelection, createStrokeShape, deserializeFreehandState, getStrokePath, gridSize, serializeFreehandState, updateBakedStrokeData, updateFreehandDraggableStates, updateTimelineState, type FreehandStroke, handleTimeUpdate, maxInterStrokeDelay, setUpdateCursor, updateCursor, downloadFreehandDrawing, uploadFreehandDrawing, setRefreshAVs, getCurrentFreehandStateString, restoreFreehandState, initFreehandLayers } from './freehandTool';
import { freehandStrokes, getGlobalCanvasState } from './canvasState';
import { getPointsBounds } from './canvasUtils';
import { CommandStack } from './commandStack';
import { setGlobalExecuteCommand, setGlobalPushCommand } from './commands';
import { ensureHighlightLayer } from '@/metadata';
import { clearPolygonSelection, updatePolygonControlPoints, deserializePolygonState, polygonMode, handlePolygonClick, isDrawingPolygon, handlePolygonMouseMove, handlePolygonEditMouseMove, currentPolygonPoints, finishPolygon, clearCurrentPolygon, serializePolygonState, getCurrentPolygonStateString, restorePolygonState, updateBakedPolygonData, initPolygonLayers } from './polygonTool';
import { initAVLayer, refreshAnciliaryViz } from './ancillaryVisualizations';
import { initializeTransformer } from './transformerManager';
import { initializeSelectTool, handleSelectPointerDown, handleSelectPointerMove, handleSelectPointerUp, groupSelection, ungroupSelection, canGroupSelection, canUngroupSelection, duplicateSelection, deleteSelection } from './selectTool';
import { sinN } from '@/channels/channels';

// ==================== common stuff ====================
const appState = inject<TemplateAppState>(appStateName)!!

// Create and initialize canvas runtime state
const canvasState: CanvasRuntimeState = createCanvasRuntimeState()

// Set the global canvas state for all modules to access
setGlobalCanvasState(canvasState)

// Set up callbacks for data updates
canvasState.callbacks.freehandDataUpdate = updateBakedStrokeData
canvasState.callbacks.polygonDataUpdate = updateBakedPolygonData
canvasState.callbacks.refreshAncillaryViz = refreshAnciliaryViz

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

// Reactive properties for undo/redo button states
const canUndoReactive = ref(false)
const canRedoReactive = ref(false)

const onCanvasStateChange = () => {
  updateBakedStrokeData()
  updateBakedPolygonData()
  refreshAnciliaryViz()
  // Update reactive button states after any command stack change
  canUndoReactive.value = commandStack.canUndo()
  canRedoReactive.value = commandStack.canRedo()
}

// Create unified command stack instance
const commandStack = new CommandStack(captureCanvasState, restoreCanvasState, onCanvasStateChange)

// Store in canvas state
canvasState.command.stack = commandStack

// Initialize button states
canUndoReactive.value = commandStack.canUndo()
canRedoReactive.value = commandStack.canRedo()

// Expose command stack methods for use in templates and other functions
const executeCommand = (name: string, action: () => void) => commandStack.executeCommand(name, action)
const undo = () => commandStack.undo()
const redo = () => commandStack.redo()

// Set up command callbacks in state
canvasState.command.executeCommand = executeCommand
canvasState.command.pushCommand = (name: string, beforeState: string, afterState: string) => {
  commandStack.pushCommand(name, beforeState, afterState)
}

// Grouping logic moved to core/selectTool

// Tool switching - now imported from appState

// Callback for Timeline to set animation state  
const setAnimatingState = (animating: boolean) => {
  canvasState.freehand.isAnimating.value = animating

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
  const freehandShapeLayer = getGlobalCanvasState().layers.freehandShape
  const freehandDrawingLayer = getGlobalCanvasState().layers.freehandDrawing
  const freehandSelectionLayer = getGlobalCanvasState().layers.freehandSelection
  // Clear selections when switching tools
  selectionStore.clear()

  if (tool === 'select') {
    // Enable interaction with shape layers for selection
    freehandShapeLayer?.listening(true)
    canvasState.layers.polygonShapes?.listening(true)

    // Disable drawing-specific layers
    freehandDrawingLayer?.listening(false)
    canvasState.layers.polygonPreview?.listening(false)
    canvasState.layers.polygonControls?.listening(false)

    // Keep selection layers active (transformer lives here)
    freehandSelectionLayer?.listening(true)
    canvasState.layers.polygonSelection?.listening(true)

    // Ensure transformer/selection overlay sits above shapes
    freehandSelectionLayer?.moveToTop()
    if (stage) ensureHighlightLayer(stage).moveToTop()
  } else if (tool === 'freehand') {
    // Freehand drawing mode
    freehandShapeLayer?.listening(true)
    freehandDrawingLayer?.listening(true)
    freehandSelectionLayer?.listening(true)

    // Disable polygon interactive layers
    canvasState.layers.polygonShapes?.listening(false)
    canvasState.layers.polygonPreview?.listening(false)
    canvasState.layers.polygonControls?.listening(false)
    canvasState.layers.polygonSelection?.listening(false)
  } else if (tool === 'polygon') {
    // Polygon mode
    canvasState.layers.polygonShapes?.listening(true)
    canvasState.layers.polygonPreview?.listening(true)
    canvasState.layers.polygonControls?.listening(true)
    canvasState.layers.polygonSelection?.listening(true)

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
      canvasState.layers.polygonControls?.destroyChildren()
      canvasState.layers.polygonControls?.batchDraw()
    }
  } else {
    // Leaving polygon tool – remove control points
    canvasState.layers.polygonControls?.destroyChildren()
    canvasState.layers.polygonControls?.batchDraw()
  }

  // Update node draggability to avoid conflicting with selection-drag logic
  const setAllDraggable = (draggable: boolean) => {
    freehandShapeLayer?.getChildren().forEach((node: Konva.Node) => {
      if (node instanceof Konva.Path || node instanceof Konva.Group) node.draggable(draggable)
    })
    canvasState.layers.polygonShapes?.getChildren().forEach(node => {
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
    const stageInstance = new Konva.Stage({
      container: konvaContainer.value,
      width: resolution.width,
      height: resolution.height,
    })
    setStage(stageInstance)
    canvasState.stage = stageInstance
    canvasState.konvaContainer = konvaContainer.value

    // Update cursor based on active tool
    const updateCursorFn = () => {
      if (stageInstance && konvaContainer.value) {
        konvaContainer.value.style.cursor = activeTool.value === 'freehand' ? 'crosshair' : 'default'
      }
    }
    setUpdateCursor(updateCursorFn)
    canvasState.callbacks.updateCursor = updateCursorFn
    updateCursor!()

    // Create layers using state-based initialization
    initFreehandLayers(canvasState, stageInstance)
    initPolygonLayers(canvasState, stageInstance)

    // Initialize unified transformer
    initializeTransformer(canvasState.layers.freehandSelection!)

    // Initialize select tool
    initializeSelectTool(canvasState.layers.freehandSelection!)

    // Add metadata highlight layer on top
    const metadataHighlightLayer = ensureHighlightLayer(stage!)
    // Keep transformer layer above all interactive shape layers to prevent pointer blocking
    canvasState.layers.freehandSelection!.moveToTop()
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
        canvasState.freehand.isDrawing = true
        canvasState.freehand.currentPoints = [pos.x, pos.y]
        canvasState.freehand.drawingStartTime = performance.now()
        canvasState.freehand.currentTimestamps = [0]

        // Clear selection when starting to draw
        selectionStore.clear()
      } else if (activeTool.value === 'polygon') {
        // Polygon tool handles polygon-specific interactions only (no selection)
        const parent = e.target.getParent?.()
        const isControlPoint = parent === canvasState.layers.polygonControls
        if (!isControlPoint) {
          handlePolygonClick(pos)
        }
      }
    })

    stage!.on('mousemove touchmove', (e) => {
      const freehandDrawingLayer = getGlobalCanvasState().layers.freehandDrawing
      if (activeTool.value === 'select') {
        // Handle drag selection for select tool
        handleSelectPointerMove(stage!, e)
      } else if (activeTool.value === 'freehand') {
        if (canvasState.freehand.isDrawing) {
          // Handle drawing
          const pos = stage!.getPointerPosition()
          if (!pos) return

          canvasState.freehand.currentPoints.push(pos.x, pos.y)
          canvasState.freehand.currentTimestamps.push(performance.now() - canvasState.freehand.drawingStartTime)

          // Update preview
          freehandDrawingLayer?.destroyChildren()
          const previewPath = new Konva.Path({
            data: getStrokePath(canvasState.freehand.currentPoints),
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
      const freehandDrawingLayer = getGlobalCanvasState().layers.freehandDrawing
      if (activeTool.value === 'freehand' && canvasState.freehand.isDrawing) {
        canvasState.freehand.isDrawing = false
        freehandDrawingLayer?.destroyChildren()

        if (canvasState.freehand.currentPoints.length > 2) {
          executeCommand('Draw Stroke', () => {
            const freehandShapeLayer = getGlobalCanvasState().layers.freehandShape
            // Create new stroke
            const creationTime = Date.now()
            const strokeId = `stroke-${creationTime}`

            // Get bounds for normalization
            const bounds = getPointsBounds(canvasState.freehand.currentPoints)

            // Create normalized points
            const normalizedPoints: number[] = []
            for (let i = 0; i < canvasState.freehand.currentPoints.length; i += 2) {
              normalizedPoints.push(canvasState.freehand.currentPoints[i] - bounds.minX)
              normalizedPoints.push(canvasState.freehand.currentPoints[i + 1] - bounds.minY)
            }

            const originalPath = getStrokePath(normalizedPoints)
            const stroke: FreehandStroke = {
              id: strokeId,
              points: canvasState.freehand.currentPoints,
              timestamps: canvasState.freehand.currentTimestamps,
              originalPath: originalPath,
              creationTime: creationTime,
              isFreehand: true, // This is a freehand stroke with timing info
            }

            // Create shape
            const shape = createStrokeShape(canvasState.freehand.currentPoints, strokeId)
            stroke.shape = shape

            // Add to data structures
            freehandStrokes().set(strokeId, stroke)
            freehandShapeLayer?.add(shape)
            updateFreehandDraggableStates() // Update draggable state for new stroke
            updateTimelineState() // Update timeline state when new stroke is added
            freehandShapeLayer?.batchDraw()
            updateBakedStrokeData() // Update baked data after new stroke
          })
        }

        canvasState.freehand.currentPoints = []
        canvasState.freehand.currentTimestamps = []
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
      <select v-model="activeTool" :disabled="canvasState.freehand.isAnimating.value" class="tool-dropdown">
        <option value="select">👆 Select</option>
        <option value="freehand">✏️ Freehand</option>
        <option value="polygon">⬟ Polygon</option>
      </select>
      <span class="separator">|</span>

      <!-- Unified Undo/Redo (works for both tools) -->
      <div class="button-group vertical">
        <button @click="undo" :disabled="!canUndoReactive || canvasState.freehand.isAnimating.value"
          title="Undo (Ctrl/Cmd+Z)">
          ↶ Undo
        </button>
        <button @click="redo" :disabled="!canRedoReactive || canvasState.freehand.isAnimating.value"
          title="Redo (Ctrl/Cmd+Shift+Z)">
          ↷ Redo
        </button>
      </div>
      <span class="separator">|</span>

      <!-- Select Tool Toolbar -->
      <template v-if="activeTool === 'select'">
        <div class="button-group vertical">
          <button @click="groupSelection" :disabled="!canGroupSelection() || canvasState.freehand.isAnimating.value">
            Group
          </button>
          <button @click="ungroupSelection"
            :disabled="!canUngroupSelection() || canvasState.freehand.isAnimating.value">
            Ungroup
          </button>
        </div>
        <span class="separator">|</span>
        <div class="button-group vertical">
          <button @click="duplicateSelection"
            :disabled="selectionStore.count() === 0 || canvasState.freehand.isAnimating.value">
            📄 Duplicate
          </button>
          <button @click="deleteSelection"
            :disabled="selectionStore.count() === 0 || canvasState.freehand.isAnimating.value">
            🗑️ Delete
          </button>
        </div>
        <span class="separator">|</span>
      </template>

      <!-- Freehand Tool Toolbar -->
      <template v-if="activeTool === 'freehand'">
        <button @click="canvasState.freehand.showGrid.value = !canvasState.freehand.showGrid.value"
          :class="{ active: canvasState.freehand.showGrid.value }" :disabled="canvasState.freehand.isAnimating.value">
          {{ canvasState.freehand.showGrid.value ? '⊞ Grid On' : '⊡ Grid Off' }}
        </button>
        <div class="button-group vertical">
          <button @click="duplicateSelection"
            :disabled="selectionStore.count() === 0 || canvasState.freehand.isAnimating.value">
            📄 Duplicate
          </button>
          <button @click="deleteSelection"
            :disabled="selectionStore.count() === 0 || canvasState.freehand.isAnimating.value">
            🗑️ Delete
          </button>
        </div>
        <span class="separator">|</span>
        <button @click="canvasState.freehand.useRealTiming.value = !canvasState.freehand.useRealTiming.value"
          :class="{ active: canvasState.freehand.useRealTiming.value }">
          {{ canvasState.freehand.useRealTiming.value ? '⏱️ Real Time' : '⏱️ Max 0.3s' }}
        </button>
        <span class="separator">|</span>
        <button @click="showMetadataEditor = !showMetadataEditor" :class="{ active: showMetadataEditor }"
          :disabled="canvasState.freehand.isAnimating.value">
          📝 Metadata
        </button>
        <span class="separator">|</span>
        <div class="button-group vertical">
          <button @click="downloadFreehandDrawing" :disabled="canvasState.freehand.isAnimating.value">
            💾 Download
          </button>
          <button @click="uploadFreehandDrawing" :disabled="canvasState.freehand.isAnimating.value">
            📁 Upload
          </button>
        </div>
      </template>

      <!-- Polygon Tool Toolbar -->
      <template v-if="activeTool === 'polygon'">
        <button @click="polygonMode = 'draw'" :class="{ active: polygonMode === 'draw' }"
          :disabled="canvasState.freehand.isAnimating.value">
          ✏️ New Shape
        </button>
        <button @click="polygonMode = 'edit'" :class="{ active: polygonMode === 'edit' }"
          :disabled="canvasState.freehand.isAnimating.value">
          ✏️ Edit Shape
        </button>
        <button @click="canvasState.freehand.showGrid.value = !canvasState.freehand.showGrid.value"
          :class="{ active: canvasState.freehand.showGrid.value }" :disabled="canvasState.freehand.isAnimating.value">
          {{ canvasState.freehand.showGrid.value ? '⊞ Grid On' : '⊡ Grid Off' }}
        </button>
        <span class="separator">|</span>
        <button @click="clearCurrentPolygon" :disabled="!isDrawingPolygon || canvasState.freehand.isAnimating.value">
          🗑️ Cancel Shape
        </button>
        <button @click="deleteSelection" :disabled="selectionStore.isEmpty() || canvasState.freehand.isAnimating.value">
          🗑️ Delete
        </button>
        <span class="separator">|</span>
        <button @click="showMetadataEditor = !showMetadataEditor" :class="{ active: showMetadataEditor }"
          :disabled="canvasState.freehand.isAnimating.value">
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

      <Timeline :strokes="freehandStrokes()" :selectedStrokes="canvasState.freehand.selectedStrokesForTimeline.value"
        :useRealTiming="canvasState.freehand.useRealTiming.value" :maxInterStrokeDelay="maxInterStrokeDelay"
        :overrideDuration="canvasState.freehand.timelineDuration.value > 0 ? canvasState.freehand.timelineDuration.value : undefined"
        :lockWhileAnimating="setAnimatingState" @timeUpdate="handleTimeUpdate" />
      <div v-if="canvasState.freehand.isAnimating.value" class="animation-lock-warning">
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
