# Canvas Architecture Refactor Plan

## Current Cross-Module State Dependencies
- **freehandTool.ts**  
  - Reads Pinia `appState` and module globals (`stage`, `activeTool`).  
  - Owns mutable maps (`freehandStrokes`, `freehandStrokeGroups`), undo stacks, drawing flags stored at module scope.  
  - Calls into `selectionStore` for selection bookkeeping and metadata propagation.  
  - Exposes helpers (`getCurrentFreehandStateString`, `deepCloneWithNewIds`, `updateBakedStrokeData`, etc.) that other modules import directly.  
  - Emits flattened stroke data by writing `appState.freehandRenderData`/`freehandGroupMap` and invoking `appState.freehandDataUpdateCallback`.
- **polygonTool.ts**  
  - Shares the Pinia `appState` reference; stores polygon maps and layer handles globally.  
  - Imports `freehandTool` utilities for combined undo snapshots and exports `polygonShapes`, `attachPolygonHandlers`, `updateBakedPolygonData` consumed by `selectTool` and ancillary visualisations.  
  - Serialises its state by mutating `appState.polygonStateString`.
- **selectionStore.ts**  
  - Maintains a module-level reactive `Set` of `CanvasItem`s and highlight bookkeeping.  
  - Lazily imports `updateBakedStrokeData`, `updateBakedPolygonData`, and `refreshAnciliaryViz` to avoid circular dependencies, effectively making baked-data refresh a side effect of any selection change.  
  - Used by both `freehandTool` (selection logic inside drawing commands) and `selectTool` (primary selector).  
- **selectTool.ts**  
  - Depends on `selectionStore` for operations, but also imports deep internals from `freehandTool` (`freehandShapeLayer`, `deepCloneWithNewIds`, `updateTimelineState`, `refreshStrokeConnections`) and `polygonTool` (`polygonShapes`, `polygonShapesLayer`, `attachPolygonHandlers`).  
  - Uses `pushCommandWithStates` and combined freehand/polygon snapshot helpers to interact with undo/redo.  
  - Holds global Konva references (`selectionLayer`, `selectionRect`).

These modules therefore assume:
- A single, process-wide `stage` and set of Konva layers.
- Shared undo/redo history stored outside of Vue component instances.  
- Direct knowledge of each other’s internal data structures, making independent reuse or multi-canvas deployment impossible.

Existing downstream consumers (GPU stroke launcher, script panel) continue to read flattened stroke/polygon data from the Pinia `globalStore`.

## Target Architecture
Create a `CanvasContext` instance that encapsulates Konva stage objects, tool state, undo stacks, and selection store per canvas. Export a `CanvasAPI` to the rest of the app while keeping the Pinia `globalStore` only as a mirror of derived, flattened state (updated via callbacks) so current consumers keep working.

## Refactor Roadmap

### Milestone 0 – Scaffolding & Contracts
1. Define TypeScript interfaces that describe the public canvas contracts (`CanvasSnapshot`, `FlattenedCanvasState`, `CanvasEvents`, `CanvasAPI`).  
2. Document required callbacks (`onStateChanged(snapshot)`) and specify which pieces must still be pushed into the Pinia store (flattened freehand/polygon data plus any metadata maps used downstream).

### Milestone 1 – Context Skeleton
1. Introduce `canvas/context.ts` with `createCanvasContext(options)` returning a context object that contains:  
   - Reactive state containers for tool mode, baked render data, selection, undo stack references.  
   - Non-reactive holders for Konva stage/layers and tool registries.  
   - Event emitter (`emit`, `on`, `off`).
2. Thread the existing Pinia store into context creation via options (`piniaStoreCallbacks`) so the context can push flattened snapshots back to global state without reading from it.
3. Provide Vue `InjectionKey<CanvasAPI>` to support `provide/inject` from `CanvasRoot.vue`.

### Milestone 2 – Stage/Layers Ownership
1. Move `stage`, `setStage`, and layer setters (`setFreehandShapeLayer`, etc.) into the context instance.  
2. Update `CanvasRoot.vue` lifecycle hooks to call context methods (e.g., `context.initializeStage(containerElement)`) and to register/unregister draw functions through the new API rather than touching `appState.drawFunctions`.
3. Expose layer accessors via context (`context.layers.freehandShape`) for tools to use while migrating.

### Milestone 3 – Selection Store Isolation
1. Refactor `selectionStore.ts` into a factory `createSelectionStore(context)` that stores selection state within the context instead of module globals.  
2. Replace dynamic imports with context-level callbacks so baked data/visualisation refresh flows through a single `context.notifySelectionChanged()` that triggers:  
   - Internal updates (highlights, transformer)
   - Context `emit('selectionChanged', …)`
   - Pinia mirror updates if needed.
3. Update all imports (`freehandTool`, `selectTool`, metadata editors) to use the context’s selection store rather than importing the module directly.

