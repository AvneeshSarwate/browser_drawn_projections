# freehandTool_orig — Pseudocode Walkthrough

The original freehand tool implements drawing, selection, grouping, transformers, and undo/redo. This pseudocode captures the core control flows that affect selection and transforms.

---

## State and Globals

- stage: Konva.Stage
- freehandShapeLayer, freehandDrawingLayer, freehandSelectionLayer
- freehandStrokes: Map<id, FreehandStroke>
- freehandStrokeGroups: Map<id, FreehandStrokeGroup>
- selected: Konva.Node[]                // array of selected nodes (paths or groups)
- selTr: Konva.Transformer | undefined  // Transformer for multi-node selection
- grpTr: Konva.Transformer | undefined  // Transformer for a single group
- freehandDrawMode: boolean             // draw vs select
- command history for undo/redo (JSON snapshots)

---

## Event Wiring (attachHandlersRecursively)

For any Path or Group node:
- node.draggable(true)
- node.on('click') => handleClick(node, shiftKey)
- node.on('dragstart') => startFreehandDragTracking()
- node.on('dragend') => finishFreehandDragTracking(node.constructor.name); layer.batchDraw()
- For Group, recurse to children as well

Consequences:
- Clicking a node routes selection to the tool’s click handler (node-level selection).
- Dragging a single node moves that node; adds a transform history entry via drag tracking.

---

## Click Selection (handleClick)

function handleClick(targetNode, shiftKey):
  if (freehandDrawMode) return // ignore selection in draw mode

  group = freehandTopGroup(targetNode) // escalate to top-most group under layer
  nodeToSelect = group ?? targetNode

  if (shiftKey): toggleSelection(nodeToSelect)
  else:
    clearSelection()
    addSelection(nodeToSelect)

  freehandRefreshUI() // updates transformers and UI state

---

## freehandTopGroup

Walk parent chain from node up to layer; keep last encountered Group; return it (or null).

---

## freehandRefreshUI

If no transformers/layer: return

- refreshStrokeConnections() // ensure freehandStrokes map points to current Path refs by ID

- If exactly one selected node and it’s a Group:
    if (!grpTr) create grpTr (rotateEnabled, keepRatio, padding)
      grpTr.on('transformstart') => startFreehandDragTracking()
      grpTr.on('transformend') => finishFreehandDragTracking('Transform Group')
      add grpTr to selection layer
    grpTr.nodes([selected[0]])
    selTr.nodes([])
  else:
    if (!selTr) create selTr (rotateEnabled, keepRatio, padding)
      selTr.on('transformstart') => startFreehandDragTracking()
      selTr.on('transformend') => finishFreehandDragTracking('Transform Selection')
      add selTr to selection layer
    selTr.nodes(selected)
    if (grpTr) grpTr.nodes([])

- Update computed UI state:
  freehandSelectedCount = selected.length
  isFreehandGroupSelected = (selected.length == 1 && selected[0] is Group)
  freehandCanGroupRef = (selected.length >= 1) && !hasAncestorConflict(selected)

- updateTimelineState()
- shapeLayer.batchDraw()

Notes:
- The tool uses TWO transformers: grpTr for a single group, selTr for multi-node/paths.
- Transformer handles also enable dragging (move) of the selection as a whole.
- Critically: nodes remain draggable(true); this means dragging a selected node drags just that node, unless user drags via transformer box.

---

## Grouping (groupSelectedStrokes)

executeFreehandCommand('Group Strokes', () => {
  commonParent = findCommonParent(selected) else layer
  superGroup = new Konva.Group({ draggable: true })
  add superGroup to commonParent

  superGroup.on('dragstart') => startFreehandDragTracking()
  superGroup.on('dragend')   => finishFreehandDragTracking('Group')

  for each node in selected:
    node.draggable(false)
    absPos = node.getAbsolutePosition()
    absRot = node.getAbsoluteRotation()
    absScale = node.getAbsoluteScale()
    move node into superGroup
    node.position(absPos)
    node.rotation(absRot)
    node.scale(absScale)

  freehandLockPivot(superGroup)
  clearSelection(); addSelection(superGroup)
  freehandRefreshUI(); updateFreehandDraggableStates(); batchDraw(); updateBakedStrokeData()
})

freehandLockPivot(node): set offset to node’s self clientRect center; adjust position accordingly

---

## Ungrouping

If single selection is Group:
  executeFreehandCommand('Ungroup Strokes', ()=>{
    snapshot children; for each child:
      abs transforms; move to parent; restore transforms; child.draggable(true)
    destroy group
    refreshStrokeConnections(); clearSelection(); updateFreehandDraggableStates(); batchDraw(); updateBakedStrokeData()
  })

---

## updateFreehandDraggableStates

For each stroke.shape:
  isInGroup = (shape.parent != freehandShapeLayer)
  shape.draggable( !freehandDrawMode && !isInGroup )

For each top-level Group child of layer:
  group.draggable( !freehandDrawMode )

Notes:
- In Select mode (freehandDrawMode=false), individual paths are draggable if not inside a group; groups are draggable.
- This causes single-node drags to move only that path/group, NOT the entire selection set.

---

## Drag Tracking for Undo/Redo

startFreehandDragTracking():
  freehandDragStartState = getCurrentFreehandStateString()

finishFreehandDragTracking(nodeName):
  endState = getCurrentFreehandStateString()
  if different from start:
    push command { name: `Transform ${nodeName}`, before, after }
    updateBakedStrokeData()
  freehandDragStartState = null

Notes:
- Used by node drag and transformer drag events to create one history entry per drag.

---

## Serialization/Deserialization

serializeFreehandState():
  write { layer: layer.toObject(), strokes: [...], strokeGroups: [...] } as JSON

deserializeFreehandState():
  clear layer; clear maps; clear selected[]
  recreate nodes via Konva.Node.create(child json), add to layer, attachHandlersRecursively
  rebuild maps for strokes and groups from JSON; refreshStrokeConnections(); updateFreehandDraggableStates();
  clear transformers (selTr/grpTr).nodes([]); batchDraw(); delayed updateBakedStrokeData()

---

## Key Behavioral Takeaways

1) Node-level selection and node-level dragging are fundamental in the original tool.
   - Click selection escalates to top group.
   - Node drag moves only that node; multi-node move happens via dragging the transformer box, not by dragging any selected node.

2) Transformers are mutually exclusive:
   - grpTr is used when exactly one Group is selected.
   - selTr is used when multiple nodes/paths are selected (or 1 path). They’re swapped by freehandRefreshUI.

3) Draggability depends on freehandDrawMode and group membership.
   - This tightly couples selection/move interactions to a Freehand-only mode toggle.

4) Undo/Redo integrates both node drag and transformer drag as “Transform …” commands captured by start/finish tracking.

