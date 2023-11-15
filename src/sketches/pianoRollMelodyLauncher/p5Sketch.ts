import { type ClickAVAppState } from './appState'
import p5 from 'p5'

export function createP5Sketch(canvas: HTMLCanvasElement, appState: () => ClickAVAppState): p5 {

  const sketch = (p: p5) => {

    p.setup = () => {
      p.createCanvas(1280, 720, canvas)
      p.noSmooth()
      // p.noLoop()
    }

    p.draw = () => {
      appState().stats.begin()
      if (!appState().paused) {
        p.clear(0, 0, 0, 0)

        appState().drawFunctions.forEach(d => d(p))
        appState().oneTimeDrawFuncs.forEach(d => d(p))
        appState().oneTimeDrawFuncs.length = 0
        appState().drawFuncMap.forEach((d, key) => d(p))
        appState().shaderDrawFunc?.()
      }

      appState().stats.end()
    }
  }

  return new p5(sketch, canvas)
}