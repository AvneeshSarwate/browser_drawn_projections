# Canvas Modularization Quick Plan

Goal: eliminate singleton-style module state in `src/sketches/handwriting_animator/canvas` by consolidating all mutable data into a single runtime state object that every function receives explicitly. This is a mechanical first pass whose output can later be polished, but it must break hidden dependencies so more deliberate design work is possible.

## Core Idea
- Gather every module-level variable (Konva stage/layers, stroke maps, selection sets, undo stack refs, metadata flags, etc.) into one TypeScript interface `CanvasRuntimeState`.
- Provide a factory `createCanvasRuntimeState()` that initialises default values. Each canvas instance calls this to get its own isolated state.
- Rewrite functions in each canvas module so they accept `state: CanvasRuntimeState` as their first argument (or wrap the module in `createXTool(state)` factories that close over the state). Remove any remaining top-level mutable bindings from those modules.
- Update Vue components and other consumers to import these functions and call them with the correct state instance rather than reading globals or Pinia directly.

## Inventory (What Moves Into `CanvasRuntimeState`)
- **Stage & Layers:** `stage`, freehand layers, polygon layers, selection/highlight layers, ancillary viz layers.
- **Tool Flags & Buffers:** drawing flags, point arrays, timestamps, polygon point buffers, drag tracking fields.
- **Data Collections:** `freehandStrokes`, `freehandStrokeGroups`, `polygonShapes`, `polygonGroups`, command stacks, selection sets, metadata registries, cached flattened data.
- **UI Refs:** timeline refs, animation status, grid toggles, metadata editor refs that currently live in `appState.ts` or module scope.
- **Callbacks / Bridges:** GPU update callbacks, Pinia bridge functions, ancillary viz refresh handles.

Document the full list while touching each file so no field is forgotten; comments are okay to mark TODOs for future clean-up.

## Step-by-Step Plan

1. **Create Runtime State Container**
   - Add `canvas/canvasState.ts` exporting `CanvasRuntimeState` interface and `createCanvasRuntimeState()`; include placeholders for every known field (initialise to `undefined`, empty arrays/maps, or sensible defaults).
   - Add helper types for grouped concepts (e.g., `FreehandState`, `PolygonState`, `SelectionState`) if it keeps the main interface readable, but avoid deep abstractions for now.

2. **Rewrite Shared Utilities**
   - Update `CanvasItem.ts`, `canvasUtils.ts`, `commands.ts`, and other utility modules so they no longer rely on module-level registries. Each exported function should accept either the full state object or the specific slice it needs.
   - For registries like `canvasItemRegistry`, move them into `CanvasRuntimeState` (`state.canvasItems`).

3. **Refactor Freehand Tool**
   - Replace all top-level `let` declarations in `freehandTool.ts` with references to `state.freehand.*`.
   - Convert exports into functions that accept `state` (e.g., `export const duplicateFreehandSelected = (state, options) => { ... }`).
   - Ensure helper utilities (cloning, timeline updates, baked data generation) accept `state` and stop importing from `globalStore` or other modules.
   - Adjust any cross-module imports accordingly (e.g., pass `state` through selection helpers).

4. **Refactor Polygon Tool**
   - Follow the same process: migrate `polygonShapes`, layer refs, drag-tracking state, undo helpers into `state.polygon.*`.
   - Modify functions to accept `state` and adapt call sites.

5. **Selection & Command Services**
   - Update `selectionStore.ts` so exported functions take `(state, ...)` and interact with `state.selection`. Remove the module’s `selected` set.
   - Move highlight bookkeeping and metadata helpers into the state object. Ensure update hooks call other functions with the shared `state` reference.
   - Adjust `commands.ts` so the global execute/push functions are stored inside `state.commands` rather than module scope.

6. **CanvasRoot.vue Integration**
   - Import `createCanvasRuntimeState()` in `CanvasRoot.vue`. Create a state instance per component instance (`const state = createCanvasRuntimeState()`).
   - Pass `state` into every helper call (freehand, polygon, selection, command stack setup, ancillary viz). Remove reliance on top-level setters like `setStage`.
   - Where code previously referenced Pinia via globals, store the callbacks on `state` during component setup.

7. **Other Consumers**
   - Update modules/components that interact with canvas helpers (`LivecodeHolder.vue`, `StrokeLaunchControls.vue`, metadata/timeline components) to accept the state object (via props, injection, or direct import).
   - If sharing across components, use Vue `provide/inject` to give descendants access to the per-instance state instead of Pinia globals.

8. **Cleanup & Verification**
   - Remove obsolete exports (`setStage`, layer setters, module-level refs) once all call sites are updated.
   - Run TypeScript type checking (`pnpm typecheck` or equivalent) and fix mechanical errors caused by the new function signatures.
   - Manually sanity-test the UI: draw strokes, create polygons, duplicate selections, undo/redo, update metadata, trigger GPU refresh. Expect temporary layout/UI regressions but ensure logic executes without relying on shared singletons.

## Notes & Shortcuts
- Prefer passing the full `CanvasRuntimeState` even if a function needs only a slice; optimisation can come later.
- Use TODO comments where richer abstractions are needed later (e.g., splitting state into nested objects, event emitters). This pass focuses strictly on surfacing dependencies.
- When in doubt about how to thread the state, use thin wrapper helpers in the short term (e.g., `const updateBakedStrokeData = (state) => internalUpdate(state.freehand, state.shared)`), then inline them later.
- If any external module (outside `canvas/`) depends on old exports, provide compatibility wrappers that forward to the new `(state, …)` functions until those consumers are migrated.
