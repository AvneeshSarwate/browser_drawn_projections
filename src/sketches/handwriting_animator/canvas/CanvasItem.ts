import Konva from "konva"
import type { FreehandStroke } from "./freehandTool"
import { uid } from "./canvasUtils"

export type ItemType = 'stroke' | 'strokeGroup' | 'polygon'

export interface CanvasItem {
  id: string
  type: ItemType
  konvaNode: Konva.Node
  getBounds(): { minX: number, maxX: number, minY: number, maxY: number }
  getMetadata(): Record<string, any> | undefined
  setMetadata(meta: Record<string, any> | undefined): void
}

// Global registry of all canvas items
export const canvasItemRegistry = new Map<string, CanvasItem>()

// Factory functions
export const fromStroke = (shape: Konva.Path, strokeData?: FreehandStroke): CanvasItem => {
  if (!shape.id()) {
    shape.id(uid('stroke_'))
  }
  const item: CanvasItem = {
    id: shape.id(),
    type: 'stroke',
    konvaNode: shape,
    getBounds() {
      const clientRect = shape.getClientRect()
      return {
        minX: clientRect.x,
        maxX: clientRect.x + clientRect.width,
        minY: clientRect.y,
        maxY: clientRect.y + clientRect.height
      }
    },
    getMetadata() {
      return shape.getAttr('metadata')
    },
    setMetadata(meta: Record<string, any> | undefined) {
      if (meta === undefined || Object.keys(meta).length === 0) {
        shape.setAttr('metadata', undefined)
      } else {
        shape.setAttr('metadata', meta)
      }
    }
  }
  
  canvasItemRegistry.set(item.id, item)
  return item
}

export const fromGroup = (group: Konva.Group): CanvasItem => {
  if (!group.id()) {
    group.id(uid('group_'))
  }
  const item: CanvasItem = {
    id: group.id(),
    type: 'strokeGroup',
    konvaNode: group,
    getBounds() {
      const clientRect = group.getClientRect()
      return {
        minX: clientRect.x,
        maxX: clientRect.x + clientRect.width,
        minY: clientRect.y,
        maxY: clientRect.y + clientRect.height
      }
    },
    getMetadata() {
      return group.getAttr('metadata')
    },
    setMetadata(meta: Record<string, any> | undefined) {
      if (meta === undefined || Object.keys(meta).length === 0) {
        group.setAttr('metadata', undefined)
      } else {
        group.setAttr('metadata', meta)
      }
    }
  }
  
  canvasItemRegistry.set(item.id, item)
  return item
}

export const fromPolygon = (line: Konva.Line): CanvasItem => {
  if (!line.id()) {
    line.id(uid('poly_'))
  }
  const item: CanvasItem = {
    id: line.id(),
    type: 'polygon',
    konvaNode: line,
    getBounds() {
      const clientRect = line.getClientRect()
      return {
        minX: clientRect.x,
        maxX: clientRect.x + clientRect.width,
        minY: clientRect.y,
        maxY: clientRect.y + clientRect.height
      }
    },
    getMetadata() {
      return line.getAttr('metadata')
    },
    setMetadata(meta: Record<string, any> | undefined) {
      if (meta === undefined || Object.keys(meta).length === 0) {
        line.setAttr('metadata', undefined)
      } else {
        line.setAttr('metadata', meta)
      }
    }
  }
  
  canvasItemRegistry.set(item.id, item)
  return item
}

// Helper to get CanvasItem from Konva node
export const getCanvasItem = (node: Konva.Node): CanvasItem | undefined => {
  return canvasItemRegistry.get(node.id())
}

// Helper to remove item from registry
export const removeCanvasItem = (id: string) => {
  canvasItemRegistry.delete(id)
}
