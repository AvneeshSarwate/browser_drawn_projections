<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, resolution, type FreehandRenderData, type FlattenedStroke, type FlattenedStrokeGroup, type PolygonRenderData, type FlattenedPolygon, drawFlattenedStrokeGroup, stage, setStage, activeNode, metadataText, showMetadataEditor, getActiveSingleNode, selectedPolygons, selected, activeTool, availableStrokes, animationParams, gpuStrokesReady, launchByName, groupName, scriptCode, scriptExecuting, SCRIPT_STORAGE_KEY } from './appState';
import { inject, onMounted, onUnmounted, ref, watch, computed, shallowReactive, type ShallowReactive, shallowRef, nextTick, h } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import Konva from 'konva';
import Timeline from './Timeline.vue';
import MetadataEditor from './MetadataEditor.vue';
import HierarchicalMetadataEditor from './HierarchicalMetadataEditor.vue';
import { clearFreehandSelection, createStrokeShape, currentPoints, currentTimestamps, deserializeFreehandState, drawingStartTime, executeFreehandCommand, finishFreehandDragTracking, freehandDrawingLayer, freehandDrawMode, freehandSelectionLayer, freehandShapeLayer, freehandStrokes, getPointsBounds, getStrokePath, gridSize, isAnimating, isDrawing, selTr, serializeFreehandState, setCurrentPoints, setCurrentTimestamps, setDrawingStartTime, setFreehandDrawingLayer, setFreehandSelectionLayer, setFreehandShapeLayer, setIsDrawing, setSelTr, showGrid, startFreehandDragTracking, updateBakedStrokeData, updateFreehandDraggableStates, updateTimelineState, type FreehandStroke, groupSelectedStrokes, ungroupSelectedStrokes, freehandCanGroupRef, isFreehandGroupSelected, freehandSelectedCount, undoFreehand, canUndoFreehand, canRedoFreehand, redoFreehand, useRealTiming, deleteFreehandSelected, selectedStrokesForTimeline, timelineDuration, handleTimeUpdate, maxInterStrokeDelay, setUpdateCursor, updateCursor, createMetadataHighlight, getGroupStrokeIndices, duplicateFreehandSelected, downloadFreehandDrawing, uploadFreehandDrawing } from './freehandTool';
import { DrawingScene } from './gpuStrokes/drawingScene';
import { StrokeInterpolator } from './gpuStrokes/strokeInterpolator';
import { DRAWING_CONSTANTS } from './gpuStrokes/constants';
import Stats from '@/rendering/stats';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { polygonShapesLayer, polygonPreviewLayer, polygonControlsLayer, polygonSelectionLayer, clearPolygonSelection, updatePolygonControlPoints, deserializePolygonState, polygonMode, handlePolygonClick, isDrawingPolygon, handlePolygonMouseMove, handlePolygonEditMouseMove, currentPolygonPoints, finishPolygon, clearCurrentPolygon, serializePolygonState, setPolygonControlsLayer, setPolygonPreviewLayer, setPolygonSelectionLayer, setPolygonShapesLayer, polygonUndo, polygonRedo, canPolygonUndo, canPolygonRedo, deleteSelectedPolygon } from './polygonTool';
import type { StrokePoint } from './gpuStrokes/strokeTypes';
import type { AnchorKind } from './gpuStrokes/coordinateUtils';

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
const babylonContainer = ref<HTMLCanvasElement>()



// GPU Strokes state
let drawingScene: DrawingScene | undefined = undefined
let strokeInterpolator: StrokeInterpolator | undefined = undefined
// availableStrokes, animationParams, gpuStrokesReady now imported from appState
const webGPUSupported = computed(() => typeof navigator !== 'undefined' && !!navigator.gpu)

// Group launch state
// launchByName, groupName now imported from appState
const availableGroups = computed(() => Object.keys(appState.freehandGroupMap))

