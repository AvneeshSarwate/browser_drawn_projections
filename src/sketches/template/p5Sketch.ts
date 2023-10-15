import { type PulseCircleAppState } from './appState'
import p5 from 'p5'



/**
 * todo template - set up properly scaled mouse interactions to draw/move/delete/select circles
 */

export function createP5Sketch(canvas: HTMLCanvasElement, appState: () => PulseCircleAppState): p5 {

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
      }

      appState().stats.end()
    }
  }

  return new p5(sketch, canvas)
}