import { findClosestPointAndRegion, type AppState } from '@/stores/stores'
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

function createP5Sketch(canvas: HTMLCanvasElement, appState: () => AppState) {
  const sketch = (p: p5) => {

    p.setup = () => {
      p.createCanvas(1280, 720, canvas)
      // p.noLoop()
    }

    p.draw = () => {
      appState().regions.list.forEach((region) => {
        region.draw(p)
      })
    }

    p.keyPressed = () => {
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
    }
    return new p5(sketch, canvas)
  }

  return sketch
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
