/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prefer-const */
import Konva from "konva"
import getStroke from "perfect-freehand"
import { type ShallowReactive, shallowReactive, ref, computed, watch } from "vue"
import type { FreehandRenderData, FlattenedStroke, FlattenedStrokeGroup } from "./canvasState"
import { executeCommand, pushCommandWithStates } from "../canvas/commands"


// Import shared utilities
import { uid, getPointsBounds, hasAncestorConflict } from './canvasUtils'
import { createStrokeItem, createGroupItem, getCanvasItem, removeCanvasItem, type CanvasItem } from './CanvasItem'
import * as selectionStore from './selectionStore'
import { freehandStrokes, freehandStrokeGroups, type CanvasRuntimeState, type FreehandStrokeRuntime, type FreehandStrokeGroupRuntime } from './canvasState'

// Konva clone behavior confirmed: recursively clones children but keeps same IDs

// Register nodes recursively in the CanvasItem registry
const registerCanvasItemsRecursively = (state: CanvasRuntimeState, node: Konva.Node) => {
  if (node instanceof Konva.Path) {
    createStrokeItem(state, node)
  } else if (node instanceof Konva.Group) {
    createGroupItem(state, node)
    node.getChildren().forEach(child => registerCanvasItemsRecursively(state, child))
  }
}

// Extracted handler attachment logic for reuse in duplication
export const attachHandlersRecursively = (state: CanvasRuntimeState, node: Konva.Node) => {
  // Shared setup for both Path and Group nodes
  if (node instanceof Konva.Path || node instanceof Konva.Group) {
    const nodeType = node instanceof Konva.Path ? 'path' : 'group'

    node.draggable(true)

    // Remove any existing handlers to avoid duplicates
    node.off('click.freehand')
    node.off('dragstart.freehand')
    node.off('dragend.freehand')

    // Selection is handled by the stage-level select tool; no node-level click handler

    node.on('dragstart.freehand', () => {
      startFreehandDragTracking(state)
    })

    node.on('dragend.freehand', () => {
      finishFreehandDragTracking(state, node.constructor.name)
      const freehandShapeLayer = state.layers.freehandShape
      freehandShapeLayer?.batchDraw()
    })

    // AV refresh events are now handled globally by stage listeners
    // (these individual listeners are no longer needed)

    // Group-specific logic: recursively attach handlers to all children
    if (node instanceof Konva.Group) {
      node.getChildren().forEach(child => {
        attachHandlersRecursively(state, child)
      })
    }
  }
}

