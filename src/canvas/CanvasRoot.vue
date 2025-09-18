<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { createCanvasRuntimeState, type CanvasRuntimeState, type CanvasStateSnapshot, type FreehandRenderData, type PolygonRenderData } from './canvasState';
import * as selectionStore from './selectionStore';
import { getCanvasItem } from './CanvasItem';
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from 'vue';
import { singleKeydownEvent } from './keyboard';
import Konva from 'konva';
import Timeline from './Timeline.vue';
import HierarchicalMetadataEditor from './HierarchicalMetadataEditor.vue';
import VisualizationToggles from './VisualizationToggles.vue';
import { clearFreehandSelection as clearFreehandSelectionImpl, createStrokeShape as createStrokeShapeImpl, deserializeFreehandState, getStrokePath, gridSize, serializeFreehandState, updateBakedFreehandData, updateFreehandDraggableStates as updateFreehandDraggableStatesImpl, updateTimelineState as updateTimelineStateImpl, type FreehandStroke, handleTimeUpdate as handleTimeUpdateImpl, maxInterStrokeDelay, initFreehandLayers } from './freehandTool';
import { freehandStrokes } from './canvasState';
import { getPointsBounds } from './canvasUtils';
import { CommandStack } from './commandStack';
import { ensureHighlightLayer, createMetadataToolkit } from './metadata';
import { clearPolygonSelection as clearPolygonSelectionImpl, updatePolygonControlPoints as updatePolygonControlPointsImpl, deserializePolygonState, handlePolygonClick as handlePolygonClickImpl, handlePolygonMouseMove as handlePolygonMouseMoveImpl, handlePolygonEditMouseMove as handlePolygonEditMouseMoveImpl, finishPolygon as finishPolygonImpl, clearCurrentPolygon as clearCurrentPolygonImpl, serializePolygonState, updateBakedPolygonData, initPolygonLayers, setupPolygonModeWatcher as setupPolygonModeWatcherImpl } from './polygonTool';
import { initAVLayer, refreshAnciliaryViz } from './ancillaryVisualizations';
import { initializeTransformer } from './transformerManager';
import {
  initializeSelectTool as initializeSelectToolImpl,
  handleSelectPointerDown as handleSelectPointerDownImpl,
  handleSelectPointerMove as handleSelectPointerMoveImpl,
  handleSelectPointerUp as handleSelectPointerUpImpl,
  groupSelection as groupSelectionImpl,
  ungroupSelection as ungroupSelectionImpl,
  canGroupSelection as canGroupSelectionImpl,
  canUngroupSelection as canUngroupSelectionImpl,
  duplicateSelection as duplicateSelectionImpl,
  deleteSelection as deleteSelectionImpl
} from './selectTool';
import { downloadCanvasState as downloadCanvasStateImpl, uploadCanvasState as uploadCanvasStateImpl, serializeCanvasState as serializeCanvasStateImpl, deserializeCanvasState as deserializeCanvasStateImpl } from './canvasPersistence';

// ==================== common stuff ====================
const props = withDefaults(defineProps<{
  syncState?: (state: CanvasStateSnapshot) => void
  initialFreehandState?: string
  initialPolygonState?: string
  width?: number | string
  height?: number | string
  showTimeline?: boolean
  showVisualizations?: boolean
}>(), {
  initialFreehandState: '',
  initialPolygonState: '',
  width: 1000,
  height: 500,
  showTimeline: false,
  showVisualizations: false,
})

const emit = defineEmits<{
  (event: 'state-update', state: CanvasStateSnapshot): void
}>()

const resolution = computed(() => {
  const width = Number(props.width)
  const height = Number(props.height)

  return {
    width: Number.isFinite(width) ? width : 1000,
    height: Number.isFinite(height) ? height : 500,
  }
})


// Create and initialize canvas runtime state
const canvasState: CanvasRuntimeState = createCanvasRuntimeState()
const metadataToolkit = createMetadataToolkit(canvasState)

