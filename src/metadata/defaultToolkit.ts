import type Konva from 'konva'
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

// Default implementation that works for every tool
export const defaultMetadataToolkit: MetadataToolkit = {
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
  updateMetadataHighlight,
  updateHoverHighlight
}

// Export for direct use
export const metadataToolkit = defaultMetadataToolkit