// Simplified deep clone - Konva clones children automatically!
export const deepCloneWithNewIds = (
  state: CanvasRuntimeState,
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
      const originalStroke = Array.from(freehandStrokes(state).values())
        .find(s => s.shape === originalNode)

      if (originalStroke) {
        const newStroke: FreehandStroke = {
          ...originalStroke,
          id: newId,
          shape: node
        }
        freehandStrokes(state).set(newId, newStroke)
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
        freehandStrokeGroups(state).set(newId, {
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
  attachHandlersRecursively(state, clone)
  // Register all cloned nodes as CanvasItems
  registerCanvasItemsRecursively(state, clone)

  console.log('Successfully cloned', origNode.className, 'with new ID:', clone.id())

  return clone
}

// Main duplicate function
export const duplicateFreehandSelected = (state: CanvasRuntimeState) => {
  const selectedNodes = state.selection.selectedKonvaNodes.value
  if (selectedNodes.length === 0) {
    console.log('No items selected for duplication')
    return
  }

  console.log('Duplicating', selectedNodes.length, 'selected items')

  executeCommand(state, 'Duplicate', () => {
    // Filter to top-level nodes only (avoid ancestor/descendant conflicts)
    const topLevelNodes = selectedNodes.filter((node: Konva.Node) => {
      return !selectedNodes.some((other: Konva.Node) => other !== node && other.isAncestorOf(node))
    })

    console.log('Top-level nodes to duplicate:', topLevelNodes.length)

    const duplicatedNodes: Konva.Node[] = []

    // Clone each top-level node with 50px offset
    topLevelNodes.forEach((node, index) => {
      console.log(`Duplicating node ${index + 1}:`, node.id(), node.className)
      const duplicate = deepCloneWithNewIds(state, node, 50, 50)

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
    clearFreehandSelection(state)
    duplicatedNodes.forEach(node => freehandAddSelection(state, node))

    // Update UI and data structures
    updateFreehandDraggableStates(state)
    updateBakedFreehandData(state)
    const freehandShapeLayer = state.layers.freehandShape
    freehandShapeLayer?.batchDraw()

    console.log('Duplication complete')
  })
}

// State-based layer initialization functions  
export const initFreehandLayers = (state: CanvasRuntimeState, stage: Konva.Stage) => {
  state.layers.freehandShape = new Konva.Layer()
  state.layers.freehandDrawing = new Konva.Layer()  
  state.layers.freehandSelection = new Konva.Layer()
  
  stage.add(state.layers.freehandShape)
  stage.add(state.layers.freehandDrawing)
  stage.add(state.layers.freehandSelection)
}



// Import metadata utilities from generic module
import { type HierarchyEntry, collectHierarchyFromRoot } from './metadata'



// Helper function to get all strokes that are selected (including those in groups)
const getSelectedStrokes = (state: CanvasRuntimeState): FreehandStroke[] => {
  const selectedStrokes: FreehandStroke[] = []
  const processedStrokeIds = new Set<string>()

  state.selection.selectedKonvaNodes.value.forEach(node => {
    if (node instanceof Konva.Group) {
      // If it's a group, find all strokes in that group
      const findStrokesInGroup = (group: Konva.Group) => {
        group.getChildren().forEach(child => {
          if (child instanceof Konva.Group) {
            // Nested group
            findStrokesInGroup(child)
          } else if (child instanceof Konva.Path) {
            // Find corresponding stroke
            Array.from(freehandStrokes(state).values()).forEach(stroke => {
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
      Array.from(freehandStrokes(state).values()).forEach(stroke => {
        if (stroke.shape === node && !processedStrokeIds.has(stroke.id)) {
          selectedStrokes.push(stroke)
          processedStrokeIds.add(stroke.id)
        }
      })
    }
  })

  return selectedStrokes
}

// Selection functions - now using unified selection store
export const freehandAddSelection = (state: CanvasRuntimeState, node: Konva.Node) => {
  console.log('Adding to selection:', node.id(), node.constructor.name)
  const item = getCanvasItem(state, node)
  if (item) {
    selectionStore.add(state, item, true) // additive = true
  }
}

export const clearFreehandSelection = (state: CanvasRuntimeState) => {
  selectionStore.clear(state)
}

// Update timeline state based on current selection
export const updateTimelineState = (state: CanvasRuntimeState) => {
  const oldDuration = state.freehand.timelineDuration.value
  let newDuration = 0

  if (selectionStore.isEmpty(state)) {
    // No selection - use all strokes
    state.freehand.selectedStrokesForTimeline.value = new Set()
    state.freehand.timelineDuration.value = 0 // Timeline component will calculate total duration
  } else {
    // Selection exists - calculate selected strokes and trimmed duration
    const selectedStrokes = getSelectedStrokes(state).filter(stroke => stroke.isFreehand)

    // Update selected strokes set for timeline
    const strokeIds = new Set(selectedStrokes.map(s => s.id))
    state.freehand.selectedStrokesForTimeline.value = strokeIds

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
      state.freehand.timelineDuration.value = totalDuration
    } else {
      state.freehand.timelineDuration.value = 0
    }
  }

  // Reset playback time if it's beyond the new duration
  if (newDuration > 0 && state.freehand.currentPlaybackTime.value > newDuration) {
    state.freehand.currentPlaybackTime.value = 0
    // Trigger time update to reset visual state
    handleTimeUpdate(state, 0)
  }
}

// Legacy freehand refresh UI removed; selection/transform handled by core modules

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

// All stroke data now accessed via convenience getters from canvasState.ts

// State management functions
export const clearStrokesInState = (state: CanvasRuntimeState) => {
  state.freehand.strokes.clear()
  state.freehand.strokeGroups.clear()
}

export const setStrokeInState = (state: CanvasRuntimeState, id: string, stroke: FreehandStroke) => {
  const runtimeStroke: FreehandStrokeRuntime = {
    id: stroke.id,
    points: stroke.points,
    timestamps: stroke.timestamps,
    shape: stroke.shape,
    selected: stroke.selected,
    originalPath: stroke.originalPath,
    creationTime: stroke.creationTime,
    isFreehand: stroke.isFreehand
  }
  state.freehand.strokes.set(id, runtimeStroke)
}

export const setStrokeGroupInState = (state: CanvasRuntimeState, id: string, group: FreehandStrokeGroup) => {
  const runtimeGroup: FreehandStrokeGroupRuntime = {
    id: group.id,
    strokeIds: group.strokeIds,
    group: group.group
  }
  state.freehand.strokeGroups.set(id, runtimeGroup)
}

export const deleteStrokeFromState = (state: CanvasRuntimeState, id: string) => {
  state.freehand.strokes.delete(id)
}

// UI state refs - now accessed through global state
export const gridSize = 20
export const maxInterStrokeDelay = 300

// Track if animation is currently playing for UI locking - defined with other UI refs above



// Get current canvas state for undo/redo (freehand only)
const getCurrentFreehandState = (
  state: CanvasRuntimeState
) => {
  return selectionStore.withSelectionHighlightSuppressed(state, () => {
    const freehandShapeLayer = state.layers.freehandShape
    const stageRef = state.stage
    if (!stageRef || !freehandShapeLayer) return null

    try {
      const layerData = freehandShapeLayer.toObject()
      const strokesData = Array.from(state.freehand.strokes.entries())
      const strokeGroupsData = Array.from(state.freehand.strokeGroups.entries())

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
  })
}

export const getCurrentFreehandStateString = (
  state: CanvasRuntimeState
): string => {
  const snapshot = getCurrentFreehandState(state)
  return JSON.stringify(snapshot)
}

// Restore state from string (freehand only)
interface RestoreFreehandStateOptions {
  handleTimeUpdate?: (time: number) => void
}

export const restoreFreehandState = (
  canvasState: CanvasRuntimeState,
  stateString: string,
  options: RestoreFreehandStateOptions = {}
) => {
  if (!stateString) return

  try {
    const wasAnimating = canvasState.freehand.currentPlaybackTime.value > 0
    canvasState.freehand.currentPlaybackTime.value = 0
    canvasState.freehand.isAnimating.value = false

    deserializeFreehandState(canvasState, stateString)

    if (wasAnimating) {
      options.handleTimeUpdate?.(0)
    }
  } catch (error) {
    console.warn('Failed to restore state:', error)
  }
}


// Transform tracking for drag operations
export const startFreehandDragTracking = (state: CanvasRuntimeState) => {
  state.freehand.freehandDragStartState = getCurrentFreehandStateString(state)
}

export const finishFreehandDragTracking = (state: CanvasRuntimeState, nodeName: string) => {
  if (!state.freehand.freehandDragStartState) return

  const endState = getCurrentFreehandStateString(state)
  if (state.freehand.freehandDragStartState !== endState) {
    // Use the global command system instead of the redundant freehand-specific one
    pushCommandWithStates(
      state,
      `Transform ${nodeName}`,
      state.freehand.freehandDragStartState,
      endState
    )

    console.log(`Transform command added to global history`)
    updateBakedFreehandData(state) // Update baked data after transformation
  }

  state.freehand.freehandDragStartState = null
}

// Function to refresh stroke-shape connections
export const refreshStrokeConnections = (state: CanvasRuntimeState) => {
  const stageRef = state.stage
  if (!stageRef) return
  freehandStrokes(state).forEach((stroke, id) => {
    const currentShape = stageRef.findOne(`#${id}`) as Konva.Path
    if (currentShape && currentShape !== stroke.shape) {
      console.log('Updating stroke connection for:', id)
      stroke.shape = currentShape
    }
  })
}

// Serialization functions for hotreloading
export const serializeFreehandState = (
  canvasState: CanvasRuntimeState
) => {
  const freehandShapeLayer = canvasState.layers.freehandShape
  const stageRef = canvasState.stage
  if (!stageRef || !freehandShapeLayer) return

  try {
    const snapshot = getCurrentFreehandState(canvasState)
    if (!snapshot) return

    canvasState.freehand.serializedState = JSON.stringify(snapshot)
    canvasState.callbacks.syncAppState?.(canvasState)
    console.log('Serialized canvas state:', {
      layerChildren: snapshot.layer?.children?.length || 0,
      strokes: snapshot.strokes.length,
      strokeGroups: snapshot.strokeGroups.length
    })
  } catch (error) {
    console.warn('Failed to serialize Konva state:', error)
  }
}

// Download/Upload functionality
export const downloadFreehandDrawing = (state: CanvasRuntimeState) => {
  const stateString = getCurrentFreehandStateString(state)
  if (!stateString) {
    console.warn('No drawing data to download')
    return
  }

  const blob = new Blob([stateString], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `freehand_drawing_${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const uploadFreehandDrawing = (canvasState: CanvasRuntimeState) => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        // Validate it's valid JSON
        JSON.parse(content)

        // Set the state string and deserialize
        deserializeFreehandState(canvasState, content)
        
        console.log('Successfully loaded drawing from file:', file.name)
      } catch (error) {
        console.error('Failed to parse uploaded file:', error)
        alert('Invalid JSON file. Please upload a valid freehand drawing file.')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

export const deserializeFreehandState = (
  canvasState: CanvasRuntimeState,
  stateString: string
) => {
  const freehandShapeLayer = canvasState.layers.freehandShape
  const stageRef = canvasState.stage
  if (!stateString || !stageRef || !freehandShapeLayer) return

  try {
    const parsedState = JSON.parse(stateString)
    console.log('Deserializing canvas state:', {
      layerChildren: parsedState.layer?.children?.length || 0,
      strokes: parsedState.strokes?.length || 0,
      strokeGroups: parsedState.strokeGroups?.length || 0
    })

    freehandShapeLayer.destroyChildren()
    clearStrokesInState(canvasState)
    selectionStore.clear(canvasState)

    const layerData = parsedState.layer
    if (layerData && layerData.children) {
      console.log('Restoring', layerData.children.length, 'children')
      layerData.children.forEach((childData: any, index: number) => {
        console.log('Creating node', index, 'of type', childData.className)
        const node = Konva.Node.create(JSON.stringify(childData))
        freehandShapeLayer.add(node)
        console.log('Added node to layer:', node.id(), node.isVisible())

        attachHandlersRecursively(canvasState, node)
        registerCanvasItemsRecursively(canvasState, node)
      })
    }

    if (parsedState.strokes) {
      parsedState.strokes.forEach(([id, strokeData]: [string, any]) => {
        const shape = stageRef.findOne(`#${id}`) as Konva.Path
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
        setStrokeInState(canvasState, id, stroke)
      })
    }

    if (parsedState.strokeGroups) {
      parsedState.strokeGroups.forEach(([id, groupData]: [string, any]) => {
        const group: FreehandStrokeGroup = {
          id: groupData.id,
          strokeIds: groupData.strokeIds,
          group: stageRef.findOne(`#${id}`) as Konva.Group,
        }
        setStrokeGroupInState(canvasState, id, group)
      })
    }

    refreshStrokeConnections(canvasState)
    updateFreehandDraggableStates(canvasState)

    freehandShapeLayer.batchDraw()

    console.log('Konva canvas state restored from hotreload')

    canvasState.freehand.serializedState = stateString
    setTimeout(() => {
      freehandShapeLayer.batchDraw()
      updateBakedFreehandData(canvasState)
    }, 30)
  } catch (error) {
    console.warn('Failed to deserialize Konva state:', error)
  }
}

// Function to update draggable state based on mode and group membership
export const updateFreehandDraggableStates = (state: CanvasRuntimeState) => {
  // In the unified system, node-level dragging is disabled in Select tool because we implement
  // selection dragging at the stage level and use the Transformer for transforms.
  const freehandShapeLayer = state.layers.freehandShape

  freehandStrokes(state).forEach((stroke) => {
    if (stroke.shape) stroke.shape.draggable(false)
  })

  if (freehandShapeLayer) {
    freehandShapeLayer.getChildren().forEach((child: Konva.Node) => {
      if (child instanceof Konva.Group) child.draggable(false)
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

// getPointsBounds now imported from utils/canvasUtils

// Helper function to create a new stroke shape
export const createStrokeShape = (state: CanvasRuntimeState, points: number[], id: string): Konva.Path => {
  const freehandShapeLayer = state.layers.freehandShape
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

  // Selection is handled by stage-level select tool; no node-level click handler

  // Add drag tracking handlers
  path.on('dragstart', () => {
    startFreehandDragTracking(state)
  })

  path.on('dragend', () => {
    finishFreehandDragTracking(state, 'Stroke')
    freehandShapeLayer?.batchDraw()
  })

  // Register as CanvasItem
  createStrokeItem(state, path)

  return path
}

// Handle timeline updates and stroke animation - restored full logic
export const handleTimeUpdate = (state: CanvasRuntimeState, time: number) => {
  const freehandShapeLayer = state.layers.freehandShape
  state.freehand.currentPlaybackTime.value = time

  // Get strokes to animate and sort them
  let strokesToAnimate: FreehandStroke[] = []
  const isSelection = !selectionStore.isEmpty(state)

  if (isSelection) {
    // Get selected strokes including those in groups, but only freehand ones
    const selectedStrokes = getSelectedStrokes(state)
    strokesToAnimate = selectedStrokes.filter(stroke => stroke.isFreehand)
  } else {
    // All freehand strokes
    strokesToAnimate = Array.from(freehandStrokes(state).values()).filter(stroke => stroke.isFreehand)
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
      freehandStrokes(state).forEach(stroke => {
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
    freehandStrokes(state).forEach(stroke => {
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
        if (!state.freehand.useRealTiming.value && gap > maxInterStrokeDelay) {
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
const generateBakedStrokeData = (
  canvasState: CanvasRuntimeState
): { data: FreehandRenderData, groupMap: Record<string, number[]> } => {
  const freehandShapeLayer = canvasState.layers.freehandShape
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
      const stroke = Array.from(canvasState.freehand.strokes.values()).find(s => s.shape === node)
      if (!stroke) return null

      const transformedPoints = transformPoints(stroke.points, node)
      const flattenedPoints = transformedPoints.map((point, index) => ({
        x: point.x,
        y: point.y,
        ts: stroke.timestamps[Math.floor(index / 2)] || 0 // Match timestamp to point pair
      }))

      // Extract metadata from the Konva node
      const metadata = node.getAttr('metadata')

      // If stroke metadata has a "name", add it to the group map as a group with 1 stroke
      if (metadata && metadata.name && typeof metadata.name === 'string') {
        if (!groupMap[metadata.name]) {
          groupMap[metadata.name] = []
        }
        groupMap[metadata.name].push(strokeIndex)
      }

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

        //sort groupStrokeIndices according to the "order" metadata on the children strokes (filling missing orders with Infinity)
        // const childOrders = children.map(child => child.metadata?.order ?? Infinity)


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
export const updateBakedFreehandData = (
  canvasState: CanvasRuntimeState
) => {
  const result = generateBakedStrokeData(canvasState)
  canvasState.freehand.bakedRenderData = result.data
  canvasState.freehand.bakedGroupMap = result.groupMap
  canvasState.callbacks.syncAppState?.(canvasState)
}

// Hierarchy utilities are now accessed directly from the metadata module

export const collectHierarchy = (state: CanvasRuntimeState): HierarchyEntry[] => {
  const freehandShapeLayer = state.layers.freehandShape
  if (!freehandShapeLayer) return []
  return collectHierarchyFromRoot(freehandShapeLayer.getChildren())
}

// Cursor update function (will be defined in onMounted)
export let updateCursor: (() => void) | undefined
export const setUpdateCursor = (uc: (() => void)) => updateCursor = uc
