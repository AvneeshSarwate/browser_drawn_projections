import { findClosestPointAndRegion, type AppState, Region } from '@/stores/stores'
import * as BABYLON from 'babylonjs'
import p5 from 'p5'


//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x

const planeVS = glsl`
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 worldViewProjection;

varying vec2 vUV;

void main() {
  vec4 p = vec4(position, 1.);
  gl_Position = worldViewProjection * p;
  vUV = uv;
}
`

const passThruFS = glsl`
precision highp float;

varying vec2 vUV;

uniform sampler2D tex;

void main() {
  gl_FragColor = texture2D(tex, vUV);
}
`



class Pingpong {
  public src: BABYLON.RenderTargetTexture
  public dst: BABYLON.RenderTargetTexture
  public swap() {
    const temp = this.src
    this.src = this.dst
    this.dst = temp
  }
  constructor(src: BABYLON.RenderTargetTexture, dst: BABYLON.RenderTargetTexture) {
    this.src = src
    this.dst = dst
  }
}


//utility class with ts-ignore annotations to allow for creating a 
//p5 instance that takes an argument to its draw call but still
//generally gives us typing when defining a sketch in the instance
// export class p5DrawArgs extends p5 {
//   constructor(sketch: (p: p5) => void, canvas: HTMLCanvasElement) {
//     super(sketch, canvas)
//   }
//   // @ts-ignore
//   public draw(appState: AppState) {
//     // @ts-ignore
//     super.draw(appState)
//   }
// }

export function createP5Sketch(canvas: HTMLCanvasElement, appState: () => AppState) {
  const sketch = (p: p5) => {

    let newRegion: Region | undefined = undefined

    p.setup = () => {
      p.createCanvas(1280, 720, canvas)
      // p.noLoop()
    }

    p.draw = () => {
      p.clear(0,0,0,255)
      appState().regions.list.forEach((region) => {
        region.draw(p)
      })
      const savedActiveRegion = appState().regions.list.find((region) => region.isActive)
      const activeRegion = savedActiveRegion || newRegion
      if (activeRegion) {
        p.ellipse(p.mouseX, p.mouseY, 10, 10)
      }
    }

    p.keyPressed = () => {
      console.log("key pressed", p.key, p.keyCode)
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
          newRegion = new Region(p)
          newRegion.drawMode = 'addingPoint'
        }
      }
      if (p.keyCode === 32) { //spacebar
        const savedActiveRegion = state.regions.list.find((region) => region.isActive)
        const activeRegion = savedActiveRegion || newRegion
        console.log('enter', activeRegion)
        if (activeRegion?.drawMode === 'addingPoint') {
          console.log('adding point', p.mouseX, p.mouseY)
          const newPt = new p5.Vector(p.mouseX, p.mouseY)
          activeRegion.points.list.push(newPt)
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


class SceneModule {
  public scene: BABYLON.Scene
  public update: (appState: AppState) => void
  public renderTarget: () => BABYLON.RenderTargetTexture
  constructor(scene: BABYLON.Scene, update: (appState: AppState) => void, renderTarget: () => BABYLON.RenderTargetTexture) {
    this.scene = scene
    this.update = update
    this.renderTarget = renderTarget
  }
}


// export function createScene(canvas: HTMLCanvasElement) {

  
// }



// export function render(appState: AppState) {
  
//   window.requestAnimationFrame(() => {
   
//   })
// }
