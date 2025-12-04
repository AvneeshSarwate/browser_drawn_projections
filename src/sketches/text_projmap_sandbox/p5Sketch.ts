import { type TemplateAppState, resolution } from './appState'
import p5 from 'p5'

export function createP5Sketch(canvas: HTMLCanvasElement, appState: () => TemplateAppState): p5 {

  const sketch = (p: p5) => {

    p.setup = () => {
      p.createCanvas(resolution.width, resolution.height, canvas)
      // p.noSmooth()
      // p.noLoop()
    }

    p.draw = () => {
      appState().stats?.begin()
      if (!appState().paused) {
        p.clear(0, 0, 0, 0)

        appState().drawFunctions.forEach(d => d(p))
        appState().oneTimeDrawFuncs.forEach(d => d(p))
        appState().oneTimeDrawFuncs.length = 0
        appState().drawFuncMap.forEach((d, key) => d(p))
        appState().shaderDrawFunc?.()
      }

      appState().stats?.end()
    }
  }

  return new p5(sketch, canvas)
}
