// Shared utilities extracted from both freehand and polygon tools
import Konva from "konva"

export const uid = (prefix = 'id_') => `${prefix}${crypto.randomUUID()}`

export const getPointsBounds = (points: number[]) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i])
    maxX = Math.max(maxX, points[i])
    minY = Math.min(minY, points[i + 1])
    maxY = Math.max(maxY, points[i + 1])
  }
  return { minX, maxX, minY, maxY }
}

export const hasAncestorConflict = (nodes: Konva.Node[]): boolean => {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].isAncestorOf(nodes[j]) || nodes[j].isAncestorOf(nodes[i])) return true
    }
  }
  return false
}