// Script editor state
const scriptEditorRef = ref<HTMLDivElement>()
let scriptEditor: EditorView | undefined = undefined
// scriptCode, scriptExecuting now imported from appState

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

  // Show metadata editor if there's any selection (single nodes, groups, or multiple items)
  const hasAnySelection = selected.length > 0 || selectedPolygons.length > 0

  if (newActiveNode) {
    // Single node selected - populate the old metadata text for compatibility
    const metadata = newActiveNode.getAttr('metadata') ?? {}
    metadataText.value = JSON.stringify(metadata, null, 2)
    showMetadataEditor.value = true
  } else if (hasAnySelection) {
    // Group or multiple selection - show editor but clear old metadata text
    metadataText.value = ''
    showMetadataEditor.value = true
  } else {
    // No selection - hide editor
    metadataText.value = ''
    showMetadataEditor.value = false
  }
})

// Function to apply metadata changes
const applyMetadata = (metadata: any) => {
  if (!activeNode.value) return

  activeNode.value.setAttr('metadata', metadata)

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
}

// GPU Strokes functions
type GPUStroke = {
  index: number
  stroke: {
    id: string
    points: StrokePoint[]
    boundingBox: { minX: number, maxX: number, minY: number, maxY: number }
  }
}
const convertFreehandStrokesToGPUFormat = () => {
  if (!strokeInterpolator) return []

  // Use transformed data from appState.freehandRenderData instead of raw stroke data
  const flattenedStrokes: FlattenedStroke[] = []

  // Helper function to recursively extract all FlattenedStroke objects
  const extractStrokes = (strokeGroups: FlattenedStrokeGroup[]) => {
    strokeGroups.forEach(group => {
      group.children.forEach(child => {
        if ('points' in child) {
          // It's a FlattenedStroke
          flattenedStrokes.push(child)
        } else {
          // It's a FlattenedStrokeGroup, recurse
          extractStrokes([child])
        }
      })
    })
  }

  extractStrokes(appState.freehandRenderData)

  const gpuStrokes: GPUStroke[] = []

  for (let i = 0; i < Math.min(flattenedStrokes.length, DRAWING_CONSTANTS.MAX_STROKES); i++) {
    const flattenedStroke = flattenedStrokes[i]
    try {
      // Points are already in the correct format with x, y, ts from the transformed data
      const points = flattenedStroke.points.map(p => ({
        x: p.x,
        y: p.y,
        t: p.ts
      }))

      if (points.length < 2) continue // Skip invalid strokes

      // Calculate bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      points.forEach(p => {
        minX = Math.min(minX, p.x)
        maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y)
        maxY = Math.max(maxY, p.y)
      })

      // Create stroke object in expected format
      const strokeData = {
        id: `gpu_stroke_${i}`, // Generate ID since we don't have access to original stroke ID
        points: points,
        boundingBox: { minX, maxX, minY, maxY }
      }

      // Normalize the stroke using the interpolator
      const normalizedPoints = strokeInterpolator.normalizeStroke(strokeData)

      if (strokeInterpolator.validateNormalizedStroke(normalizedPoints)) {
        gpuStrokes.push({
          index: i,
          stroke: {
            ...strokeData,
            points: normalizedPoints
          }
        })
      }
    } catch (error) {
      console.warn(`Failed to convert stroke ${i}:`, error)
    }
  }

  return gpuStrokes
}

const updateGPUStrokes = () => {
  if (!drawingScene || !gpuStrokesReady.value) return

  try {
    const gpuStrokes = convertFreehandStrokesToGPUFormat()

    // Upload to GPU
    drawingScene.uploadStrokes(gpuStrokes)

    // Update available strokes list for UI
    availableStrokes.value = gpuStrokes.map((stroke, idx) => ({
      index: idx,
      name: `Stroke ${idx + 1}`
    }))

    // Reset animation params if they're out of bounds
    if (animationParams.value.strokeA >= gpuStrokes.length) {
      animationParams.value.strokeA = 0
    }
    if (animationParams.value.strokeB >= gpuStrokes.length) {
      animationParams.value.strokeB = 0
    }

    console.log(`Updated GPU with ${gpuStrokes.length} strokes`)
  } catch (error) {
    console.warn('Failed to update GPU strokes:', error)
  }
}

