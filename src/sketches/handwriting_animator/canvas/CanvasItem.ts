import Konva from "konva"
import type { FreehandStroke } from "./freehandTool"
import { uid } from "./canvasUtils"
import { getGlobalCanvasState, type CanvasRuntimeState } from "./canvasState"

export type ItemType = 'stroke' | 'strokeGroup' | 'polygon'

export interface CanvasItem {
  id: string
  type: ItemType
  konvaNode: Konva.Node
  getBounds(): { minX: number, maxX: number, minY: number, maxY: number }
  getMetadata(): Record<string, any> | undefined
  setMetadata(meta: Record<string, any> | undefined): void
}

// State-based factory functions
export const createStrokeItem = (state: CanvasRuntimeState, shape: Konva.Path, strokeData?: FreehandStroke): CanvasItem => {
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
  
  state.canvasItems.set(item.id, item)
  return item
}

export const createGroupItem = (state: CanvasRuntimeState, group: Konva.Group): CanvasItem => {
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
  
  state.canvasItems.set(item.id, item)
  return item
}

export const createPolygonItem = (state: CanvasRuntimeState, line: Konva.Line): CanvasItem => {
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
  
  state.canvasItems.set(item.id, item)
  return item
}

// State-based helper functions  
export const getCanvasItemFromState = (state: CanvasRuntimeState, node: Konva.Node): CanvasItem | undefined => {
  return state.canvasItems.get(node.id())
}

export const removeCanvasItemFromState = (state: CanvasRuntimeState, id: string) => {
  state.canvasItems.delete(id)
}

// TEMPORARY FALLBACK WRAPPERS - REMOVE IN PHASE 7
export const fromStroke = (shape: Konva.Path, strokeData?: FreehandStroke): CanvasItem => {
  return createStrokeItem(getGlobalCanvasState(), shape, strokeData)
}

export const fromGroup = (group: Konva.Group): CanvasItem => {
  return createGroupItem(getGlobalCanvasState(), group)
}

export const fromPolygon = (line: Konva.Line): CanvasItem => {
  return createPolygonItem(getGlobalCanvasState(), line)
}

export const getCanvasItem = (node: Konva.Node): CanvasItem | undefined => {
  return getCanvasItemFromState(getGlobalCanvasState(), node)
}

export const removeCanvasItem = (id: string) => {
  removeCanvasItemFromState(getGlobalCanvasState(), id)
}
