import {
  createShapeId,
  ShapeUtil,
  StateNode,
  type TLBaseShape,
  type TLClickEventInfo,
  type TLHandle,
  type TLOnResizeHandler,
  type TLShapeId
} from 'tldraw'
import * as React from 'react'

// Define the shape type with props
type MultiSegmentLineShape = TLBaseShape<
  'multiSegmentLine',
  {
    points: { x: number; y: number }[]
  }
>

import { Polyline2d } from 'tldraw'

// Function to calculate the bounds of a polyline
function getPolylineBounds(points: { x: number; y: number }[]): Polyline2d {
  // Convert the points to Vec instances
  const vecPoints = points.map((point) => new Vec(point.x, point.y))

  // Create a Polyline2d instance which will automatically calculate the bounds
  return new Polyline2d({ points: vecPoints })
}

// Extend ShapeUtil to manage our custom shape
export class MultiSegmentLineUtil extends ShapeUtil<MultiSegmentLineShape> {
  static type = 'multiSegmentLine'

  // Default shape properties
  getDefaultProps(): MultiSegmentLineShape['props'] {
    return {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      ]
    }
  }

  // Render the shape as an SVG polyline
  component(shape: MultiSegmentLineShape) {
    const pointsString = shape.props.points.map((p) => `${p.x},${p.y}`).join(' ')
    return React.createElement( //todo - some how add "tl-svg-container" on the svg div to get it to show up
      'svg',
      {className: 'tl-svg-container'},
      null,
      React.createElement('polyline', {
        points: pointsString,
        stroke: 'black',
        fill: 'none'
      })
    )
  }

  onHandleDragStart(shape: MultiSegmentLineShape, handle: TLHandle) {
    console.log('onHandleDragStart', shape, handle)
  }
  // Get the geometry for hit detection
  getGeometry(shape: MultiSegmentLineShape) {
    const points = shape.props.points.map((p) => new Vector2(p.x, p.y))
    return getPolylineBounds(points)
  }

  //also add resize rules - https://tldraw.dev/examples/shapes/tools/shape-with-geometry
  override canResize = () => {
    return true
  }

  // Render the outline of the shape when selected
  indicator(shape: MultiSegmentLineShape) {
    const pointsString = shape.props.points.map((p) => `${p.x},${p.y}`).join(' ')
    return React.createElement('polyline', {
      points: pointsString,
      stroke: 'blue',
      fill: 'none',
      strokeDasharray: '4'
    })
  }
}

import { type TLPointerEventInfo, Vec } from 'tldraw'
import { Vector2 } from 'three'

export class MultiSegmentLineTool extends StateNode {
static id = 'multiSegmentLine';
  shapeId?: TLShapeId
  isDragging = false
  draggedPointIndex: number | null = null

  // Handle pointer down to either create a new point or start dragging an existing point
  override onPointerDown = (info: TLPointerEventInfo) => {
    const { editor } = this
    const point = { x: info.point.x, y: info.point.y }

    console.log('multiSegmentLineTool onPointerDown', info)

    //todo wrap with editor.history.batch
    if (!this.shapeId) {
      // Create a new shape if none is active
      const newShapeId = createShapeId('multiSegmentLine')
      console.log('multiSegmentLineTool onPointerDown creating new shape', newShapeId)
      editor.createShape({
        type: 'multiSegmentLine',
        props: { points: [point] },
        id: newShapeId
      })
      this.shapeId = newShapeId
    } else {
      const shape = editor.getShape<MultiSegmentLineShape>(this!.shapeId)
      if (shape) {
        // Add the new point to the current shape
        editor.updateShapes([
          { id: shape.id, type: shape.type, props: { points: [...shape.props.points, point] } }
        ])
      }
    }
  }

  // Handle pointer move to drag points
  onPointerMove = (info: TLPointerEventInfo) => {
    //todo wrap with editor.history.batch
    if (this.shapeId && this.isDragging && this.draggedPointIndex !== null) {
      const shape = this.editor.getShape<MultiSegmentLineShape>(this.shapeId)!
      const newPoints = [...shape.props.points]
      newPoints[this.draggedPointIndex] = { x: info.point.x, y: info.point.y }
      this.editor.updateShapes([{ ...shape, props: { points: newPoints } }])
    }
  }

  onPointerUp = () => {
    this.isDragging = false
    this.draggedPointIndex = null
  }

  onDoubleClick = (info: TLClickEventInfo) => {
    const { editor } = this
    const shape = editor.getShape<MultiSegmentLineShape>(this.shapeId!)!

    // Find the index of the point being dragged
    const pointIndex = shape.props.points.findIndex((p) => Vec.Dist(p, info.point) < 10)
    if (pointIndex !== -1) {
      this.isDragging = true
      this.draggedPointIndex = pointIndex
    }
  }

  onEscape() {
    this.shapeId = undefined
    this.isDragging = false
    this.draggedPointIndex = null
  }
}

// Custom icon using React.createElement
export function MultiSegmentLineIcon() {
  return React.createElement(
    'svg',
    { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor' },
    React.createElement('polyline', {
      points: '4,6 12,12 20,18',
      strokeWidth: 2,
      strokeLinecap: 'round'
    })
  )
}

import {
  DefaultKeyboardShortcutsDialog,
  DefaultKeyboardShortcutsDialogContent,
  DefaultToolbar,
  DefaultToolbarContent,
  type TLComponents,
  type TLUiOverrides,
  TldrawUiMenuItem,
  useIsToolSelected,
  useTools
} from 'tldraw'

// Define the UI overrides for tools
export const uiOverrides: TLUiOverrides = {
  tools: function (editor, tools) {
    // Add the custom tool (Multi-Segment Line) to the toolbar
    tools.multiSegmentLine = {
      id: 'multiSegmentLine',
      icon: 'color',
      label: 'Multi-Segment Line',
      kbd: 'm',
      onSelect: function () {
        editor.setCurrentTool('multiSegmentLine')
      }
    }
    return tools
  }
}

// Define the custom UI components (toolbar and keyboard shortcuts dialog)
export const components: TLComponents = {
  Toolbar: function (props) {
    const tools = useTools()
    const multiSegmentTool = tools['multiSegmentLine']
    const isMultiSegmentLineSelected = multiSegmentTool
      ? useIsToolSelected(multiSegmentTool)
      : false
    console.log('multiSegmentTool', multiSegmentTool, tools)
    console.log('isMultiSegmentLineSelected', isMultiSegmentLineSelected)
    return React.createElement(
      DefaultToolbar,
      props,
      multiSegmentTool
        ? React.createElement(TldrawUiMenuItem, {
            ...multiSegmentTool,
            isSelected: isMultiSegmentLineSelected
          })
        : null, // Only render if the tool exists
      React.createElement(DefaultToolbarContent, null)
    )
  },
  KeyboardShortcutsDialog: function (props) {
    const tools = useTools()
    return React.createElement(
      DefaultKeyboardShortcutsDialog,
      props,
      React.createElement(TldrawUiMenuItem, tools['multiSegmentLine']),
      React.createElement(DefaultKeyboardShortcutsDialogContent, null)
    )
  }
}