const initializeGPUStrokes = async () => {
  if (!babylonContainer.value) return

  try {
    // Check WebGPU support
    if (!navigator.gpu) {
      console.warn('WebGPU not supported - GPU strokes disabled')
      return
    }

    // Initialize components
    drawingScene = new DrawingScene()
    strokeInterpolator = new StrokeInterpolator()

    // Create stats for the GPU scene
    const stats = new Stats()
    stats.showPanel(0) // FPS
    babylonContainer.value.parentElement?.appendChild(stats.dom)

    // Initialize the scene
    await drawingScene.createScene(babylonContainer.value, stats)

    gpuStrokesReady.value = true

    // Initial stroke upload
    updateGPUStrokes()

    console.log('GPU Strokes initialized successfully')
  } catch (error) {
    console.error('Failed to initialize GPU Strokes:', error)
    gpuStrokesReady.value = false
  }
}

// fn phaser(pct: f32, phase: f32, e: f32) -> f32 {
//     return clamp((phase - 1.0 + pct * (1.0 + e)) / e, 0.0, 1.0);
// }

const phaser = (pct: number, phase: number, e: number): number => {
  return Math.max(0, Math.min(1, (phase - 1 + pct * (1 + e)) / e))
}

const handleBabylonCanvasClick = (event: MouseEvent) => {
  if (!drawingScene || !gpuStrokesReady.value) return

  const rect = babylonContainer.value?.getBoundingClientRect()
  if (!rect) return

  // Get click position relative to canvas
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  try {
    if (launchByName.value && groupName.value) {
      // Launch by group name using new unified API
      const strokeIndices = getGroupStrokeIndices(groupName.value)
      if (strokeIndices.length === 0) {
        console.warn(`No strokes found for group: ${groupName.value}`)
        return
      }

      const launchedAnimationIds = drawingScene.launchGroup(
        x, y,
        strokeIndices,
        {
          anchor: animationParams.value.position as AnchorKind,
          duration: animationParams.value.duration,
          scale: animationParams.value.scale,
          loop: animationParams.value.loop,
          startPhase: animationParams.value.startPhase,
          controlMode: 'manual' // Use manual control mode for group strokes
        }
      )

      if (launchedAnimationIds.length === 0) {
        console.warn(`Failed to launch any strokes for group: ${groupName.value}`)
        return
      }

      //call launchLoop() to manage animation progress
      launchLoop(async (ctx) => {
        const hangTimeFrac = 0.3 //amount of time to hang with whole group written out

        const singleDur = animationParams.value.duration
        const totalDur = animationParams.value.duration * launchedAnimationIds.length
        const hangTimeDur = totalDur * hangTimeFrac
        const phaseInDur = (totalDur - hangTimeDur) / 2
        const piecewisPhaseInDur = phaseInDur / launchedAnimationIds.length
        const startTime = ctx.progTime
        let elapsedTime = 0
        while (elapsedTime < totalDur) {
          const currentlyDrawingProg = elapsedTime % singleDur
          const currentlyDrawingInd = Math.floor(elapsedTime / singleDur);
          const currentlyDrawingPhase = currentlyDrawingProg / singleDur;

          const activeId = launchedAnimationIds[currentlyDrawingInd];

          drawingScene!.updateStroke(activeId, { phase: currentlyDrawingPhase });

          elapsedTime = ctx.progTime - startTime


          launchedAnimationIds.forEach((animId, ind) => {
            if (elapsedTime < phaseInDur) {

              const phaseInTime = (elapsedTime - ind * piecewisPhaseInDur) / piecewisPhaseInDur;
              const clampedPhase = Math.min(1, Math.max(0, phaseInTime)) * 0.5;
              drawingScene!.updateStroke(animId, { phase: clampedPhase });
            } else {
              const outElapsedTime = elapsedTime - (phaseInDur + hangTimeDur);
              const phaseOutTime = (outElapsedTime - ind * piecewisPhaseInDur) / piecewisPhaseInDur;
              const clampedPhase = Math.min(1, Math.max(0, phaseOutTime)) * 0.5 + 0.5;
              drawingScene!.updateStroke(animId, { phase: clampedPhase });
              // if( clampedPhase >= 1.0 && !animationParams.value.loop) {
              //   drawingScene!.cancelStroke(animId);
              // }
            }
          })

          await ctx.waitSec(0.016)
        }
        launchedAnimationIds.forEach(animId => {
          drawingScene!.cancelStroke(animId)
        })
      })

      console.log(`Launched group "${groupName.value}" with ${launchedAnimationIds.length} strokes at (${x.toFixed(1)}, ${y.toFixed(1)}) using ${animationParams.value.position} anchor`)
    } else {
      // Standard interpolated launch using new API
      if (availableStrokes.value.length < 2) {
        console.warn('Need at least 2 strokes for interpolated launch')
        return
      }

      const animationId = drawingScene.launchStrokeWithAnchor(
        x, y,
        animationParams.value.strokeA,
        animationParams.value.strokeB,
        {
          anchor: animationParams.value.position as AnchorKind,
          interpolationT: animationParams.value.interpolationT,
          duration: animationParams.value.duration,
          scale: animationParams.value.scale,
          loop: animationParams.value.loop,
          startPhase: animationParams.value.startPhase
        }
      )

      console.log(`Launched interpolated animation ${animationId} at (${x.toFixed(1)}, ${y.toFixed(1)}) ${animationParams.value.loop ? '[LOOPING]' : ''}`)
    }
  } catch (error) {
    console.warn('Failed to launch animation:', error)
  }
}

