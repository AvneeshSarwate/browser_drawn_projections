# Canvas Unification Refactor Proposal

## Overview
Transform the current "two-apps-in-one" architecture into a unified canvas drawing application with three tool modes: **Select**, **Freehand**, and **Polygon**. This refactor eliminates duplication while maintaining existing functionality and preparing for future tool additions.

## Current State Analysis
The app currently operates as two separate tools sharing the same rendering canvas:
- **Freehand Tool**: Perfect-freehand strokes with grouping, selection, transformation, and timing data
- **Polygon Tool**: Point-by-point polygon creation with vertex editing via control points
- **Duplicated Systems**: Separate undo/redo, selection management, transformation logic, and command systems

## Target Architecture

### Three Tool Modes
1. **Select Mode**: Universal selection, multi-select, drag-select, transformation, metadata editing
2. **Freehand Mode**: Draw freehand strokes + explicit grouping (existing functionality)  
3. **Polygon Mode**: Two sub-modes:
   - **Draw**: Point-by-point polygon creation (escape to complete)
   - **Edit**: Vertex manipulation via control points

### Core Design Principles
- **Surgical Changes**: Minimal new abstractions, mostly code consolidation
- **Shared Infrastructure**: Selection, transformation, metadata, undo/redo, file I/O
- **Preserved Constraints**: Grouping remains freehand-only, vertex editing preserved
- **Backward Compatibility**: Hot-reload and file formats remain unchanged

## Simple Implementation Approach

Rather than one big refactor, break this into 6 logical, testable pieces:

### 1. **Unified Command System**
- Single `executeCommand` function replacing both tool-specific undo systems
- Replace all calls to `executeFreehandCommand`/`executePolygonCommand` with unified `executeCommand`
- Delete the two legacy wrapper functions entirely
- All operations use same command stack and render refresh
- Test: Draw stroke, draw polygon, undo both via same system

### 2. **Unify Selection + Metadata** (wiring existing systems together)
- Create single selection store that works with both freehand and polygon shapes
- Make metadata editor work with polygon selections (currently missing)
- Selection changes automatically captured by unified undo system
- **Grouping constraint**: If selection contains any polygon, disable grouping UI (polygons cannot be grouped)
- Test: Select polygons, edit metadata, selection highlighting works for both tools

