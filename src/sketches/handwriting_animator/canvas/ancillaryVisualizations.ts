import Konva from 'konva'
import { ref, watch } from 'vue'
import { stage } from '../appState'
import { collectHierarchy } from './metadata/hierarchy'
import { setNodeMetadata } from './freehandTool'
import type { CanvasRuntimeState } from './canvasState'

// ----- public reactive API -----
export const activeAVs = ref<Set<string>>(new Set())

// ----- registry types -----
export interface AVContext {
  node: Konva.Node
  metadata: Record<string, any>
  bbox: { x: number, y: number, width: number, height: number }   // x,y,width,height in world coords
}

export interface AncillaryVisDefinition {
  key: string                     // unique id, e.g. "typo-guides"
  displayName: string             // label for checkbox
  validate(ctx: AVContext): boolean
  create(ctx: AVContext): Konva.Node | Konva.Node[]        // invoked first time
  update?: (ctx: AVContext, vis: Konva.Node | Konva.Node[]) => void // subsequent changes
  destroy?: (vis: Konva.Node | Konva.Node[]) => void
}

const REG = new Map<string, AncillaryVisDefinition>()
export const registerAV = (def: AncillaryVisDefinition) => REG.set(def.key, def)

// Export registry for UI access
export const getRegisteredAVs = () => Array.from(REG.values())

// ------------------------------------------------------------------
// State-based runtime manager  
// ------------------------------------------------------------------
export const initAVLayerInState = (state: CanvasRuntimeState) => {
  activeState = state
  if (state.layers.ancillaryViz || !state.stage) return
  
  state.layers.ancillaryViz = new Konva.Layer({ listening: false, name: 'ancillary-vis' })
  state.stage.add(state.layers.ancillaryViz)
  
  // Install global listeners once (events bubble from child nodes)
  const handlers = createAVEventHandlers(state)
  state.stage.on('dragmove.av transform.av', handlers.onDragMove)
  state.stage.on('dragend.av transformend.av', handlers.onTransformEnd)
  state.stage.on('destroy.av', handlers.onDestroy)
  
  state.stage.batchDraw()
}

// Legacy runtime manager (singleton – initialised on first call)
let layer: Konva.Layer | undefined
const nodeToVis = new Map<string, {def: AncillaryVisDefinition, vis: Konva.Node | Konva.Node[]}>()
let listenersInstalled = false
let activeState: CanvasRuntimeState | null = null

// State-based refresh functions
export const refreshAnciliaryVizWithState = (state: CanvasRuntimeState) => {
  if (!state.stage) return
  initAVLayerInState(state)

  const roots = collectHierarchy(state.layers.freehandShape).filter(h => h.depth === 0).map(h => h.node)
  const needed = new Map<string, {ctx: AVContext, def: AncillaryVisDefinition}>()

  roots.forEach(node => {
    const md = node.getAttr('metadata') ?? {}
    const bbox = node.getClientRect({ relativeTo: state.stage })
    const ctx: AVContext = { node, metadata: md, bbox }
    activeAVs.value.forEach(key => {
      const def = REG.get(key)
      if (def && def.validate(ctx)) {
        needed.set(`${key}|${node.id()}`, {ctx, def})
      }
    })
  })

  // For now, delegate to legacy implementation for actual vis management
  refreshAnciliaryViz(state)
}

const scheduleAVRefresh = (state: CanvasRuntimeState) => {
  // For simplicity, just call refresh directly for now
  refreshAnciliaryVizWithState(state)
}

// Event handlers that use the current state
const createAVEventHandlers = (state: CanvasRuntimeState) => ({
  onDragMove: () => scheduleAVRefresh(state),
  onTransformEnd: () => refreshAnciliaryVizWithState(state),
  onDestroy: () => scheduleAVRefresh(state)
})

// RAF-throttled scheduler for smooth real-time updates (legacy)
let rafToken: number | null = null

// Call this instead of refreshAVs() directly from event handlers (legacy)
const scheduleAVRefreshLegacy = () => {
  if (rafToken !== null) return // already queued this frame
  rafToken = requestAnimationFrame(() => {
    rafToken = null
    if (activeState) {
      refreshAnciliaryViz(activeState)
    }
  })
}

export const initAVLayer = (state: CanvasRuntimeState) => {
  activeState = state
  if (layer || !stage) return
  layer = new Konva.Layer({ listening: false, name: 'ancillary-vis' })
  stage.add(layer)

  state.layers.ancillaryViz = layer

  // Install global listeners once (events bubble from child nodes)
  if (!listenersInstalled) {
    listenersInstalled = true

    // Real-time position updates during dragging/transforming
    stage.on('dragmove.av transform.av', scheduleAVRefreshLegacy)

    // Final update when interaction ends (ensures perfect positioning)
    stage.on('dragend.av transformend.av', () => {
      if (activeState) {
        refreshAnciliaryViz(activeState)
      }
    })

    // Node removal - automatically cleanup orphaned visualizations
    stage.on('destroy.av', scheduleAVRefreshLegacy)
  }

  stage.batchDraw()
}

// call whenever metadata OR active set changes OR node moved/scaled/…
// we purposely brute-force re-evaluate only top-level nodes for simplicity
export const refreshAnciliaryViz = (state: CanvasRuntimeState) => {
  activeState = state
  if (!stage) return
  initAVLayer(state)
  const roots = collectHierarchy(state.layers.freehandShape).filter(h => h.depth === 0).map(h => h.node)
  const needed = new Map<string, {ctx: AVContext, def: AncillaryVisDefinition}>()

  roots.forEach(node => {
    const md = node.getAttr('metadata') ?? {}
    const bbox = node.getClientRect({ relativeTo: stage })
    const ctx: AVContext = { node, metadata: md, bbox }
    activeAVs.value.forEach(key => {
      const def = REG.get(key)
      if (def && def.validate(ctx)) {
        needed.set(`${key}|${node.id()}`, {ctx, def})
      }
    })
  })

  // remove obsolete visualizations
  nodeToVis.forEach((entry, mapKey) => {
    if (!needed.has(mapKey)) {
      entry.def.destroy?.(entry.vis)
      const visArray = Array.isArray(entry.vis) ? entry.vis : [entry.vis]
      visArray.forEach(n => n.destroy())
      nodeToVis.delete(mapKey)
    }
  })

  // create / update required visualizations
  needed.forEach((need, mapKey) => {
    const existing = nodeToVis.get(mapKey)
    if (!existing) {
      const vis = need.def.create(need.ctx)
      const visArray = Array.isArray(vis) ? vis : [vis]
      visArray.forEach(v => layer!.add(v as any)) // Konva nodes from AV definitions are safe
      nodeToVis.set(mapKey, {def: need.def, vis})
    } else {
      existing.def.update?.(need.ctx, existing.vis)
    }
  })

  layer!.batchDraw()
}

// ------------------------------------------------------------------
// tiny integration hooks
// ------------------------------------------------------------------

// backup original function
const origSetNodeMetadata = setNodeMetadata

// wrapper that includes AV refresh
export const setNodeMetadataWithAV = (
  state: CanvasRuntimeState,
  node: Konva.Node,
  meta: Record<string, any> | undefined
) => {
  origSetNodeMetadata(state, node, meta)
  refreshAnciliaryViz(state)
}

// watch for toggle changes
watch(activeAVs, () => {
  if (activeState) {
    refreshAnciliaryViz(activeState)
  }
}, { deep: true })