const clearLoopedAnimations = () => {
  if (!drawingScene || !gpuStrokesReady.value) return

  try {
    drawingScene.clearLoopedAnimations()
  } catch (error) {
    console.warn('Failed to clear looped animations:', error)
  }
}

// Script editor functions
const initializeScriptEditor = () => {
  if (!scriptEditorRef.value) return

  const extensions = [
    basicSetup,
    javascript(),
    oneDark,
    EditorView.theme({
      '&': {
        maxHeight: '300px',
        width: '100%'
      },
      '.cm-scroller': {
        overflow: 'auto',
        maxHeight: '300px'
      },
      '.cm-editor': {
        fontSize: '14px'
      }
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const newCode = update.state.doc.toString()
        scriptCode.value = newCode
        localStorage.setItem(SCRIPT_STORAGE_KEY, newCode)
      }
    })
  ]

  scriptEditor = new EditorView({
    doc: scriptCode.value,
    extensions,
    parent: scriptEditorRef.value
  })
}

const executeScript = () => {
  if (!drawingScene || !gpuStrokesReady.value || scriptExecuting.value) return

  scriptExecuting.value = true

  try {
    // Create launchStroke function that wraps drawingScene.launchStroke
    const launchStroke = (x: number, y: number, strokeA: number, strokeB: number, options?: any) => {
      if (!drawingScene || availableStrokes.value.length < 2) {
        console.warn('Insufficient strokes available for launching')
        return
      }

      // Validate stroke indices
      if (strokeA < 0 || strokeA >= availableStrokes.value.length ||
        strokeB < 0 || strokeB >= availableStrokes.value.length) {
        console.warn(`Invalid stroke indices: strokeA=${strokeA}, strokeB=${strokeB}. Available: 0-${availableStrokes.value.length - 1}`)
        return
      }

      try {
        return drawingScene.launchStroke(x, y, strokeA, strokeB, options)
      } catch (error) {
        console.error('Error launching stroke:', error)
      }
    }

    // Get current script code
    const code = scriptEditor?.state.doc.toString() || scriptCode.value

    // Create execution context and run script
    const scriptFunction = new Function('launchStroke', code)
    scriptFunction(launchStroke)

    console.log('Script executed successfully')
  } catch (error) {
    console.error('Script execution error:', error)
    alert(`Script Error: ${error.message}`)
  } finally {
    scriptExecuting.value = false
  }
}


// ================  freehand stuff ====================

// ================  polygon stuff ====================