let disposeEscapeListener: (() => void) | undefined

const activeTool = canvasState.activeTool
const metadataEditorVisible = canvasState.metadata.showEditor

//vue specific - comma needed in <T,> to disambigate generics from html parsing
const cloneValue = <T,>(value: T): T => {
  if (value === undefined || value === null) {
    return value
  }
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

const snapshotFreehandRenderData = (data: FreehandRenderData | undefined) => {
  if (!data) return [] as FreehandRenderData
  return (cloneValue(toRaw(data)) ?? []) as FreehandRenderData
}

const snapshotPolygonRenderData = (data: PolygonRenderData | undefined) => {
  if (!data) return [] as PolygonRenderData
  return (cloneValue(toRaw(data)) ?? []) as PolygonRenderData
}

const snapshotGroupMap = (map: Record<string, number[]> | undefined) => {
  if (!map) return {} as Record<string, number[]>
  return (cloneValue(toRaw(map)) ?? {}) as Record<string, number[]>
}

const createSnapshot = (state: CanvasRuntimeState): CanvasStateSnapshot => {
  const freehandRenderData = snapshotFreehandRenderData(state.freehand.bakedRenderData)
  const freehandGroupMap = snapshotGroupMap(state.freehand.bakedGroupMap)
  const polygonRenderData = snapshotPolygonRenderData(state.polygon.bakedRenderData)

  return {
    freehand: {
      serializedState: state.freehand.serializedState ?? '',
      bakedRenderData: freehandRenderData ?? [],
      bakedGroupMap: freehandGroupMap ?? {},
    },
    polygon: {
      serializedState: state.polygon.serializedState ?? '',
      bakedRenderData: polygonRenderData ?? [],
    },
  }
}

const emitStateUpdate = (state: CanvasRuntimeState) => {
  const snapshot = createSnapshot(state)
  props.syncState?.(snapshot)
  emit('state-update', snapshot)
}

canvasState.callbacks.syncAppState = emitStateUpdate

watch(
  () => props.syncState,
  () => {
    emitStateUpdate(canvasState)
  },
  { immediate: true }
)

// Stateful wrappers for select tool helpers
const initializeSelectToolStateful = (layer: Konva.Layer) => initializeSelectToolImpl(canvasState, layer)
const handleSelectPointerDownStateful = (stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) => handleSelectPointerDownImpl(canvasState, stage, e)
const handleSelectPointerMoveStateful = (stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) => handleSelectPointerMoveImpl(canvasState, stage, e)
const handleSelectPointerUpStateful = (stage: Konva.Stage, e: Konva.KonvaEventObject<MouseEvent>) => handleSelectPointerUpImpl(canvasState, stage, e)
const groupSelectionStateful = () => groupSelectionImpl(canvasState)
const ungroupSelectionStateful = () => ungroupSelectionImpl(canvasState)
const duplicateSelectionStateful = () => duplicateSelectionImpl(canvasState)
const deleteSelectionStateful = () => deleteSelectionImpl(canvasState)
const canGroupSelectionStateful = computed<boolean>(() => canGroupSelectionImpl(canvasState))
const canUngroupSelectionStateful = computed<boolean>(() => canUngroupSelectionImpl(canvasState))

// Stateful wrappers for freehand helpers
const clearFreehandSelection = () => clearFreehandSelectionImpl(canvasState)
const createStrokeShape = (points: number[], id: string) => createStrokeShapeImpl(canvasState, points, id)
const updateFreehandDraggableStates = () => updateFreehandDraggableStatesImpl(canvasState)
const updateTimelineState = () => updateTimelineStateImpl(canvasState)
const handleTimeUpdate = (time: number) => handleTimeUpdateImpl(canvasState, time)
const downloadCanvasState = () => downloadCanvasStateImpl(canvasState)
const uploadCanvasState = () => uploadCanvasStateImpl(canvasState, { handleTimeUpdate })

// Stateful wrappers for polygon helpers
const clearPolygonSelection = () => clearPolygonSelectionImpl(canvasState)
const updatePolygonControlPoints = () => updatePolygonControlPointsImpl(canvasState)
const handlePolygonClick = (pos: { x: number, y: number }) => handlePolygonClickImpl(canvasState, pos)
const handlePolygonMouseMove = () => handlePolygonMouseMoveImpl(canvasState)
const handlePolygonEditMouseMove = () => handlePolygonEditMouseMoveImpl(canvasState)
const finishPolygon = () => finishPolygonImpl(canvasState)
const clearCurrentPolygon = () => clearCurrentPolygonImpl(canvasState)
const setupPolygonModeWatcher = () => setupPolygonModeWatcherImpl(canvasState)

const selectedKonvaNodes = canvasState.selection.selectedKonvaNodes
const singleSelectedNode = computed(() => selectionStore.getActiveSingleNode(canvasState))
const multiSelected = computed(() => selectionStore.count(canvasState) > 1)
const groupSelected = computed(() => {
  const nodes = selectedKonvaNodes.value
  return nodes.length === 1 && nodes[0] instanceof Konva.Group
})


canvasState.callbacks.refreshAncillaryViz = () => refreshAnciliaryViz(canvasState)



// ==================== Unified Command Stack ====================
const captureCanvasState = () => serializeCanvasStateImpl(canvasState)

const restoreCanvasState = (stateString: string) => {
  if (!stateString) return
  const restored = deserializeCanvasStateImpl(canvasState, stateString, { handleTimeUpdate })
  if (!restored) {
    console.warn('Failed to restore canvas state: invalid payload')
  }
}

// Reactive properties for undo/redo button states
const canUndoReactive = ref(false)
const canRedoReactive = ref(false)

const onCanvasStateChange = () => {
  updateBakedFreehandData(canvasState)
  updateBakedPolygonData(canvasState)
  refreshAnciliaryViz(canvasState)
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

// Callback for Timeline to set animation state  
const setAnimatingState = (animating: boolean) => {
  canvasState.freehand.isAnimating.value = animating

  const stageRef = canvasState.stage
  if (!stageRef) return

  if (animating) {
    stageRef.listening(false)
  } else {
    stageRef.listening(true)
  }
}

// Add this ref near the other refs
const konvaContainer = ref<HTMLDivElement>()



// Helper to consistently apply layer listening per tool
const applyToolMode = (state: CanvasRuntimeState, tool: 'select' | 'freehand' | 'polygon') => {
  const freehandShapeLayer = state.layers.freehandShape
  const freehandDrawingLayer = state.layers.freehandDrawing
  const selectionLayer = state.layers.transformerLayer ?? state.layers.freehandSelection
  const stageRef = state.stage
  // Clear selections when switching tools
  selectionStore.clear(state)

  if (tool === 'select') {
    // Enable interaction with shape layers for selection
    freehandShapeLayer?.listening(true)
    state.layers.polygonShapes?.listening(true)

    // Disable drawing-specific layers
    freehandDrawingLayer?.listening(false)
    state.layers.polygonPreview?.listening(false)
    state.layers.polygonControls?.listening(false)

    // Keep selection layers active (transformer lives here)
    selectionLayer?.listening(true)
    state.layers.polygonSelection?.listening(true)

    // Ensure transformer/selection overlay sits above shapes
    selectionLayer?.moveToTop()
    if (stageRef) ensureHighlightLayer(canvasState, stageRef).moveToTop()
  } else if (tool === 'freehand') {
    // Freehand drawing mode
    freehandShapeLayer?.listening(true)
    freehandDrawingLayer?.listening(true)
    selectionLayer?.listening(true)

    // Disable polygon interactive layers
    state.layers.polygonShapes?.listening(false)
    state.layers.polygonPreview?.listening(false)
    state.layers.polygonControls?.listening(false)
    state.layers.polygonSelection?.listening(false)
  } else if (tool === 'polygon') {
    // Polygon mode
    state.layers.polygonShapes?.listening(true)
    state.layers.polygonPreview?.listening(true)
    state.layers.polygonControls?.listening(true)
    state.layers.polygonSelection?.listening(true)

    // Disable freehand interactive layers
    freehandShapeLayer?.listening(false)
    freehandDrawingLayer?.listening(false)
    selectionLayer?.listening(false)
  }

  // Manage polygon control points visibility lifecycle across tools
  if (tool === 'polygon') {
    if (state.polygon.mode.value === 'edit') {
      updatePolygonControlPoints()
    } else {
      state.layers.polygonControls?.destroyChildren()
      state.layers.polygonControls?.batchDraw()
    }
  } else {
    // Leaving polygon tool – remove control points
    state.layers.polygonControls?.destroyChildren()
    state.layers.polygonControls?.batchDraw()
  }

  // Update node draggability to avoid conflicting with selection-drag logic
  const setAllDraggable = (draggable: boolean) => {
    freehandShapeLayer?.getChildren().forEach((node: Konva.Node) => {
      if (node instanceof Konva.Path || node instanceof Konva.Group) node.draggable(draggable)
    })
    state.layers.polygonShapes?.getChildren().forEach(node => {
      if (node instanceof Konva.Line || node instanceof Konva.Group) node.draggable(draggable)
    })
  }
  // Disable node-level drags; selection drag and transformer manage moves
  setAllDraggable(false)

  // Redraw
  stageRef?.batchDraw()
}

// Watch for tool changes - new three-tool system
watch(activeTool, (newTool) => {
  applyToolMode(canvasState, newTool)
}, { immediate: true })


// Old metadata watchers removed – unified editor reads directly from selectionStore

// Callback for HierarchicalMetadataEditor to apply metadata via unified selection tool
const handleApplyMetadata = (node: Konva.Node, metadata: any) => {
  try {
    const item = getCanvasItem(canvasState, node)
    if (item) {
      // Route through unified selection store (handles undo/redo + updates)
      selectionStore.setMetadata(canvasState, item, metadata)
    } else {
      // Fallback for non-registered nodes (should be rare)
      node.setAttr('metadata', metadata === undefined || Object.keys(metadata).length === 0 ? undefined : metadata)
      updateBakedFreehandData(canvasState)
      updateBakedPolygonData(canvasState)
    }
  } catch (e) {
    // Safe fallback if metadata routing fails for any reason
    node.setAttr('metadata', metadata === undefined || Object.keys(metadata).length === 0 ? undefined : metadata)
    updateBakedFreehandData(canvasState)
    updateBakedPolygonData(canvasState)
  }
}

onMounted(async () => {
  try {
    // Remove the manual container creation and use the ref instead
    if (!konvaContainer.value) {
      console.error('Konva container ref not found')
      return
    }

    // Initialize Konva using the ref
    const initialResolution = resolution.value
    const stageInstance = new Konva.Stage({
      container: konvaContainer.value,
      width: initialResolution.width,
      height: initialResolution.height,
    })
    canvasState.stage = stageInstance
    canvasState.konvaContainer = konvaContainer.value

    // Update cursor based on active tool
    const updateCursorFn = () => {
      if (konvaContainer.value) {
        konvaContainer.value.style.cursor = activeTool.value === 'freehand' ? 'crosshair' : 'default'
      }
    }
    canvasState.callbacks.updateCursor = updateCursorFn
    canvasState.callbacks.updateCursor?.()

    // Create layers using state-based initialization
    initFreehandLayers(canvasState, stageInstance)
    initPolygonLayers(canvasState, stageInstance)

    const freehandSelectionLayer = canvasState.layers.freehandSelection
    if (!freehandSelectionLayer) {
      console.error('Freehand selection layer not initialized')
      return
    }

    // Initialize unified transformer
    initializeTransformer(canvasState, freehandSelectionLayer)

    // Initialize select tool
    const selectionLayerForTool = canvasState.layers.transformerLayer ?? freehandSelectionLayer
    initializeSelectToolStateful(selectionLayerForTool)

    // Add metadata highlight layer on top
    const metadataHighlightLayer = ensureHighlightLayer(canvasState, stageInstance)
    // Keep transformer layer above all interactive shape layers to prevent pointer blocking
    canvasState.layers.transformerLayer?.moveToTop()
    // Keep highlight visuals on top (non-listening, so it won't block interaction)
    metadataHighlightLayer.moveToTop()



    // Initialize ancillary visualizations layer
    initAVLayer(canvasState)


    // Selection rectangle is created by core/selectTool.initializeSelectTool

    // Apply initial tool mode AFTER layers exist (important for transformer interactivity post-HMR)
    applyToolMode(canvasState, activeTool.value)

    // Unified transformer is initialized by core/transformerManager

    // Initialize polygon control points only if polygon tool is active and editing
    if (activeTool.value === 'polygon' && canvasState.polygon.mode.value === 'edit') {
      updatePolygonControlPoints()
    }

    // Initialize cursor
    canvasState.callbacks.updateCursor?.()

    const applyFreehandState = (stateString: string) => {
      if (!stateString || stateString === canvasState.freehand.serializedState) return
      deserializeFreehandState(canvasState, stateString)
    }

    const applyPolygonState = (stateString: string) => {
      if (!stateString || stateString === canvasState.polygon.serializedState) return
      deserializePolygonState(canvasState, stateString)
    }

    applyFreehandState(props.initialFreehandState)
    applyPolygonState(props.initialPolygonState)

    watch(() => props.initialFreehandState, (stateString) => {
      applyFreehandState(stateString)
    })

    watch(() => props.initialPolygonState, (stateString) => {
      applyPolygonState(stateString)
    })

    watch(
      () => [props.width, props.height] as const,
      ([width, height]) => {
        const numericWidth = Number(width)
        const numericHeight = Number(height)

        const nextWidth = Number.isFinite(numericWidth) ? numericWidth : resolution.value.width
        const nextHeight = Number.isFinite(numericHeight) ? numericHeight : resolution.value.height

        const stage = canvasState.stage
        if (stage) {
          stage.width(nextWidth)
          stage.height(nextHeight)
          stage.batchDraw()
        }

        if (canvasState.konvaContainer) {
          canvasState.konvaContainer.style.width = `${nextWidth}px`
          canvasState.konvaContainer.style.height = `${nextHeight}px`
        }
      },
      { immediate: true }
    )

    // Re-apply tool mode after deserialization to ensure control points/transformer states are correct
    applyToolMode(canvasState, activeTool.value)

    emitStateUpdate(canvasState)


    // Mouse/touch event handlers - new three-tool system
    stageInstance.on('mousedown touchstart', (e) => {
      const pos = stageInstance.getPointerPosition()
      if (!pos) return

      if (activeTool.value === 'select') {
        // Universal select tool handles all selection for both freehand and polygon
        handleSelectPointerDownStateful(stageInstance, e)
      } else if (activeTool.value === 'freehand') {
        // Freehand tool always draws in this mode; selection via Select tool
        canvasState.freehand.isDrawing = true
        canvasState.freehand.currentPoints = [pos.x, pos.y]
        canvasState.freehand.drawingStartTime = performance.now()
        canvasState.freehand.currentTimestamps = [0]

        // Clear selection when starting to draw
        selectionStore.clear(canvasState)
      } else if (activeTool.value === 'polygon') {
        // Polygon tool handles polygon-specific interactions only (no selection)
        const parent = e.target.getParent?.()
        const isControlPoint = parent === canvasState.layers.polygonControls
        if (!isControlPoint) {
          handlePolygonClick(pos)
        }
      }
    })

    stageInstance.on('mousemove touchmove', (e) => {
      const freehandDrawingLayer = canvasState.layers.freehandDrawing
      if (activeTool.value === 'select') {
        // Handle drag selection for select tool
        handleSelectPointerMoveStateful(stageInstance, e)
      } else if (activeTool.value === 'freehand') {
        if (canvasState.freehand.isDrawing) {
          // Handle drawing
          const pos = stageInstance.getPointerPosition()
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
        if (canvasState.polygon.mode.value === 'draw' && canvasState.polygon.isDrawing.value) {
          handlePolygonMouseMove()
        } else if (canvasState.polygon.mode.value === 'edit') {
          handlePolygonEditMouseMove()
        }
        // Note: selection drag is handled by select tool when appropriate
      }
    })

    stageInstance.on('mouseup touchend', (e) => {
      const freehandDrawingLayer = canvasState.layers.freehandDrawing
      if (activeTool.value === 'freehand' && canvasState.freehand.isDrawing) {
        canvasState.freehand.isDrawing = false
        freehandDrawingLayer?.destroyChildren()

        if (canvasState.freehand.currentPoints.length > 2) {
          executeCommand('Draw Stroke', () => {
            const freehandShapeLayer = canvasState.layers.freehandShape
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
            freehandStrokes(canvasState).set(strokeId, stroke)
            freehandShapeLayer?.add(shape)
            updateFreehandDraggableStates() // Update draggable state for new stroke
            updateTimelineState() // Update timeline state when new stroke is added
            freehandShapeLayer?.batchDraw()
            updateBakedFreehandData(canvasState) // Update baked data after new stroke
          })
        }

        canvasState.freehand.currentPoints = []
        canvasState.freehand.currentTimestamps = []
      } else {
        // Delegate to select tool for all other cases
        handleSelectPointerUpStateful(stageInstance, e)
      }
    })

    // Set up polygon mode watcher
    setupPolygonModeWatcher()

    // Escape key handling for polygon tool
    disposeEscapeListener = singleKeydownEvent(canvasState, 'Escape', (ev) => {
      if (activeTool.value === 'polygon' && canvasState.polygon.isDrawing.value) {
        // Auto-close the current polygon if it has at least 3 points
        if (canvasState.polygon.currentPoints.value.length >= 6) {
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
  serializeFreehandState(canvasState)
  serializePolygonState(canvasState)

  disposeEscapeListener?.()
  disposeEscapeListener = undefined
  canvasState.keyboardDisposables.splice(0).forEach((dispose) => dispose())

  // Clean up Konva
  canvasState.stage?.destroy()
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
          <button @click="groupSelectionStateful" :disabled="!canGroupSelectionStateful || canvasState.freehand.isAnimating.value">
            Group
          </button>
          <button @click="ungroupSelectionStateful"
            :disabled="!canUngroupSelectionStateful || canvasState.freehand.isAnimating.value">
            Ungroup
          </button>
        </div>
        <span class="separator">|</span>
        <div class="button-group vertical">
          <button @click="duplicateSelectionStateful"
            :disabled="selectionStore.count(canvasState) === 0 || canvasState.freehand.isAnimating.value">
            📄 Duplicate
          </button>
          <button @click="deleteSelectionStateful"
            :disabled="selectionStore.count(canvasState) === 0 || canvasState.freehand.isAnimating.value">
            🗑️ Delete
          </button>
        </div>
        <span class="separator">|</span>
        <button @click="metadataEditorVisible = !metadataEditorVisible" :class="{ active: metadataEditorVisible }"
          :disabled="canvasState.freehand.isAnimating.value">
          📝 Metadata
        </button>
        <span class="separator">|</span>
        <div class="button-group vertical">
          <button @click="downloadCanvasState" :disabled="canvasState.freehand.isAnimating.value">
            💾 Download
          </button>
          <button @click="uploadCanvasState" :disabled="canvasState.freehand.isAnimating.value">
            📁 Upload
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
          <button @click="duplicateSelectionStateful"
            :disabled="selectionStore.count(canvasState) === 0 || canvasState.freehand.isAnimating.value">
            📄 Duplicate
          </button>
          <button @click="deleteSelectionStateful"
            :disabled="selectionStore.count(canvasState) === 0 || canvasState.freehand.isAnimating.value">
            🗑️ Delete
          </button>
        </div>
        <span class="separator">|</span>
        <button @click="canvasState.freehand.useRealTiming.value = !canvasState.freehand.useRealTiming.value"
          :class="{ active: canvasState.freehand.useRealTiming.value }">
          {{ canvasState.freehand.useRealTiming.value ? '⏱️ Real Time' : '⏱️ Max 0.3s' }}
        </button>
      </template>

      <!-- Polygon Tool Toolbar -->
      <template v-if="activeTool === 'polygon'">
        <button @click="canvasState.polygon.mode.value = 'draw'" :class="{ active: canvasState.polygon.mode.value === 'draw' }"
          :disabled="canvasState.freehand.isAnimating.value">
          ✏️ New Shape
        </button>
        <button @click="canvasState.polygon.mode.value = 'edit'" :class="{ active: canvasState.polygon.mode.value === 'edit' }"
          :disabled="canvasState.freehand.isAnimating.value">
          ✏️ Edit Shape
        </button>
        <button @click="canvasState.freehand.showGrid.value = !canvasState.freehand.showGrid.value"
          :class="{ active: canvasState.freehand.showGrid.value }" :disabled="canvasState.freehand.isAnimating.value">
          {{ canvasState.freehand.showGrid.value ? '⊞ Grid On' : '⊡ Grid Off' }}
        </button>
        <span class="separator">|</span>
        <button @click="clearCurrentPolygon" :disabled="!canvasState.polygon.isDrawing.value || canvasState.freehand.isAnimating.value">
          🗑️ Cancel Shape
        </button>
        <button @click="deleteSelectionStateful" :disabled="selectionStore.isEmpty(canvasState) || canvasState.freehand.isAnimating.value">
          🗑️ Delete
        </button>
        <span class="separator">|</span>
        <span v-if="canvasState.polygon.isDrawing.value" class="info">Drawing: {{ canvasState.polygon.currentPoints.value.length / 2 }} points</span>
      </template>
      <span class="separator">|</span>
      <span class="info">{{ selectionStore.count(canvasState) }} selected</span>
    </div>
    <div class="canvas-wrapper">
      <div ref="konvaContainer" class="konva-container" :style="{
        width: resolution.width + 'px',
        height: resolution.height + 'px',
      }"></div>

      <!-- Smart Metadata Editor -->
      <div class="metadata-suite" v-if="metadataEditorVisible">
        <VisualizationToggles v-if="props.showVisualizations" :canvas-state="canvasState" />
        <HierarchicalMetadataEditor
          :selected-nodes="selectedKonvaNodes"
          :single-node="singleSelectedNode"
          :multi-selected="multiSelected"
          :group-selected="groupSelected"
          :collect-hierarchy-from-root="metadataToolkit.collectHierarchyFromRoot"
          :update-metadata-highlight="metadataToolkit.updateMetadataHighlight"
          :update-hover-highlight="metadataToolkit.updateHoverHighlight"
          :on-apply-metadata="handleApplyMetadata"
        />
      </div>

      <template v-if="props.showTimeline">
        <Timeline :strokes="freehandStrokes(canvasState)" :selectedStrokes="canvasState.freehand.selectedStrokesForTimeline.value"
          :useRealTiming="canvasState.freehand.useRealTiming.value" :maxInterStrokeDelay="maxInterStrokeDelay"
          :overrideDuration="canvasState.freehand.timelineDuration.value > 0 ? canvasState.freehand.timelineDuration.value : undefined"
          :lockWhileAnimating="setAnimatingState" @timeUpdate="handleTimeUpdate" />
        <div v-if="canvasState.freehand.isAnimating.value" class="animation-lock-warning">
          ⚠️ Timeline has modified elements - press Stop to unlock
        </div>
      </template>
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
