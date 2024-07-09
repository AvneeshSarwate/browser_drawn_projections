import React, { useEffect, useLayoutEffect, useRef } from 'react'
import {
  Tldraw,
  useEditor,
  type Editor,
  type TLDrawShape,
  type TLGeoShape,
  getDefaultColorTheme,
  DefaultCanvas
} from 'tldraw'
import 'tldraw/tldraw.css'
import type p5 from 'p5';

interface MyTldrawWrapperProps {
  onEditorReady: (editor: Editor) => void
}

export const MyTldrawWrapper: React.FC<MyTldrawWrapperProps> = ({
  onEditorReady
}: MyTldrawWrapperProps): React.ReactNode => {
  // useLayoutEffect(() => {
  //   // Hide the regular shapes layer using CSS.
  //   const script = document.createElement('style')
  //   if (!script) return
  //   script.innerHTML = `.tl-shapes { display: none; }`
  //   document.body.appendChild(script)
  //   return () => {
  //     script.remove()
  //   }
  // }, [])

  return (
    // React.createElement('div', { className: 'tldraw__editor' },
    React.createElement(Tldraw, {
      persistenceKey: 'example',
      components: {
        Background: () => React.createElement(CustomRenderer, { onEditorReady }),
        Canvas: DefaultCanvas
      }
    })
    // )
  )
}

export function RendererWrapper(props: MyTldrawWrapperProps) {
  return React.createElement(CustomRenderer, props)
}

export function CustomRenderer(props: MyTldrawWrapperProps) {
  const editor = useEditor()
  const rCanvas = useRef<HTMLCanvasElement>(null)
  props.onEditorReady(editor);

  return React.createElement('canvas', { ref: rCanvas })
}


function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const result = Array.from({ length: 3 }, () => Array(3).fill(0));

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }

  return result;
}

function applyMatrix(matrix: number[][], pt: {x: number, y: number}): {x: number, y: number} {
  return {
    x: matrix[0][0] * pt.x + matrix[0][1] * pt.y + matrix[0][2],
    y: matrix[1][0] * pt.x + matrix[1][1] * pt.y + matrix[1][2]
  }
}

function cameraTransform(editor: Editor): number[][] {
  const camera = editor.getCamera()

  const scaleMatrix = [
    [camera.z, 0, 0],
    [0, camera.z, 0],
    [0, 0, 1]
  ];
  
  const translationMatrix = [
    [1, 0, camera.x],
    [0, 1, camera.y],
    [0, 0, 1]
  ];

  return multiplyMatrices(scaleMatrix, translationMatrix)
}

function shapeTransform(shape: TLDrawShape): number[][] {
  const translationMatrix = [
    [1, 0, shape.x],
    [0, 1, shape.y],
    [0, 0, 1]
  ];

  const rotationMatrix = [
    [Math.cos(shape.rotation), -Math.sin(shape.rotation), 0],
    [Math.sin(shape.rotation), Math.cos(shape.rotation), 0],
    [0, 0, 1]
  ];

  return multiplyMatrices(translationMatrix, rotationMatrix)
}
 

export function getFreehandShapes(editor: Editor) {
  const shapes: {x: number, y: number}[][] = []
  const renderingShapes = editor.getRenderingShapes()

  for (const { shape, opacity, util } of renderingShapes) {
    const shapePts: {x: number, y: number}[] = []

    if (editor.isShapeOfType<TLDrawShape>(shape, 'draw')) {

      const totalTransform = multiplyMatrices(cameraTransform(editor), shapeTransform(shape))
      
      for (const segment of shape.props.segments) {
        for (const point of segment.points) {
          const transformedPt = applyMatrix(totalTransform, point)
          shapePts.push(transformedPt)
        }
      }

      shapes.push(shapePts)
    }
  }

  return shapes
}

export function p5FreehandTldrawRender(editor: Editor, p5: p5) {
  p5.push()
  
  const camera = editor.getCamera()
  p5.scale(camera.z, camera.z)
  p5.translate(camera.x, camera.y)
  
  // const screenBounds = editor.getViewportScreenBounds()
  // p5.translate(-screenBounds.minX, -screenBounds.minY)

  // const screenCenter = editor.getViewportScreenCenter()
  // p5.translate(-screenCenter.x, -screenCenter.y)

  // camera.

  const renderingShapes = editor.getRenderingShapes()

  for (const { shape, opacity, util } of renderingShapes) {
    if (editor.isShapeOfType<TLDrawShape>(shape, 'draw')) {
      p5.push()

      p5.stroke(255)
      p5.noFill()
      p5.strokeWeight(4)

      p5.beginShape()
      if (shape.props.fill !== 'none' && shape.props.isClosed) {
        p5.fill(shape.props.color)
      }
      
      p5.translate(shape.x, shape.y)
      p5.rotate(shape.rotation)
      
      for (const segment of shape.props.segments) {
        if (segment.type === 'straight') {
          p5.vertex(segment.points[0].x, segment.points[0].y)
          p5.vertex(segment.points[1].x, segment.points[1].y)
        } else {
          for (const point of segment.points) {
            p5.vertex(point.x, point.y)
          }
        }
      }
      p5.endShape()
      p5.pop()
    }
  }
  
}