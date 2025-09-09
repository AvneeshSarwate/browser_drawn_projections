# Unified Selection & Transformation Fix Plan

Goal: Establish a single, consistent selection and transformation system that works for both Freehand and Polygon shapes, with a unified undo/redo history and predictable UI behavior.

This plan is organized into small, testable batches. After each batch, you can run the app, validate with the acceptance checklist, and review the code before we proceed.

---

## Batch 1 — Registry + Selection Foundation

Focus: Make selection reliable by ensuring every selectable node is registered, unify event sources (avoid double selection), and fix drag-select basics.

Changes
- CanvasItem registration completeness
  - Freehand: Register all nodes after deserialization and after duplication.
  - Polygon: Register all nodes after deserialization.
  - Groups: Register newly created freehand groups via `fromGroup` (already partially present) and ensure clones also get registered.
- Selection event source unification
  - Remove node-level click selection toggles for freehand and polygon; rely on `core/selectTool` (stage-based) to select/toggle.
  - Keep node drag handlers for undo tracking; only selection should move to stage-based.
- Selection rectangle uniqueness and filtering
  - Use only `core/selectTool`’s selection rectangle (remove the legacy `createSelectionRect` path from freehand).
  - In `core/selectTool`, filter out `Konva.Transformer` and non-shape helper nodes during drag selection.
- Group escalation on click
  - When clicking a child (e.g., a Path inside a group), escalate to the top-most Group whose parent is a Layer for selection.

Files likely touched
- `src/sketches/handwriting_animator/freehandTool.ts`
- `src/sketches/handwriting_animator/polygonTool.ts`
- `src/sketches/handwriting_animator/core/CanvasItem.ts`
- `src/sketches/handwriting_animator/core/selectTool.ts`
- `src/sketches/handwriting_animator/LivecodeHolder.vue` (remove legacy selection-rect init)

Acceptance checklist
- Click selects a path or its top-level group consistently; Shift-click toggles.
- Drag-select rectangle selects only actual shapes; no transformer/selection-helper nodes are selected.
- Selection highlight updates correctly; no double-toggle from both node and stage events.
- After deserialization and after duplication, clicking shapes selects them (registry is complete).

---

## Batch 2 — Transformer Unification

Focus: Ensure only one transformer controls transformations for all selected nodes.

Changes
- Remove legacy freehand transformers (`selTr`, `grpTr`) and `freehandRefreshUI` coupling. Rely on `core/transformerManager.initializeTransformer`.
- Ensure transformer ignores polygons in edit mode (already implemented) and attaches to the correct selection layer.
- Keep rotate/scale options consistent with prior behavior as needed (e.g., keepRatio on/off).

Files likely touched
- `src/sketches/handwriting_animator/LivecodeHolder.vue`
- `src/sketches/handwriting_animator/freehandTool.ts`
- `src/sketches/handwriting_animator/core/transformerManager.ts`

Acceptance checklist
- Only one transformer appears; it follows the selection.
- Transforms (move/scale/rotate) apply to freehand strokes/groups and polygons; polygons are skipped appropriately in edit mode.
- No duplicate transformer handles or phantom transform nodes.

---

## Batch 3 — Unified Undo/Redo for Transforms and Drags

Focus: All transforms and drags go through the unified `CommandStack` so Undo/Redo works consistently across tools.

Changes
- Export unified transform tracking helpers from `transformerManager` (e.g., `startTransformTracking`, `finishTransformTracking`).
- Update node drag handlers in freehand and polygon tools to call the unified helpers rather than tool-specific histories.
- Remove or disable the freehand/polygon local drag histories for transform/drag operations (retain command wrappers for creation/edit operations).
- Ensure `CommandStack.onStateChange` refreshes baked data and visualizations (already wired).

Files likely touched
- `src/sketches/handwriting_animator/core/transformerManager.ts`
- `src/sketches/handwriting_animator/freehandTool.ts`
- `src/sketches/handwriting_animator/polygonTool.ts`

Acceptance checklist
- Dragging a node or transforming via the transformer creates a single unified undo step.
- Undo/Redo reverts transforms consistently for both freehand and polygon items.
- No duplicate history entries for a single interaction.

---

## Batch 4 — Selection-Driven UI State

Focus: Replace legacy selection-derived refs with logic that reads from the unified selection store and updates the UI/buttons/timeline deterministically.

Changes
- Replace `freehandRefreshUI` responsibilities with watchers that derive:
  - `freehandSelectedCount`, `isFreehandGroupSelected` from `selectionStore`.
  - `freehandCanGroupRef` by evaluating ancestor conflicts via `utils/canvasUtils.hasAncestorConflict`.
- Wire `updateTimelineState` to `selectionStore` changes so the timeline immediately reflects the selection.

Files likely touched
- `src/sketches/handwriting_animator/LivecodeHolder.vue`
- `src/sketches/handwriting_animator/utils/canvasUtils.ts`
- `src/sketches/handwriting_animator/freehandTool.ts` (remove now-unneeded `freehandRefreshUI` paths)

Acceptance checklist
- “X selected” updates correctly.
- Group/Ungroup/Duplicate/Delete buttons enable/disable correctly based on selection conditions.
- Timeline selection view updates immediately on selection changes.

---

## Batch 5 — Draggability and Tool-Mode Logic

Focus: Ensure nodes are draggable/responsive only in the right tools/modes.

Changes
- Update `updateFreehandDraggableStates` to depend on the active tool (`select` vs `freehand/polygon`) rather than only `freehandDrawMode`.
- Ensure polygon shapes are not inadvertently draggable in polygon edit/draw states where control points handle manipulation.
- Confirm `listening` flags on layers match the selected tool.

Files likely touched
- `src/sketches/handwriting_animator/freehandTool.ts`
- `src/sketches/handwriting_animator/polygonTool.ts`
- `src/sketches/handwriting_animator/LivecodeHolder.vue`

Acceptance checklist
- In Select tool, items are draggable and transformable.
- In Freehand Draw mode, existing shapes aren’t draggable; drawing works.
- In Polygon Draw/Edit, polygon behavior is unchanged and freehand/polygon selections don’t interfere.

---

## Batch 6 — Cleanup and Edge Cases

Focus: Polish, remove dead paths, and handle edge cases.

Changes
- Remove legacy freehand selection rectangle creation, legacy transformers, and any dead code paths.
- Ensure `canvasItemRegistry` is cleaned on node removal (delete/destroy) across both tools.
- Ensure duplication registers items and selects the newly created clones predictably.
- Filter out non-selectable helper layers (metadata/highlights) during selection.

Files likely touched
- As discovered during implementation, typically the same files from prior batches.

Acceptance checklist
- Duplicate works (new clones are selectable and registered).
- Delete removes nodes from registry and selection; no stale highlights.
- Drag-select never selects transformers or helper overlays.

---

## Notes & Risks
- We’ll remove node-level click selection handlers to avoid double selection. If any special-click behavior is needed later, we can add it to `selectTool`.
- Transformer unification removes prior assumptions (`selTr`/`grpTr`). If some advanced freehand-only transformer behavior is needed, we’ll reintroduce it in `transformerManager` behind feature flags.
- Undo/Redo unification means we stop producing freehand/polygon-specific history entries for drags/transforms. Creation/edit operations still use command wrappers to capture changes.

## How We’ll Work
- Implement batches in order, keeping diffs small and scoped.
- After each batch, I’ll provide a short summary and suggested manual test checklist (above) so you can validate and approve moving to the next batch.