### 3. **Add Polygon Transformation** (new functionality)
- Make polygons transformable as unified objects (doesn't exist yet)
- Figure out interaction between whole-polygon transforms and individual vertex editing
- Add transformer support for mixed selections (polygons + freehand)
- Test: Select mixed shapes, transform together, vertex editing still works

### 4. **Add Unified Drag Selection** (nice improvement)
- Drag-select works across both shape types
- Replace freehand-only rectangle selection  
- Test: Drag-select mixed shapes, shift-add selection

### 5. **Consolidate UI** (visual/UX changes)
- Single toolbar with context-aware buttons  
- Remove duplicate controls
- Test: Tool switching, all buttons work, visual consistency

### 6. **Clean Up & Polish** (final cleanup)
- Remove old code paths and duplicated functions
- Ensure GPU/visualization updates work consistently
- Test: Full regression - everything still works

---

## Original Detailed Plan (Reference)

### Phase 1: Foundation (Steps 1-3)
**Goal**: Extract shared utilities and create unified selection system

#### 1.1 Extract Utilities (`utils/canvasUtils.ts`)
```typescript
// Shared utilities from both tools
export const uid = (prefix = 'id_') => `${prefix}${crypto.randomUUID()}`
export const getPointsBounds = (points: number[]) => { /* existing logic */ }
export const hasAncestorConflict = (nodes: Konva.Node[]): boolean => { /* existing logic */ }
```

#### 1.2 Create CanvasItem Abstraction (`core/CanvasItem.ts`)
```typescript
interface CanvasItem {
  id: string
  type: 'stroke' | 'strokeGroup' | 'polygon'
  konvaNode: Konva.Node
  getBounds(): { minX: number, maxX: number, minY: number, maxY: number }
  getMetadata(): Record<string, any> | undefined
  setMetadata(meta: Record<string, any> | undefined): void
}

// Factory functions
export const fromStroke = (shape: Konva.Path): CanvasItem => { /* ... */ }
export const fromGroup = (group: Konva.Group): CanvasItem => { /* ... */ }  
export const fromPolygon = (line: Konva.Line): CanvasItem => { /* ... */ }
```

#### 1.3 Unified Selection Store (`core/selectionStore.ts`)
```typescript
export const selected = shallowReactive<Set<CanvasItem>>(new Set())

// Compatibility shim for existing code during migration
export const legacySelected = shallowReactive<Konva.Node[]>([])

export function add(item: CanvasItem, additive = false) {
  if (!additive) clear()
  selected.add(item)
  applyHighlight()
  updateGPUAndVisualization() // Critical: trigger render updates
}

export function toggle(item: CanvasItem) {
  selected.has(item) ? selected.delete(item) : selected.add(item)
  applyHighlight()
  updateGPUAndVisualization()
}

export function clear() { 
  selected.clear() 
  applyHighlight()
  updateGPUAndVisualization()
}

// Maintain sync with legacy array during migration
watch(selected, () => {
  legacySelected.length = 0
  legacySelected.push(...[...selected].map(item => item.konvaNode))
})

// For feeding the transformer
export const selectedKonvaNodes = computed(() => 
  [...selected].map(item => item.konvaNode)
)

export const getActiveSingleNode = () => 
  selected.size === 1 ? [...selected][0].konvaNode : null

const updateGPUAndVisualization = () => {
  // Trigger all dependent systems
  updateBakedStrokeData()
  updateGPUStrokes()
  refreshAVs?.()
}
```

#### 1.4 Unified Metadata Handling (`core/metadataManager.ts`)
```typescript
// Tool-specific metadata toolkit interface
interface MetadataToolkit {
  setNodeMetadata(node: Konva.Node, metadata: any): void
}

// Freehand metadata toolkit (uses existing setNodeMetadata from freehandTool.ts)
export const freehandMetadataToolkit: MetadataToolkit = {
  setNodeMetadata: (node: Konva.Node, meta: any) => {
    executeCommand('Edit Metadata', () => {
      if (meta === undefined || Object.keys(meta).length === 0) {
        node.setAttr('metadata', undefined)
      } else {
        node.setAttr('metadata', meta)
      }
      updateBakedStrokeData()     // Keep render data in sync
      refreshAVs?.()              // Refresh ancillary visualizations
    })
  }
}

// New polygon metadata toolkit (currently missing)
export const polygonMetadataToolkit: MetadataToolkit = {
  setNodeMetadata: (node: Konva.Node, meta: any) => {
    executeCommand('Edit Metadata', () => {
      if (meta === undefined || Object.keys(meta).length === 0) {
        node.setAttr('metadata', undefined)
      } else {
        node.setAttr('metadata', meta)
      }
      updateBakedPolygonData()    // Keep render data in sync
      refreshAVs?.()              // Refresh ancillary visualizations
    })
  }
}

// Unified factory function
export const getMetadataToolkit = (tool: ToolType): MetadataToolkit => {
  switch (tool) {
    case 'freehand': return freehandMetadataToolkit
    case 'polygon': return polygonMetadataToolkit
    default: return freehandMetadataToolkit // fallback
  }
}
```

#### 1.5 Updated LivecodeHolder.vue Metadata Handling
```typescript
// Replace the current applyMetadata and handleApplyMetadata functions
const applyMetadata = (metadata: any) => {
  if (!activeNode.value) return
  
  // Use unified toolkit approach - no more if/else branching
  const toolkit = getMetadataToolkit(activeTool.value)
  toolkit.setNodeMetadata(activeNode.value, metadata)
}

// Remove these functions entirely:
// - Current applyMetadata with polygon-specific branch
// - handleApplyMetadata with separate freehand/polygon paths
// - All console.log('Polygon metadata updated') branches

// The toolkit approach ensures consistent behavior:
// ✓ Metadata changes go through appropriate command system (undo/redo)
// ✓ Render data updates automatically (updateBakedStrokeData/updateBakedPolygonData)
// ✓ Ancillary visualizations refresh (refreshAVs)
// ✓ No tool-specific branching in UI code
```

### Phase 2: Transformation & Commands (Steps 4-5)
**Goal**: Single transformer and unified undo/redo system

#### 2.1 Transformer Manager (`core/transformerManager.ts`)
```typescript
let transformer: Konva.Transformer | undefined

export const initializeTransformer = (selectionLayer: Konva.Layer) => {
  transformer = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: true,
    padding: 6
  })
  
  // Transform tracking for undo/redo
  transformer.on('transformstart', startDragTracking)
  transformer.on('transformend', () => finishDragTracking('Transform'))
  
  selectionLayer.add(transformer)
}

// Watch selection changes and update transformer targets
watch(selectedKonvaNodes, (nodes) => {
  // Filter to top-level nodes to avoid ancestor conflicts
  const topLevelNodes = nodes.filter(node => 
    !nodes.some(other => other !== node && other.isAncestorOf(node))
  )
  
  // Apply freehand pivot locking for groups (preserve existing rotation behavior)
  topLevelNodes.forEach(node => {
    if (node instanceof Konva.Group) {
      freehandLockPivot(node) // Maintain existing group transform logic
    }
  })
  
  transformer?.nodes(topLevelNodes)
})
```

#### 2.2 Unified Command Stack (`core/commandStack.ts`)
```typescript
interface Command {
  name: string
  beforeState: string
  afterState: string
}

const history: Command[] = []
let historyIndex = -1
let inUndoRedo = false

const captureState = () => JSON.stringify({
  freehand: freehandShapeLayer?.toObject(),
  polygon: polygonShapesLayer?.toObject(),
  freehandStrokes: Array.from(freehandStrokes.entries()),
  freehandStrokeGroups: Array.from(freehandStrokeGroups.entries()), // Critical: preserve grouping
  polygonShapes: Array.from(polygonShapes.entries()),
  polygonGroups: Array.from(polygonGroups.entries()) // Future-proofing even if UI disabled
})

export const pushCommand = (name: string, action: () => void) => {
  if (inUndoRedo) { action(); return }
  
  const beforeState = captureState()
  action()
  const afterState = captureState()
  
  if (beforeState === afterState) return
  
  // Truncate history after current index and add new command
  history.splice(historyIndex + 1)
  history.push({ name, beforeState, afterState })
  historyIndex = history.length - 1
  
  // Limit history size
  if (history.length > 50) {
    history.shift()
    historyIndex = history.length - 1
  }
}

export const undo = () => {
  if (historyIndex < 0) return
  inUndoRedo = true
  restoreState(history[historyIndex].beforeState)
  historyIndex--
  inUndoRedo = false
}

export const redo = () => {
  if (historyIndex >= history.length - 1) return
  inUndoRedo = true
  historyIndex++
  restoreState(history[historyIndex].afterState)
  inUndoRedo = false
}

// Note: executeFreehandCommand and executePolygonCommand wrappers are deleted
// All code now uses executeCommand directly
```

### Phase 3: Tool System (Steps 6-7)
**Goal**: Unified tool interface and drag selection

#### 3.1 Tool Manager (`core/toolManager.ts`)
```typescript
export type ToolType = 'select' | 'freehand' | 'polygon'
export type PolygonSubMode = 'draw' | 'edit'

interface CanvasTool {
  onPointerDown(e: Konva.KonvaEventObject<any>): void
  onPointerMove(e: Konva.KonvaEventObject<any>): void  
  onPointerUp(e: Konva.KonvaEventObject<any>): void
  cancel?(): void // ESC key support
}

export const activeTool = ref<ToolType>('select')
export const polygonSubMode = ref<PolygonSubMode>('draw')

const tools = new Map<ToolType, CanvasTool>()

export const registerTool = (type: ToolType, tool: CanvasTool) => {
  tools.set(type, tool)
}

export const getCurrentTool = () => tools.get(activeTool.value)

export const switchTool = (newTool: ToolType) => {
  // Cancel current tool if applicable  
  getCurrentTool()?.cancel?.()
  activeTool.value = newTool
  
  // Clear selections when switching tools
  clear()
  
  // Update layer listening states
  updateLayerListening()
}
```

#### 3.2 Universal Drag Selection (`core/dragSelect.ts`)
```typescript
export const dragSelectionState = ref({
  isSelecting: false,
  startPos: { x: 0, y: 0 },
  currentPos: { x: 0, y: 0 }
})

export const startDragSelection = (pos: { x: number, y: number }, isShiftHeld: boolean) => {
  dragSelectionState.value = {
    isSelecting: true,
    startPos: pos,
    currentPos: pos
  }
  
  if (!isShiftHeld) {
    clear() // Clear existing selection
  }
  
  showSelectionRect(pos)
}

export const completeDragSelection = (isShiftHeld: boolean) => {
  const { startPos, currentPos } = dragSelectionState.value
  
  // Check if this was actually a drag vs just a click
  const wasDragged = Math.abs(currentPos.x - startPos.x) >= 5 || 
                     Math.abs(currentPos.y - startPos.y) >= 5
  
  if (wasDragged) {
    // Find intersecting nodes from both layers (exclude control points)
    const rectBox = getSelectionRectBounds()
    const intersecting: CanvasItem[] = []
    
    // Check freehand shapes
    freehandShapeLayer?.getChildren().forEach(node => {
      if (intersectsRect(node.getClientRect(), rectBox)) {
        const item = node instanceof Konva.Group ? fromGroup(node) : fromStroke(node)
        intersecting.push(item)
      }
    })
    
    // Check polygon shapes (exclude control points layer)
    polygonShapesLayer?.getChildren().forEach(node => {
      if (node instanceof Konva.Line && intersectsRect(node.getClientRect(), rectBox)) {
        intersecting.push(fromPolygon(node))
      }
    })
    
    // Add to selection
    intersecting.forEach(item => add(item, true))
  }
  
  hideSelectionRect()
  dragSelectionState.value.isSelecting = false
}
```

### Phase 4: Tool Refactoring (Steps 8-9)
**Goal**: Adapt existing tools to use shared infrastructure

#### 4.1 Select Tool (`tools/selectTool.ts`)
```typescript
export const selectTool: CanvasTool = {
  onPointerDown(e) {
    const pos = getStagePosition(e)
    const target = e.target
    
    if (target === stage) {
      // Start drag selection on empty canvas
      startDragSelection(pos, e.evt.shiftKey)
    } else {
      // Handle node selection
      const item = getCanvasItemFromKonvaNode(target)
      if (item) {
        e.evt.shiftKey ? toggle(item) : add(item)
      }
    }
  },
  
  onPointerMove(e) {
    if (dragSelectionState.value.isSelecting) {
      updateDragSelection(getStagePosition(e))
    }
  },
  
  onPointerUp(e) {
    if (dragSelectionState.value.isSelecting) {
      completeDragSelection(e.evt.shiftKey)
    }
  }
}
```

#### 4.2 Freehand Tool Updates
- Remove `selected` array, use `selectionStore` 
- Remove `selTr`/`grpTr`, use `transformerManager`
- Replace `executeFreehandCommand` calls with unified `executeCommand`
- Keep existing grouping logic but check `item.type === 'stroke'`

#### 4.3 Polygon Tool Updates  
- Remove `selectedPolygons` array and `polygonOriginalStyles`
- Use `selectionStore` for selection highlighting
- Remove separate undo/redo, use unified system
- Keep vertex editing in edit sub-mode

### Phase 5: UI & Integration (Steps 10-11)
**Goal**: Consolidate UI and complete integration

#### 5.1 Unified Control Panel Design
The current LivecodeHolder has fragmented UI with tool-specific sections. The unified design consolidates this into logical groups:

**New Control Panel Structure:**
```vue
<template>
  <div class="handwriting-animator-container">
    <!-- Unified Control Panel -->
    <div class="control-panel">
      <!-- Tool Selection -->
      <div class="tool-section">
        <label>Tool:</label>
        <select v-model="activeTool" @change="handleToolChange">
          <option value="select">✋ Select</option>
          <option value="freehand">✏️ Freehand</option>  
          <option value="polygon">📐 Polygon</option>
        </select>
        
        <!-- Tool-specific sub-modes -->
        <select v-if="activeTool === 'polygon'" v-model="polygonSubMode" class="sub-mode">
          <option value="draw">➕ Draw</option>
          <option value="edit">✏️ Edit Points</option>
        </select>
        
        <!-- Visual mode indicator -->
        <span class="mode-indicator">
          {{ getModeDescription() }}
        </span>
      </div>

      <div class="separator">|</div>

      <!-- Universal Edit Actions -->
      <div class="edit-section">
        <button @click="undo" :disabled="!canUndo" title="Ctrl+Z">
          ↶ Undo
        </button>
        <button @click="redo" :disabled="!canRedo" title="Ctrl+Shift+Z">
          ↷ Redo  
        </button>
        <button @click="deleteSelected" :disabled="selected.size === 0" title="Delete">
          🗑️ Delete
        </button>
        <button @click="duplicateSelected" :disabled="selected.size === 0" title="Ctrl+D">
          📋 Duplicate
        </button>
      </div>

      <div class="separator">|</div>

      <!-- Selection Actions (context-aware) -->
      <div class="selection-section">
        <!-- Freehand-specific actions -->
        <template v-if="hasStrokeSelection">
          <button @click="groupSelected" :disabled="!canGroup" title="Group strokes">
            📦 Group ({{ selectedStrokeCount }})
          </button>
          <button @click="ungroupSelected" :disabled="!canUngroup" title="Ungroup">
            📤 Ungroup
          </button>
        </template>
        
        <!-- Selection info (includes polygons) -->
        <span v-if="selected.size > 0" class="selection-info">
          {{ getSelectionDescription() }}
        </span>
        <span v-else class="selection-info dim">
          No selection
        </span>
      </div>

      <div class="separator">|</div>

      <!-- File Operations -->
      <div class="file-section">
        <button @click="downloadCanvas" title="Save canvas">
          💾 Save
        </button>
        <button @click="uploadCanvas" title="Load canvas">
          📁 Load
        </button>
        <button @click="clearCanvas" title="Clear all">
          🗑️ Clear All
        </button>
      </div>

      <div class="separator">|</div>

      <!-- View Options -->
      <div class="view-section">
        <label>
          <input type="checkbox" v-model="showGrid" />
          Grid
        </label>
        <!-- Timeline controls moved here from separate section -->
        <button @click="toggleTimelineMode" :disabled="!hasStrokeSelection">
          {{ timelineMode ? '⏹️' : '▶️' }} Timeline
        </button>
      </div>
    </div>

    <!-- Context-sensitive Help/Status -->
    <div class="status-bar">
      <span class="tool-help">{{ getToolHelp() }}</span>
      <span class="canvas-stats">{{ getCanvasStats() }}</span>
    </div>

    <!-- Canvas -->
    <div class="canvas-wrapper">
      <div ref="konvaContainer" class="konva-container"></div>
    </div>

    <!-- Unified Metadata Editor (works with freehand AND polygon selections) -->
    <div class="metadata-suite">
      <HierarchicalMetadataEditor 
        :onApplyMetadata="handleApplyMetadata"
        v-if="selected.size > 0"
      />
      <div v-if="selected.size > 0" class="metadata-info">
        Editing metadata for: {{ getSelectionDescription() }}
      </div>
    </div>

    <!-- Timeline (only when in timeline mode) -->
    <Timeline 
      v-if="timelineMode && hasStrokeSelection"
      :strokes="getAllStrokes" 
      :selectedStrokes="selectedStrokeIds"
      @timeUpdate="handleTimeUpdate" 
    />

    <!-- GPU/Script sections remain unchanged but use unified selection state -->
    <div class="gpu-strokes-section">
      <!-- Existing GPU controls but using unified selection -->
    </div>
  </div>
</template>
```

#### 5.2 Unified State Management in LivecodeHolder
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { activeTool, switchTool, polygonSubMode } from './core/toolManager'
import { selected, selectedKonvaNodes, getSelectionSummary } from './core/selectionStore'  
import { undo, redo, canUndo, canRedo, executeCommand } from './core/commandStack'
import { transformerManager } from './core/transformerManager'

// Unified selection computed properties
const selectedStrokeCount = computed(() => 
  [...selected].filter(item => item.type === 'stroke').length
)

const selectedPolygonCount = computed(() =>
  [...selected].filter(item => item.type === 'polygon').length
)

const selectedGroupCount = computed(() =>
  [...selected].filter(item => item.type === 'strokeGroup').length
)

const hasStrokeSelection = computed(() => selectedStrokeCount.value > 0)
const hasPolygonSelection = computed(() => selectedPolygonCount.value > 0)
const hasMixedSelection = computed(() => 
  (hasStrokeSelection.value && hasPolygonSelection.value)
)

// Tool mode descriptions
const getModeDescription = () => {
  switch (activeTool.value) {
    case 'select': return 'Select and transform shapes'
    case 'freehand': return 'Draw freehand strokes'
    case 'polygon': 
      return polygonSubMode.value === 'draw' 
        ? 'Click to add points, ESC to finish' 
        : 'Drag control points to edit'
    default: return ''
  }
}

const getToolHelp = () => {
  if (selected.size > 0) {
    return `${selected.size} item${selected.size > 1 ? 's' : ''} selected - drag to move, use handles to transform`
  }
  
  switch (activeTool.value) {
    case 'select': return 'Click shapes to select, drag to move, Shift+click for multi-select'
    case 'freehand': return 'Click and drag to draw strokes'
    case 'polygon': 
      return polygonSubMode.value === 'draw'
        ? 'Click to place points, click near start to close polygon'
        : 'Drag the orange circles to move polygon points'
    default: return ''
  }
}

const getSelectionDescription = () => {
  const summary = getSelectionSummary()
  const parts = []
  if (summary.strokes > 0) parts.push(`${summary.strokes} stroke${summary.strokes > 1 ? 's' : ''}`)
  if (summary.groups > 0) parts.push(`${summary.groups} group${summary.groups > 1 ? 's' : ''}`)
  if (summary.polygons > 0) parts.push(`${summary.polygons} polygon${summary.polygons > 1 ? 's' : ''}`)
  return parts.join(', ')
}

const getCanvasStats = () => {
  const totalStrokes = getAllStrokes().length
  const totalPolygons = getAllPolygons().length
  return `${totalStrokes + totalPolygons} shapes total`
}

// Unified actions
const deleteSelected = () => {
  if (selected.size === 0) return
  
  executeCommand('Delete Selected', () => {
    [...selected].forEach(item => {
      item.konvaNode.destroy()
      // Remove from appropriate data structure
      removeFromDataStructures(item)
    })
    selected.clear()
    updateBakedData()
  })
}

const duplicateSelected = () => {
  if (selected.size === 0) return
  
  executeCommand('Duplicate Selected', () => {
    const duplicated: CanvasItem[] = []
    
    [...selected].forEach(item => {
      const clone = duplicateCanvasItem(item, 50, 50) // 50px offset
      duplicated.push(clone)
    })
    
    // Replace selection with duplicated items
    selected.clear()
    duplicated.forEach(item => selected.add(item))
    updateBakedData()
  })
}

const clearCanvas = () => {
  if (!confirm('Clear entire canvas? This cannot be undone.')) return
  
  executeCommand('Clear Canvas', () => {
    freehandShapeLayer?.destroyChildren()
    polygonShapesLayer?.destroyChildren()
    selected.clear()
    clearAllDataStructures()
    updateBakedData()
  })
}

// File operations using unified state
const downloadCanvas = () => {
  const canvasState = {
    version: '2.0', // New unified format
    created: Date.now(),
    freehand: {
      renderData: freehandRenderData,
      groupMap: freehandGroupMap
    },
    polygon: {
      renderData: polygonRenderData
    }
  }
  
  const blob = new Blob([JSON.stringify(canvasState)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `canvas-${Date.now()}.json`
  a.click()
}

// Unified canvas event handling
const handleStagePointerDown = (e: Konva.KonvaEventObject<any>) => {
  if (isAnimating.value) return
  getCurrentTool()?.onPointerDown(e)
}

const handleStagePointerMove = (e: Konva.KonvaEventObject<any>) => {
  if (isAnimating.value) return
  getCurrentTool()?.onPointerMove(e)
  
  // Update cursor based on current tool and context
  updateCursorForTool()
}

const handleStagePointerUp = (e: Konva.KonvaEventObject<any>) => {
  if (isAnimating.value) return
  getCurrentTool()?.onPointerUp(e)
}

// Tool switching with cleanup
const handleToolChange = () => {
  switchTool(activeTool.value)
  
  // Tool-specific setup
  if (activeTool.value === 'polygon') {
    updatePolygonControlPoints() // Show/hide vertex controls based on edit mode
  }
}

// Keyboard shortcuts (unified - keeping existing functionality)
const handleKeydown = (e: KeyboardEvent) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
  
  if (e.key === 'Escape') {
    // Universal escape - cancel current operation  
    getCurrentTool()?.cancel?.()
    selected.clear()
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    deleteSelected()
  } else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    duplicateSelected()
  } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    e.shiftKey ? redo() : undo()
  }
}
</script>
```

#### 5.3 Consolidated CSS
Replace the current fragmented styles with organized sections:

```css
.control-panel {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  flex-wrap: wrap;
  justify-content: center;
}

