import type Konva from 'konva'
import type { CanvasRuntimeState } from '../canvasState'
import { collectHierarchyFromRoot, type HierarchyEntry } from './hierarchy'
import { updateMetadataHighlight, updateHoverHighlight } from './highlight'

// Generic metadata toolkit interface
export interface MetadataToolkit {
  /* mutators */
  setNodeMetadata(node: Konva.Node, meta: any): void

  /* tree helpers */
  collectHierarchyFromRoot(nodes: Konva.Node[]): HierarchyEntry[]

  /* highlight helpers */
  updateMetadataHighlight(node?: Konva.Node): void
  updateHoverHighlight(node?: Konva.Node): void
}

// Factory to create a toolkit instance bound to a specific canvas runtime state
export const createMetadataToolkit = (state: CanvasRuntimeState): MetadataToolkit => ({
  setNodeMetadata: (node: Konva.Node, meta: any) => {
    // Set the metadata on the node
    if (meta === undefined || Object.keys(meta).length === 0) {
      node.setAttr('metadata', undefined)   // keep export slim
    } else {
      node.setAttr('metadata', meta)
    }
    // Note: No global event system - specific tools handle their own data sync via callbacks
  },

  collectHierarchyFromRoot,
  updateMetadataHighlight: (node?: Konva.Node) => updateMetadataHighlight(state, node),
  updateHoverHighlight: (node?: Konva.Node) => updateHoverHighlight(state, node)
})
