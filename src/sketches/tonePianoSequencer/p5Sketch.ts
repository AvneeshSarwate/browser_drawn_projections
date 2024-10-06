import { type ToneSeqAppState } from './appState'
import p5 from 'p5'

export function createP5Sketch(canvas: HTMLCanvasElement, appState: () => ToneSeqAppState): p5 {

  const sketch = (p: p5) => {

    p.setup = () => {
      p.createCanvas(1280, 720, canvas)
      p.noSmooth()
      p.background(0, 0.278, 0.733)
      // p.noLoop()
    }

    p.draw = () => {
      appState().stats.begin()
      if (!appState().paused) {
        p.clear(0, 0.278, 0.733, 0)
        p.background(0, 0.278, 0.733)

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