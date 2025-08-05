/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
import Konva from "konva"
import getStroke from "perfect-freehand"
import { type ShallowReactive, shallowReactive, ref, computed, watch } from "vue"
import type { FreehandRenderData, FlattenedStroke, FlattenedStrokeGroup, TemplateAppState } from "./appState"
import { globalStore, stage, selected } from "./appState"

const store = globalStore()
const appState = store.appStateRef

// Utility functions for duplication
const uid = (prefix = 'id_') => `${prefix}${crypto.randomUUID()}`

// Konva clone behavior confirmed: recursively clones children but keeps same IDs

// Extracted handler attachment logic for reuse in duplication
export const attachHandlersRecursively = (node: Konva.Node) => {
  // Shared setup for both Path and Group nodes
  if (node instanceof Konva.Path || node instanceof Konva.Group) {
    const nodeType = node instanceof Konva.Path ? 'path' : 'group'

    node.draggable(true)

    // Remove any existing handlers to avoid duplicates
    node.off('click.freehand')
    node.off('dragstart.freehand')
    node.off('dragend.freehand')

    node.on('click.freehand', (e) => {
      e.cancelBubble = true
      handleClick(node, e.evt.shiftKey)
    })

    node.on('dragstart.freehand', () => {
      startFreehandDragTracking()
    })

    node.on('dragend.freehand', () => {
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

// Simplified deep clone - Konva clones children automatically!
const deepCloneWithNewIds = (
  origNode: Konva.Node,
  offsetX: number = 0,
  offsetY: number = 0
): Konva.Node => {

  // Konva's clone automatically handles children recursively
  const clone = origNode.clone({
    x: origNode.x() + offsetX,
    y: origNode.y() + offsetY
  })

  // Recursively update IDs for the entire tree
  const updateIdsRecursively = (node: Konva.Node, originalNode: Konva.Node) => {
    // Generate new unique ID
    const newId = uid()
    node.id(newId)

    // Update data structures
    if (node instanceof Konva.Path) {
      const originalStroke = Array.from(freehandStrokes.values())
        .find(s => s.shape === originalNode)

      if (originalStroke) {
        const newStroke: FreehandStroke = {
          ...originalStroke,
          id: newId,
          shape: node
        }
        freehandStrokes.set(newId, newStroke)
        console.log('Created stroke data for cloned Path:', newId)
      }
    } else if (node instanceof Konva.Group) {
      // Update children first, then create group data
      const originalGroup = originalNode as Konva.Group
      const clonedGroup = node as Konva.Group

      clonedGroup.getChildren().forEach((child, index) => {
        const originalChild = originalGroup.getChildren()[index]
        updateIdsRecursively(child, originalChild)
      })

      // Create group data structure
      const strokeIds = clonedGroup.find('Path').map(p => p.id())
      if (strokeIds.length > 0) {
        freehandStrokeGroups.set(newId, {
          id: newId,
          strokeIds,
          group: clonedGroup
        })
        console.log('Created group data for cloned Group:', newId, 'with strokes:', strokeIds)
      }
    }
  }

  // Update IDs and data structures for the entire cloned tree
  updateIdsRecursively(clone, origNode)

  // Attach event handlers to all nodes in the cloned tree
  attachHandlersRecursively(clone)

  console.log('Successfully cloned', origNode.className, 'with new ID:', clone.id())

  return clone
}

// Main duplicate function
export const duplicateFreehandSelected = () => {
  if (selected.length === 0) {
    console.log('No items selected for duplication')
    return
  }

  console.log('Duplicating', selected.length, 'selected items')

  executeFreehandCommand('Duplicate', () => {
    // Filter to top-level nodes only (avoid ancestor/descendant conflicts)
    const topLevelNodes = selected.filter(node => {
      return !selected.some(other => other !== node && other.isAncestorOf(node))
    })

    console.log('Top-level nodes to duplicate:', topLevelNodes.length)

    const duplicatedNodes: Konva.Node[] = []

    // Clone each top-level node with 50px offset
    topLevelNodes.forEach((node, index) => {
      console.log(`Duplicating node ${index + 1}:`, node.id(), node.className)
      const duplicate = deepCloneWithNewIds(node, 50, 50)

      // Add to the same parent as original
      const parent = node.getParent()
      if (parent) {
        parent.add(duplicate)
        console.log('Added duplicate to parent:', parent.className)
      }

      duplicatedNodes.push(duplicate)
    })

    console.log('Created', duplicatedNodes.length, 'duplicates')

    // Update selection to newly created duplicates
    clearFreehandSelection()
    duplicatedNodes.forEach(node => freehandAddSelection(node))

    // Update UI and data structures
    updateFreehandDraggableStates()
    updateBakedStrokeData()
    freehandShapeLayer?.batchDraw()

    console.log('Duplication complete')
  })
}

export let freehandShapeLayer: Konva.Layer | undefined = undefined
export const setFreehandShapeLayer = (ls: Konva.Layer) => freehandShapeLayer = ls
export let freehandDrawingLayer: Konva.Layer | undefined = undefined
export const setFreehandDrawingLayer = (dl: Konva.Layer) => freehandDrawingLayer = dl
export let freehandSelectionLayer: Konva.Layer | undefined = undefined
export const setFreehandSelectionLayer = (sl: Konva.Layer) => freehandSelectionLayer = sl

// Highlight layer for metadata editing
export let metadataHighlightLayer: Konva.Layer | undefined = undefined
export let metadataHighlightRect: Konva.Rect | undefined = undefined

export const createMetadataHighlight = () => {
  metadataHighlightLayer = new Konva.Layer({ listening: false })
  metadataHighlightRect = new Konva.Rect({
    stroke: 'red',
    strokeWidth: 2,
    dash: [4, 4],
    listening: false,
    visible: false
  })
  metadataHighlightLayer.add(metadataHighlightRect)
  return metadataHighlightLayer
}

export const updateMetadataHighlight = (node?: Konva.Node) => {
  if (!metadataHighlightRect || !metadataHighlightLayer) return

  if (!node) {
    metadataHighlightRect.visible(false)
    metadataHighlightLayer.batchDraw()
    return
  }

  const bbox = node.getClientRect({ relativeTo: node.getStage() })
  metadataHighlightRect.setAttrs({
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    visible: true
  })
  metadataHighlightLayer.batchDraw()
}

// Drawing state
export let isDrawing = false
export const setIsDrawing = (id: boolean) => isDrawing = id
export let currentPoints: number[] = []
export const setCurrentPoints = (pts: number[]) => currentPoints = pts
export let currentTimestamps: number[] = []
export const setCurrentTimestamps = (ts: number[]) => currentTimestamps = ts
export let drawingStartTime = 0
export const setDrawingStartTime = (ts: number) => drawingStartTime = ts


// Transform controls - for freehand
export let selTr: Konva.Transformer | undefined = undefined
export const setSelTr = (tr: Konva.Transformer) => selTr = tr
export let grpTr: Konva.Transformer | undefined = undefined
export const setGrpTr = (tr: Konva.Transformer) => grpTr = tr

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
export const freehandAddSelection = (node: Konva.Node) => {
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

export const clearFreehandSelection = () => {
  selected.length = 0
  freehandRefreshUI()
}

// Update timeline state based on current selection
export const updateTimelineState = () => {
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
export interface FreehandStroke {
  id: string
  points: number[]
  timestamps: number[]
  shape?: Konva.Path
  selected?: boolean
  originalPath?: string // Store original path data for animation
  creationTime: number // Absolute time when stroke was created
  isFreehand: boolean // Track if this is a freehand stroke with timing info
}

export interface FreehandStrokeGroup {
  id: string
  strokeIds: string[]
  group?: Konva.Group
}

export const freehandStrokes = new Map<string, FreehandStroke>()
export const freehandStrokeGroups = new Map<string, FreehandStrokeGroup>()

// Separate refs for UI state for freehand
export const freehandSelectedCount = ref(0)
export const isFreehandGroupSelected = ref(false)
export const freehandCanGroupRef = ref(false)
export const selectedStrokesForTimeline = ref(new Set<string>())
export const timelineDuration = ref(0)
export const showGrid = ref(false)
export const gridSize = 20
export const currentPlaybackTime = ref(0)
export const freehandDrawMode = ref(true) // true = draw mode, false = select mode
export const useRealTiming = ref(false) // false = use max threshold, true = use actual timing
export const maxInterStrokeDelay = 300 // 0.3 seconds max gap between strokes

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
const setIsUndoRedoOperation = (isUndoRedo: boolean) => isUndoRedoOperation = isUndoRedo

// Track if animation is currently playing for UI locking
export const isAnimating = ref(false)



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
export const executeFreehandCommand = (commandName: string, action: () => void) => {
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
export const canUndoFreehand = computed(() => freehandHistoryIndex.value >= 0)
export const canRedoFreehand = computed(() => freehandHistoryIndex.value < freehandCommandHistory.value.length - 1)

export const undoFreehand = () => {
  if (!canUndoFreehand.value) return

  const command = freehandCommandHistory.value[freehandHistoryIndex.value]
  console.log(`Undoing command: ${command.name}`)

  restoreFreehandState(command.beforeState)
  freehandHistoryIndex.value--
}

export const redoFreehand = () => {
  if (!canRedoFreehand.value) return

  freehandHistoryIndex.value++
  const command = freehandCommandHistory.value[freehandHistoryIndex.value]
  console.log(`Redoing command: ${command.name}`)

  restoreFreehandState(command.afterState)
}

// Transform tracking for drag operations
let freehandDragStartState: string | null = null
const setFreehandDragStartState = (state: string | null) => freehandDragStartState = state

export const startFreehandDragTracking = () => {
  freehandDragStartState = getCurrentFreehandStateString()
}

export const finishFreehandDragTracking = (nodeName: string) => {
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
    updateBakedStrokeData() // Update baked data after transformation
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
export const serializeFreehandState = () => {
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

export const deserializeFreehandState = () => {
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

    // Use the extracted handler attachment logic

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
      updateBakedStrokeData() // Update baked data after deserialization
    }, 30)
  } catch (error) {
    console.warn('Failed to deserialize Konva state:', error)
  }
}

// Function to update draggable state based on mode and group membership
export const updateFreehandDraggableStates = () => {
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
export const getStrokePath = (points: number[], normalize: boolean = false): string => {
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

export const getPointsBounds = (points: number[]): { minX: number, minY: number, maxX: number, maxY: number } => {
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
export const createStrokeShape = (points: number[], id: string): Konva.Path => {
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
export const handleClick = (target: Konva.Node, shiftKey: boolean) => {
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
export const groupSelectedStrokes = () => {
  if (selected.length < 2) return

  executeFreehandCommand('Group Strokes', () => {
    // compute common parent to insert new group into (layer by default)
    let commonParent = selected[0].getParent()
    for (const n of selected) if (n.getParent() !== commonParent) { commonParent = freehandShapeLayer; break }

    const superGroup = new Konva.Group({ draggable: true })
    commonParent?.add(superGroup)

    // Add drag tracking handlers to the group
    superGroup.on('dragstart', () => {
      startFreehandDragTracking()
    })

    superGroup.on('dragend', () => {
      finishFreehandDragTracking('Group')
    })

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
    updateBakedStrokeData() // Update baked data after grouping
  })
}

// Ungroup selected groups - simplified from working example
export const ungroupSelectedStrokes = () => {
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
    updateBakedStrokeData() // Update baked data after ungrouping
  })
}

// Delete selected freehand strokes/groups
export const deleteFreehandSelected = () => {
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
    updateBakedStrokeData() // Update baked data after deletion
  })
}

// Handle timeline updates and stroke animation - restored full logic
export const handleTimeUpdate = (time: number) => {
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
  const strokeTimings: Array<{ stroke: FreehandStroke, startTime: number, endTime: number }> = []

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
  strokeTimings.forEach(({ stroke, startTime, endTime }) => {
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


// Function to generate baked stroke data for external rendering (p5, three.js, etc.)
const generateBakedStrokeData = (): { data: FreehandRenderData, groupMap: Record<string, number[]> } => {
  if (!freehandShapeLayer) return { data: [], groupMap: {} }

  // Helper function to transform points using world transform
  // Replicates the full normalization flow: raw coords → normalized → transformed
  const transformPoints = (points: number[], node: Konva.Node): { x: number, y: number }[] => {
    // Step 1: Get bounds from raw world coordinates (same as stroke creation)
    const bounds = getPointsBounds(points)

    // Step 2: Create normalized points (same as createStrokeShape)
    const normalizedPoints: number[] = []
    for (let i = 0; i < points.length; i += 2) {
      normalizedPoints.push(points[i] - bounds.minX)
      normalizedPoints.push(points[i + 1] - bounds.minY)
    }

    // Step 3: Apply full absolute transform to normalized coordinates
    // (This is what Konva does internally when rendering)
    const transform = node.getAbsoluteTransform()
    const transformedPoints: { x: number, y: number }[] = []

    for (let i = 0; i < normalizedPoints.length; i += 2) {
      const point = transform.point({ x: normalizedPoints[i], y: normalizedPoints[i + 1] })
      transformedPoints.push({ x: point.x, y: point.y })
    }

    return transformedPoints
  }

  // Track stroke indices and group map
  let strokeIndex = 0
  const groupMap: Record<string, number[]> = {}

  // Helper function to process a Konva node recursively
  const processNode = (node: Konva.Node): FlattenedStroke | FlattenedStrokeGroup | null => {
    if (node instanceof Konva.Path) {
      // Find the corresponding stroke data
      const stroke = Array.from(freehandStrokes.values()).find(s => s.shape === node)
      if (!stroke) return null

      const transformedPoints = transformPoints(stroke.points, node)
      const flattenedPoints = transformedPoints.map((point, index) => ({
        x: point.x,
        y: point.y,
        ts: stroke.timestamps[Math.floor(index / 2)] || 0 // Match timestamp to point pair
      }))

      // Extract metadata from the Konva node
      const metadata = node.getAttr('metadata')

      // Increment stroke index for this concrete stroke
      const currentStrokeIndex = strokeIndex++

      return {
        points: flattenedPoints,
        ...(metadata && { metadata }) // Only include metadata if it exists
      } as FlattenedStroke
    } else if (node instanceof Konva.Group) {
      // Track stroke indices for this group
      const groupStartIndex = strokeIndex

      // Process group children recursively
      const children: (FlattenedStroke | FlattenedStrokeGroup)[] = []

      node.getChildren().forEach(child => {
        const processed = processNode(child)
        if (processed) {
          children.push(processed)
        }
      })

      if (children.length === 0) return null

      // Extract metadata from the group node
      const metadata = node.getAttr('metadata')

      // If this group has a "name" in metadata, record its stroke indices
      if (metadata && metadata.name && typeof metadata.name === 'string') {
        const groupStrokeIndices: number[] = []
        for (let i = groupStartIndex; i < strokeIndex; i++) {
          groupStrokeIndices.push(i)
        }
        groupMap[metadata.name] = groupStrokeIndices
      }

      return {
        children,
        ...(metadata && { metadata }) // Only include metadata if it exists
      } as FlattenedStrokeGroup
    }

    return null
  }

  // Collect all processed strokes/groups
  const strokeGroups: FlattenedStrokeGroup[] = []

  freehandShapeLayer.getChildren().forEach(child => {
    const processed = processNode(child)
    if (processed) {
      if ('points' in processed) {
        // Single stroke - wrap in a group
        strokeGroups.push({ children: [processed] })
      } else {
        // Already a group
        strokeGroups.push(processed)
      }
    }
  })

  // Return both data and group map
  return { data: strokeGroups, groupMap }
}

// Function to update baked data in app state
export const updateBakedStrokeData = () => {
  const result = generateBakedStrokeData()
  appState.freehandRenderData = result.data
  appState.freehandGroupMap = result.groupMap
  appState.freehandDataUpdateCallback?.()
}

// Utility function to get stroke indices for a named group
export const getGroupStrokeIndices = (groupName: string): number[] => {
  return appState.freehandGroupMap[groupName] || []
}

// Undoable metadata mutator for nodes
export const setNodeMetadata = (
  node: Konva.Node,
  meta: Record<string, any> | undefined
) => {
  executeFreehandCommand('Edit Metadata', () => {
    if (meta === undefined || Object.keys(meta).length === 0) {
      node.setAttr('metadata', undefined)   // keep export slim
    } else {
      node.setAttr('metadata', meta)
    }
    updateBakedStrokeData()                 // keep render-data in sync
  })
}

// Hierarchy utility for metadata editing
export interface HierarchyEntry {
  node: Konva.Node        // actual Konva node
  depth: number           // depth == indent level (50px each)
  indexPath: string       // e.g. "0/3/1" – handy for v-key
}

export const collectHierarchyFromRoot = (rootNodes: Konva.Node[]): HierarchyEntry[] => {
  const out: HierarchyEntry[] = []

  const walk = (node: Konva.Node, depth = 0, path = '') => {
    out.push({ node, depth, indexPath: path })

    if (node instanceof Konva.Group) {
      node.getChildren().forEach((child, i) =>
        walk(child, depth + 1, path ? `${path}/${i}` : `${i}`)
      )
    }
  }

  rootNodes.forEach((node, i) => walk(node, 0, `${i}`))
  return out
}

export const collectHierarchy = (): HierarchyEntry[] => {
  if (!freehandShapeLayer) return []
  return collectHierarchyFromRoot(freehandShapeLayer.getChildren())
}

// Cursor update function (will be defined in onMounted)
export let updateCursor: (() => void) | undefined
export const setUpdateCursor = (uc: (() => void)) => updateCursor = uc

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