// ====================  main ====================

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

    // Update cursor based on mode
    setUpdateCursor(() => {
      if (stage && konvaContainer.value) {
        konvaContainer.value.style.cursor = freehandDrawMode.value ? 'crosshair' : 'default'
      }
    })
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

    // Add metadata highlight layer on top
    const metadataHighlightLayer = createMetadataHighlight()
    stage.add(metadataHighlightLayer)

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

    // Initialize GPU Strokes
    await initializeGPUStrokes()

    // Set up the freehand data update callback
    appState.freehandDataUpdateCallback = updateGPUStrokes

    // Initialize script editor
    await nextTick() // Ensure DOM elements are ready
    initializeScriptEditor()

    // Mouse/touch event handlers
    stage.on('mousedown touchstart', (e) => {
      const pos = stage.getPointerPosition()
      if (!pos) return

      if (activeTool.value === 'freehand') {
        // Freehand tool logic
        if (freehandDrawMode.value) {
          // Drawing mode
          // if (e.target !== stage) return

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

  // Clean up GPU resources
  drawingScene?.dispose()

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
        <button @click="freehandDrawMode = !freehandDrawMode" :class="{ active: freehandDrawMode }"
          :disabled="isAnimating">
          {{ freehandDrawMode ? '✏️ Draw' : '👆 Select' }}
        </button>
        <button @click="showGrid = !showGrid" :class="{ active: showGrid }" :disabled="isAnimating">
          {{ showGrid ? '⊞ Grid On' : '⊡ Grid Off' }}
        </button>
        <span class="separator">|</span>
        <div class="button-group vertical">
        <button @click="groupSelectedStrokes" :disabled="!freehandCanGroupRef || isAnimating">
            Group
          </button>
        <button @click="ungroupSelectedStrokes" :disabled="!isFreehandGroupSelected || isAnimating">
            Ungroup
           </button>
         </div>
        <span class="separator">|</span>
        <div class="button-group vertical">
        <button @click="duplicateFreehandSelected" :disabled="freehandSelectedCount === 0 || isAnimating">
        📄 Duplicate
        </button>
        <button @click="deleteFreehandSelected" :disabled="freehandSelectedCount === 0 || isAnimating">
        🗑️ Delete
        </button>
        </div>
        <span class="separator">|</span>
        <div class="button-group vertical">
        <button @click="undoFreehand" :disabled="!canUndoFreehand || isAnimating" title="Undo (Ctrl/Cmd+Z)">
        ↶ Undo
        </button>
        <button @click="redoFreehand" :disabled="!canRedoFreehand || isAnimating" title="Redo (Ctrl/Cmd+Shift+Z)">
        ↷ Redo
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
        <div class="button-group vertical">
        <button @click="polygonUndo" :disabled="!canPolygonUndo || isAnimating" title="Undo (Ctrl/Cmd+Z)">
        ↶ Undo
        </button>
        <button @click="polygonRedo" :disabled="!canPolygonRedo || isAnimating" title="Redo (Ctrl/Cmd+Shift+Z)">
        ↷ Redo
        </button>
        </div>
        <span class="separator">|</span>
        <button @click="clearCurrentPolygon" :disabled="!isDrawingPolygon || isAnimating">
        🗑️ Cancel Shape
        </button>
        <button @click="deleteSelectedPolygon" :disabled="selectedPolygons.length === 0 || isAnimating">
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
      <span class="info">{{ freehandSelectedCount }} selected</span>
    </div>
    <div class="canvas-wrapper">
      <div ref="konvaContainer" class="konva-container" :style="{
        width: resolution.width + 'px',
        height: resolution.height + 'px',
      }"></div>

      <!-- Smart Metadata Editor -->
      <HierarchicalMetadataEditor v-if="showMetadataEditor" />

      <Timeline :strokes="freehandStrokes" :selectedStrokes="selectedStrokesForTimeline" :useRealTiming="useRealTiming"
        :maxInterStrokeDelay="maxInterStrokeDelay"
        :overrideDuration="timelineDuration > 0 ? timelineDuration : undefined" :lockWhileAnimating="setAnimatingState"
        @timeUpdate="handleTimeUpdate" />
      <div v-if="isAnimating" class="animation-lock-warning">
        ⚠️ Timeline has modified elements - press Stop to unlock
      </div>

      <!-- GPU Strokes Canvas -->
      <div class="gpu-strokes-section">
        <h3>GPU Strokes Animation</h3>
        <canvas ref="babylonContainer" class="babylon-canvas" :width="resolution.width" :height="resolution.height"
          :style="{
            width: resolution.width + 'px',
            height: resolution.height + 'px',
          }" @click="handleBabylonCanvasClick"></canvas>

        <!-- Animation Parameters -->
        <div v-if="gpuStrokesReady" class="animation-controls">
          <div class="control-row">
            <label>Stroke A:</label>
            <select v-model="animationParams.strokeA" :disabled="availableStrokes.length < 2 || launchByName">
              <option v-for="stroke in availableStrokes" :key="stroke.index" :value="stroke.index">
                {{ stroke.name }}
              </option>
            </select>
          </div>

          <div class="control-row">
            <label>Stroke B:</label>
            <select v-model="animationParams.strokeB" :disabled="availableStrokes.length < 2 || launchByName">
              <option v-for="stroke in availableStrokes" :key="stroke.index" :value="stroke.index">
                {{ stroke.name }}
              </option>
            </select>
          </div>

          <div class="control-row">
            <label>Interpolation ({{ animationParams.interpolationT.toFixed(2) }}):</label>
            <input type="range" v-model.number="animationParams.interpolationT" min="0" max="1" step="0.01"
              :disabled="launchByName" />
          </div>

          <!-- Launch by Name Controls -->
          <div class="control-row">
            <label>Launch by Group Name:</label>
            <input type="checkbox" v-model="launchByName" />
            <span class="launch-mode-hint">{{ launchByName ? 'Group launch mode' : 'Interpolation mode' }}</span>
          </div>

          <div v-if="launchByName" class="control-row">
            <label>Group Name:</label>
            <select v-model="groupName" :disabled="availableGroups.length === 0">
              <option value="">Select a group...</option>
              <option v-for="name in availableGroups" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <span class="group-hint">{{ availableGroups.length }} groups available</span>
          </div>

          <div class="control-row">
            <label>Duration:</label>
            <input type="number" v-model.number="animationParams.duration" min="0.1" max="10" step="0.1" />
            <span>seconds</span>
          </div>

          <div class="control-row">
            <label>Scale ({{ animationParams.scale.toFixed(2) }}):</label>
            <input type="range" v-model.number="animationParams.scale" min="0.1" max="3" step="0.1" />
          </div>

          <div class="control-row">
            <label>Anchor Position:</label>
            <div class="radio-group">
              <div class="anchor-section">
                <div class="anchor-category">Stroke Points:</div>
                <label><input type="radio" v-model="animationParams.position" value="start" /> Start Point</label>
                <label><input type="radio" v-model="animationParams.position" value="center" /> Center</label>
                <label><input type="radio" v-model="animationParams.position" value="end" /> End Point</label>
              </div>
              <div class="anchor-section">
                <div class="anchor-category">Bounding Box:</div>
                <label><input type="radio" v-model="animationParams.position" value="bbox-center" /> BBox Center</label>
                <label><input type="radio" v-model="animationParams.position" value="bbox-tl" /> Top Left</label>
                <label><input type="radio" v-model="animationParams.position" value="bbox-tr" /> Top Right</label>
                <label><input type="radio" v-model="animationParams.position" value="bbox-bl" /> Bottom Left</label>
                <label><input type="radio" v-model="animationParams.position" value="bbox-br" /> Bottom Right</label>
              </div>
            </div>
          </div>

          <div class="control-row">
            <label>Loop:</label>
            <input type="checkbox" v-model="animationParams.loop" />
            <span class="loop-hint">{{ animationParams.loop ? 'Animations will loop continuously' : 'Single-shot animations'}}</span>
          </div>

          <div class="control-row">
            <label>Start Phase ({{ animationParams.startPhase.toFixed(2) }}):</label>
            <input type="range" v-model.number="animationParams.startPhase" min="0" max="1" step="0.01" />
            <span class="phase-hint">{{ (animationParams.startPhase * 100).toFixed(0) }}% through animation</span>
          </div>

          <div class="control-row">
            <button @click="clearLoopedAnimations" :disabled="!gpuStrokesReady" class="clear-button">
              🗑️ Clear All Looped Animations
            </button>
            <button @click="executeScript"
              :disabled="!gpuStrokesReady || scriptExecuting || availableStrokes.length < 2" class="launch-button">
              {{ scriptExecuting ? 'Executing...' : 'Launch Script' }}
            </button>
          </div>

          <div class="info-row">
            <p v-if="launchByName && !groupName" class="warning">
              ⚠️ Select a group name to launch group animations
            </p>
            <p v-else-if="launchByName && groupName" class="info">
              ✓ Click canvas to launch group "{{ groupName }}" ({{ getGroupStrokeIndices(groupName).length }} strokes)
            </p>
            <p v-else-if="availableStrokes.length < 2" class="warning">
              ⚠️ Draw at least 2 strokes to enable interpolated animations
            </p>
            <p v-else class="info">
              ✓ Click canvas to launch interpolated animations with current settings
            </p>
          </div>
        </div>

        <div v-else class="gpu-loading">
          <p v-if="!webGPUSupported">❌ WebGPU not supported in this browser</p>
          <p v-else>🔄 Initializing GPU Strokes...</p>
        </div>
      </div>

      <!-- JavaScript Script Editor -->
      <div class="script-editor-section">
        <h3>JavaScript Scripts</h3>
        <div ref="scriptEditorRef" class="script-editor"></div>
        <div class="script-controls">
          <span class="script-info">
            {{ availableStrokes.length < 2 ? 'Need at least 2 strokes to run scripts' : `Ready to execute
              (${availableStrokes.length} strokes available)` }} </span>
        </div>
      </div>
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




/* GPU Strokes Styles */
.gpu-strokes-section {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  width: 100%;
}

.gpu-strokes-section h3 {
  margin: 0 0 15px 0;
  color: #333;
  text-align: center;
}

.babylon-canvas {
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: crosshair;
  display: block;
  margin: 0 auto 20px auto;
}

.babylon-canvas:hover {
  border-color: #0066ff;
}

.animation-controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.control-row label {
  min-width: 120px;
  font-weight: 500;
  color: #333;
}

.control-row select,
.control-row input[type="number"] {
  padding: 5px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}

.control-row input[type="range"] {
  flex: 1;
  min-width: 100px;
}

.radio-group {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}

.radio-group label {
  min-width: auto;
  font-weight: normal;
  display: flex;
  align-items: center;
  gap: 5px;
}

.anchor-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  /* background: #34495e; */
  border-radius: 6px;
  min-width: 150px;
}

.anchor-category {
  font-weight: bold;
  font-size: 12px;
  color: #bdc3c7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  border-bottom: 1px solid #4a5568;
  padding-bottom: 4px;
}

.info-row {
  text-align: center;
  margin-top: 10px;
}

.info-row .warning {
  color: #e67e22;
  font-weight: 500;
}

.info-row .info {
  color: #27ae60;
  font-weight: 500;
}

.gpu-loading {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.loop-hint,
.phase-hint,
.launch-mode-hint,
.group-hint {
  font-size: 12px;
  color: #666;
  font-style: italic;
  margin-left: 10px;
}

.launch-mode-hint {
  font-weight: 500;
  color: #0066ff;
}

.group-hint {
  color: #28a745;
}

.clear-button {
  background: #dc3545;
  color: white;
  border: 1px solid #dc3545;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.clear-button:hover:not(:disabled) {
  background: #c82333;
  border-color: #c82333;
}

.clear-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Script Editor Styles */
.script-editor-section {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 800px;
}

.script-editor-section h3 {
  margin: 0 0 15px 0;
  color: #333;
  text-align: center;
}

.script-editor {
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 15px;
}

.script-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}

.launch-button {
  background: #28a745;
  color: white;
  border: 1px solid #28a745;
  border-radius: 4px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.launch-button:hover:not(:disabled) {
  background: #218838;
  border-color: #218838;
}

.launch-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #6c757d;
  border-color: #6c757d;
}

.script-info {
  color: #666;
  font-size: 14px;
}
</style>