.tool-section, .edit-section, .selection-section, .file-section, .view-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-mode {
  font-size: 12px;
  padding: 3px 6px;
}

.mode-indicator {
  font-size: 12px;
  color: #666;
  font-style: italic;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.selection-info {
  font-size: 12px;
  color: #333;
  font-weight: 500;
}

.selection-info.dim {
  color: #999;
}

.status-bar {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 8px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #666;
}

.tool-help {
  flex: 1;
}

.canvas-stats {
  font-family: monospace;
  color: #495057;
}
```

#### 5.4 Removed UI Sections
The following separate UI sections get eliminated:

- **Separate polygon controls section** → Integrated into main toolbar
- **Tool-specific undo/redo buttons** → Single unified undo/redo
- **Duplicate tool dropdowns** → Single tool selector
- **Fragmented button groups** → Organized into logical sections  
- **Multiple status displays** → Single status bar
- **Separate file operation sections** → Unified file menu

#### 5.5 Progressive Enhancement
Maintain existing functionality during migration:

1. **Phase 5a**: Add unified control panel alongside existing UI
2. **Phase 5b**: Migrate functionality piece by piece
3. **Phase 5c**: Remove old UI sections
4. **Phase 5d**: Polish and optimize new layout

This ensures the UI works throughout the transition and allows for easy rollback if issues arise.

## Key Integration Points

The unified system must preserve these critical behaviors:

- **GPU rendering updates**: `executeCommand` automatically triggers `updateBakedStrokeData()` and `updateBakedPolygonData()`
- **Hot-reload compatibility**: Existing serialization/deserialization functions remain unchanged  
- **Timeline functionality**: Continues to work with freehand strokes only (filter `selected` by type)
- **Metadata editing**: Works on any selected node via unified `applyMetadata` function

## Benefits

### Immediate Benefits
- **~90% reduction in duplicated code**: Selection, undo/redo, transformation logic consolidated
- **Consistent UX**: All tools use same selection behavior, existing keyboard shortcuts, metadata editing
- **Simplified maintenance**: Single point of truth for core canvas operations
- **Better performance**: Single transformer instead of multiple, shared event handling

### Future Benefits  
- **Extensibility**: New tools only need to implement `CanvasTool` interface
- **Cross-tool operations**: Mixed selections of different shape types work naturally
- **Unified file format**: Single save/load system handles all content types

## Risk Mitigation

### Testing Strategy
1. **Regression Tests**: Record existing workflows before refactor
2. **Incremental Validation**: Test after each phase
3. **Feature Parity Checklist**:
   - Draw freehand stroke → select → transform → undo
   - Draw polygon → edit vertex → drag-select with stroke → transform both  
   - Grouping only available for freehand shapes
   - **Metadata editor works on mixed selections (strokes + polygons)**
   - **Polygon metadata editing with undo/redo support**
   - **Metadata changes trigger appropriate render data updates**
   - Hot-reload preserves state
   - **GPU strokes update on selection/transform** (critical for WebGPU preview)
   - **Timeline animation works with freehand selections**
   - **Ancillary visualizations refresh on metadata changes**
   - **Legacy file format loading still works**

### Rollback Plan
- Feature branch development with ability to revert
- Gradual migration allows partial rollback to previous systems
- Wrapper functions maintain API compatibility during transition

## Success Metrics

### Code Quality
- Eliminate ~500 lines of duplicated logic
- Reduce cyclomatic complexity in LivecodeHolder  
- Single source of truth for selection/transformation

### User Experience  
- No regressions in existing functionality
- Consistent keyboard shortcuts across all tools
- Smoother cross-tool workflows

### Developer Experience
- Easier to add new shape types
- Clearer separation of concerns
- Better test coverage through focused modules

## Next Steps

1. **Create feature branch**: `feature/unify-canvas-tools`
2. **Phase 1 Implementation**: Start with utilities and selection store
3. **Incremental testing**: Validate each phase before proceeding
4. **Code review checkpoints**: Review architectural changes before proceeding to next phase
5. **User testing**: Validate UX parity before merging to main

This refactor transforms the codebase from a collection of separate tools into a cohesive canvas application while preserving all existing functionality and preparing for future growth.
