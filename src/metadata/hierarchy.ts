import Konva from 'konva'

// Hierarchy utility for metadata editing
export interface HierarchyEntry {
  node: Konva.Node        // actual Konva node
  depth: number           // depth == indent level (50px each)
  indexPath: string       // e.g. "0/3/1" – handy for v-key
}

export const collectHierarchyFromRoot = (rootNodes: Konva.Node[]): HierarchyEntry[] => {
  const out: HierarchyEntry[] = []

  const walk = (node: Konva.Node, depth = 0, path = '') => {
    out.push({ node, depth, indexPath: path })

    if (node instanceof Konva.Group) {
      node.getChildren().forEach((child, i) =>
        walk(child, depth + 1, path ? `${path}/${i}` : `${i}`)
      )
    }
  }

  rootNodes.forEach((node, i) => walk(node, 0, `${i}`))
  return out
}

// For compatibility with existing freehandTool code
export const collectHierarchy = (layer?: Konva.Layer): HierarchyEntry[] => {
  if (!layer) return []
  return collectHierarchyFromRoot(layer.getChildren())
}
