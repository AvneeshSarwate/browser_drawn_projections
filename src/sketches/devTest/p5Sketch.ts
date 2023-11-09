import { findClosestPointAndRegion, type DevelopmentAppState, Region, stats } from './developmentAppState'
import p5 from 'p5'

export function createP5Sketch(canvas: HTMLCanvasElement, appState: () => DevelopmentAppState): p5 {

  const sketch = (p: p5) => {

    let newRegion: Region | undefined = undefined

    p.setup = () => {
      p.createCanvas(1280, 720, canvas)
      p.noSmooth()
      // p.noLoop()
      // appState().stats.begin()
    }

    p.draw = () => {
      // stats.update()
      stats.begin()
      // const start = stats.beginTime 
      if (!appState().paused) {
        p.clear(0, 0, 0, 0)

        appState().regions.list.forEach((region) => {
          region.draw(p)
        })

        const savedActiveRegion = appState().regions.list.find((region) => region.isActive)
        const activeRegion = savedActiveRegion || newRegion
        
        if (activeRegion) {
          //todo refactor - using naive p5 mouse coordinates wont work if threeCanvas is fullscreened, use io utilities
          p.ellipse(p.mouseX, p.mouseY, 10, 10)
        }

        appState().drawFuncMap.forEach(d => d(p))
        appState().drawFunctions.forEach(d => d(p))
      }

      const end = stats.end()
      // console.log('draw time',start, end, end - start)
    }

    p.keyPressed = () => {
      // console.log("key pressed", p.key, p.keyCode)
      const state = appState()
      if (p.key === 'g') {
        const ptAndRegion = findClosestPointAndRegion(p, state.regions)
        if (ptAndRegion) {
          const region = ptAndRegion[1]
          const ptIdx = ptAndRegion[0]
          switch (region.drawMode) {
            case 'display':
              ptAndRegion[1].grabPointIdx = ptIdx
              ptAndRegion[1].drawMode = 'movingPoint'
              break
            case 'movingPoint':
              ptAndRegion[1].grabPointIdx = undefined
              ptAndRegion[1].drawMode = 'display'
              break
          }
        }
      }
      if (p.key === 'p') {
        const activeRegion = state.regions.list.find((region) => region.isActive)
        if (activeRegion?.drawMode === 'movingPoint' && activeRegion.grabPointIdx !== undefined) {
          activeRegion.points.setItem(new p5.Vector(p.mouseX, p.mouseY), activeRegion.grabPointIdx)
          activeRegion.grabPointIdx = undefined
          activeRegion.drawMode = 'display'
        }
      }
      if (p.key === 'd') {
        const activeRegion = state.regions.list.find((region) => region.isActive)
        if (activeRegion) {
          activeRegion.drawMode = 'addingPoint'
        } else {
          newRegion = new Region()
          newRegion.drawMode = 'addingPoint'
        }
      }
      if (p.keyCode === 32) { //spacebar
        const savedActiveRegion = state.regions.list.find((region) => region.isActive)
        const activeRegion = savedActiveRegion || newRegion
        // console.log('enter', activeRegion)
        if (activeRegion?.drawMode === 'addingPoint') {
          // console.log('adding point', p.mouseX, p.mouseY)
          const newPt = new p5.Vector(p.mouseX, p.mouseY)
          activeRegion.points.pushItem(newPt)
          if (activeRegion.points.list.length == 1) {
            state.regions.pushItem(activeRegion)
            newRegion = undefined
          }
        }
      }
      if (p.keyCode === 27) { //escape
        const activeRegion = state.regions.list.find((region) => region.isActive)
        if (activeRegion) {
          activeRegion.drawMode = 'display'
        }
        newRegion = undefined
      } 
    }
  }

  return new p5(sketch, canvas)
}