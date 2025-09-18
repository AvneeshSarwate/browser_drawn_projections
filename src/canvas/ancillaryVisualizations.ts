import Konva from 'konva'
import { watch } from 'vue'
import { collectHierarchy } from './metadata/hierarchy'
import type { AncillaryVisualizationInstance, CanvasRuntimeState } from './canvasState'

// ----- registry types -----
export interface AVContext {
  node: Konva.Node
  metadata: Record<string, any>
  bbox: { x: number, y: number, width: number, height: number }
}

export interface AncillaryVisDefinition {
  key: string
  displayName: string
  validate(ctx: AVContext): boolean
  create(ctx: AVContext): Konva.Node | Konva.Node[]
  update?: (ctx: AVContext, vis: Konva.Node | Konva.Node[]) => void
  destroy?: (vis: Konva.Node | Konva.Node[]) => void
}

const REGISTRY = new Map<string, AncillaryVisDefinition>()
export const registerAV = (def: AncillaryVisDefinition) => REGISTRY.set(def.key, def)
export const getRegisteredAVs = () => Array.from(REGISTRY.values())

const getEntryMap = (state: CanvasRuntimeState): Map<string, AncillaryVisualizationInstance> => {
  return state.ancillary.nodeVisualizations
}

const ensureGroup = (state: CanvasRuntimeState): Konva.Group | undefined => {
  const overlayLayer = state.layers.overlay
  if (!overlayLayer) return undefined

  if (!state.groups.ancillaryViz) {
    const group = new Konva.Group({ listening: false, name: 'ancillary-vis' })
    state.groups.ancillaryViz = group
    overlayLayer.add(group)
  }

  return state.groups.ancillaryViz
}

const scheduleAVRefresh = (state: CanvasRuntimeState) => {
  if (!state.stage) return
  if (state.ancillary.rafToken !== null) return

  state.ancillary.rafToken = requestAnimationFrame(() => {
    state.ancillary.rafToken = null
    refreshAnciliaryViz(state)
  })
}

const installStageListeners = (state: CanvasRuntimeState) => {
  const stage = state.stage
  if (!stage || state.ancillary.listenersAttached) return

  const schedule = () => scheduleAVRefresh(state)

  stage.on('dragmove.av transform.av', schedule)
  stage.on('destroy.av', schedule)
  stage.on('dragend.av transformend.av', () => refreshAnciliaryViz(state))

  state.ancillary.listenersAttached = true
}

const ensureActiveSetWatcher = (state: CanvasRuntimeState) => {
  if (state.ancillary.activeWatchStop) return

  state.ancillary.activeWatchStop = watch(
    () => state.ancillary.activeVisualizations.value,
    () => refreshAnciliaryViz(state),
    { deep: true }
  )
}

export const initAVLayer = (state: CanvasRuntimeState) => {
  if (!state.stage) return

  ensureGroup(state)
  installStageListeners(state)
  ensureActiveSetWatcher(state)

  refreshAnciliaryViz(state)
}

export const refreshAnciliaryViz = (state: CanvasRuntimeState) => {
  const stage = state.stage
  const group = ensureGroup(state)
  if (!stage || !group) return

  const hierarchy = collectHierarchy(state.groups.freehandShape)
  const roots = hierarchy.filter(entry => entry.depth === 0).map(entry => entry.node)

  const needed = new Map<string, { ctx: AVContext, def: AncillaryVisDefinition }>()
  const activeKeys = state.ancillary.activeVisualizations.value

  roots.forEach(node => {
    const metadata = node.getAttr('metadata') ?? {}
    const bbox = node.getClientRect({ relativeTo: stage })
    const ctx: AVContext = { node, metadata, bbox }

    activeKeys.forEach(key => {
      const def = REGISTRY.get(key)
      if (def && def.validate(ctx)) {
        needed.set(`${key}|${node.id()}`, { ctx, def })
      }
    })
  })

  const entries = getEntryMap(state)

  entries.forEach((entry, mapKey) => {
    if (!needed.has(mapKey)) {
      const def = REGISTRY.get(entry.key)
      def?.destroy?.(entry.nodes)
      const visNodes = Array.isArray(entry.nodes) ? entry.nodes : [entry.nodes]
      visNodes.forEach(node => node.destroy())
      entries.delete(mapKey)
    }
  })

  needed.forEach((need, mapKey) => {
    const existing = entries.get(mapKey)
    if (!existing) {
      const vis = need.def.create(need.ctx)
      const nodes = (Array.isArray(vis) ? vis : [vis]) as Konva.Node[]
      nodes.forEach(node => {
        if (node instanceof Konva.Group || node instanceof Konva.Shape) {
          group.add(node)
        } else {
          console.warn('Ancillary visualization produced unsupported node type', node)
        }
      })
      entries.set(mapKey, { key: need.def.key, nodes: vis })
    } else {
      need.def.update?.(need.ctx, existing.nodes)
    }
  })

  group.getLayer()?.batchDraw()
}
