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