### Milestone 4 – Freehand Tool Modularisation
Break the migration into sub-steps to avoid destabilising everything at once:
1. **State relocation:** Move freehand-specific maps, refs, and undo stacks onto `context.freehand`. Ensure any watchers run against context state rather than module scope.  
2. **API wrapper:** Create `context.freehandTool = createFreehandTool(context)` exposing the current public surface (draw handlers, serialization helpers, duplication).  
3. **Baked data flow:** Change `updateBakedStrokeData` to return the flattened strokes and call `context.emit('freehandFlattened', data)`. Have the context handle:  
   - Updating its cached snapshot.  
   - Pushing flattened data/metadata into the Pinia store via provided callbacks.  
4. **Command integration:** Route `executeCommand`/`pushCommandWithStates` invocations through context-level command stack helpers; remove direct dependency on `setGlobalExecuteCommand`.

### Milestone 5 – Polygon Tool Modularisation
1. Mirror the freehand process: create `context.polygonTool` with isolated state containers.  
2. Update undo/redo helpers to use context command stack functions and combined state capture provided by the context.  
3. Emit polygon flattened data via the context so Pinia mirrors stay updated, preserving downstream APIs.

### Milestone 6 – Selection Tool Integration
1. Refactor `selectTool.ts` into `createSelectTool(context)` that consumes the context’s selection store, freehand, and polygon APIs instead of importing module-level symbols.  
2. Move `selectionLayer`, `selectionRect`, and drag state into the context so multi-instance operation becomes possible.  
3. Rework duplication/transform helpers to call `context.freehandTool` / `context.polygonTool` methods rather than reaching into internal maps directly.

### Milestone 7 – Command Stack & History Consolidation
1. Embed a single command stack instance inside the context along with helper methods for tools to register undoable operations.  
2. Supply helpers (`context.captureState()`, `context.restoreState()`) that produce combined freehand/polygon snapshots without requiring each tool to import the other.

### Milestone 8 – External Consumer Adapters
1. Update `strokeLauncher.ts` and `StrokeLaunchControls.vue` to accept a `CanvasAPI` (via props or injection).  
   - Subscribe to `context.on('flattenedChanged', snapshot => …)` to refresh GPU buffers.  
   - Stop reading mutable refs directly from Pinia; instead, rely on data mirrored there by the context.  
2. Ensure ancillary visualisations and metadata editors also hook into the context events rather than module globals.

### Milestone 9 – Pinia Store Bridging
1. Keep `globalStore` but limit it to derived data: flattened freehand/polygon render data, group maps, GPU-ready stroke summaries.  
2. Provide a `context.configurePiniaBridge({ updateFlattened })` helper which the Vue root calls, so flattened snapshots emitted by the context update the store while avoiding reverse dependencies.  
3. Remove direct `globalStore()` calls from tools once the bridge is in place; verify downstream consumers still receive updates through the mirrored flattened state.

### Milestone 10 – Multi-Instance & Web Component Readiness
1. Verify that multiple `CanvasRoot.vue` mounts can coexist by instantiating separate contexts and ensuring no shared module state remains.  
2. Build the custom-element wrapper using the context API, exposing lifecycle hooks (`loadState`, `onStateChanged`).

### Milestone 11 – Web Component Build & Distribution
1. Create a dedicated custom-element entry (`canvas-element.ce.ts`) that wires the Vue component to `defineCustomElement`, registers DOM events for state updates, and maps attributes/props for configuration (per <https://vuejs.org/guide/extras/web-components.html>).  
2. Configure the bundler for web-component output: e.g., Vite library mode or Vue CLI `--target wc`, ensuring all required dependencies (p5, three.js, Babylon, shaders) are bundled or declared as externals; verify CSS/asset handling works inside the shadow DOM if enabled.  
3. Provide host integration docs covering how consumers pass initial state (attributes/props), subscribe to emitted DOM events, and load optional assets/polyfills.  
4. Add automated build scripts that produce both the normal SPA bundle and the custom-element bundle, plus size/regression checks so downstream users receive a single self-contained asset.

### UI Consolidation Tasks
- **Metadata controls:** The `📝 Metadata` toggle button is duplicated in both freehand and polygon toolbars and opens the same metadata suite. Move this control into the common selection toolbar (or an always-visible utility section) so metadata editing is decoupled from individual tools.
- **Duplicate/Delete actions:** `duplicateSelection` and `deleteSelection` buttons appear in the select toolbar and again in the freehand and polygon toolbars. Centralise these actions in one shared toolbar so selection management is consistent regardless of active tool.
- **Grid toggle:** The grid visibility toggle (`⊞ Grid On / ⊡ Grid Off`) is repeated in freehand and polygon toolbars with identical behaviour. Promote it to a global canvas setting accessible once instead of duplicating buttons per tool.

## Additional Notes
- Execute the milestones sequentially within a single refactor branch; the project has no automated tests and only one user, so skip formal test harnesses or backward-compatibility shims.  
- After each milestone, manually sanity-check core UI flows (drawing, selection, polygon editing, GPU launcher) using the newly implemented context to ensure nothing regressed before moving on.  
- Keep a running checklist as work progresses so subsequent steps can rely on freshly updated context about what has already been migrated; include relevant console logs or screenshots if they help future verification.  
- When producing the custom-element bundle, verify in a bare HTML page that the element mounts and emits the expected DOM events—no automated suite is required, just a quick manual smoke test.  
- Update documentation inline (README or architecture notes) as soon as an API changes so the executing agent always has the latest reference while moving through the plan.
