import { findClosestPointAndRegion, type AppState, Region } from '@/stores/stores'
import p5 from 'p5'
import * as THREE from 'three'

export function createP5Sketch(canvas: HTMLCanvasElement, appState: () => AppState): p5 {

  const sketch = (p: p5) => {

    let newRegion: Region | undefined = undefined

    p.setup = () => {
      p.createCanvas(1280, 720, canvas)
      // p.noLoop()
    }

    p.draw = () => {
      appState().stats.begin()

      p.push()  
        p.fill(0)
        p.rect(0, 0, p.width, p.height)
      p.pop()
      appState().regions.list.forEach((region) => {
        region.draw(p)
      })
      appState().drawFunctions.forEach(d => d(p))
      const savedActiveRegion = appState().regions.list.find((region) => region.isActive)
      const activeRegion = savedActiveRegion || newRegion
      if (activeRegion) {
        p.ellipse(p.mouseX, p.mouseY, 10, 10)
      }
      p.ellipse(p.mouseX, p.mouseY, 130, 130)

      appState().stats.end()
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


const errorImageTexture = new THREE.TextureLoader().load('src/assets/error.jpg')
const defaultRenderTarget = new THREE.WebGLRenderTarget(1280, 720)
// const renderer = new THREE.WebGLRenderer({canvas: document.getElementById('threeCanvas') as HTMLCanvasElement})

abstract class ShaderEffect {
  abstract setSrcs(fx: (ShaderEffect|HTMLCanvasElement)[]): void
  abstract render(renderer: THREE.WebGLRenderer): void
  output: THREE.WebGLRenderTarget = defaultRenderTarget
  width: number = 1280
  height: number = 720
  public inputs: (ShaderEffect | HTMLCanvasElement)[] = []
  public dispose(): void {
    this.output.dispose()
  }
  public disposeAll(): void {
    this.dispose()
    this.inputs.forEach((input) => {
      if (input instanceof ShaderEffect) {
        input.disposeAll()
      }
    })
  }
  public renderAll(renderer: THREE.WebGLRenderer): void {
    this.inputs.forEach((input) => {
      if (input instanceof ShaderEffect) {
        input.renderAll(renderer)
      }
    })
    this.render(renderer)
  }
}

class FeedbackNode extends ShaderEffect {
  public width: number
  public height: number
  public output: THREE.WebGLRenderTarget

  public inputs: ShaderEffect[] = []
  public input: ShaderEffect
  constructor(fx: ShaderEffect) {
    super()
    this.input = fx
    this.inputs = [fx]
    this.width = fx.width
    this.height = fx.height
    this.output = new THREE.WebGLRenderTarget(this.width, this.height)
  }

  setSrcs(fx: (ShaderEffect | HTMLCanvasElement)[]): void {
    if (!fx[0]) {
      console.log('no input to feedback node')
      return
    }
    if (!(fx[0] instanceof ShaderEffect)) {
      console.log('input to feedback node is not a ShaderEffect')
      return
    }
    this.input = fx[0] as ShaderEffect
  }

  render(): void { }
  public dispose(): void { }
  public disposeAll(): void { }
}

class Pingpong {
  public src: THREE.WebGLRenderTarget
  public dst: THREE.WebGLRenderTarget
  public swap() {
    const temp = this.src
    this.src = this.dst
    this.dst = temp
  }
  constructor(src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget) {
    this.src = src
    this.dst = dst
  }
}

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
}`

const passThruFS = glsl`
precision highp float;

varying vec2 vUV;

uniform sampler2D tex;

void main() {
  gl_FragColor = texture2D(tex, vUV);
}`

class CustomShaderEffect extends ShaderEffect {
  output: THREE.WebGLRenderTarget
  width: number
  height: number
  scene: THREE.Scene
  camera: THREE.Camera
  inputs: (ShaderEffect | HTMLCanvasElement)[] = []
  material: THREE.ShaderMaterial
  inputArgNames: string[] = []
  constructor(fsString: string, inputArgs: string[], width = 1280, height = 720) {
    super()
    this.output = new THREE.WebGLRenderTarget(width, height)
    this.width = width
    this.height = height
    //a scene with an orthographic camera, a single plane, and a shader material
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)
    const uniforms: any = {}
    inputArgs.forEach((argName, i) => {
      this.inputArgNames.push(argName)
      uniforms[argName] = { value: errorImageTexture }
    })
    this.material = new THREE.ShaderMaterial({
      vertexShader: planeVS,
      fragmentShader: fsString,
      uniforms: uniforms
    })
    const mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(mesh)
  }

  setShader(fragmentString: string): void {
    this.material.fragmentShader = fragmentString
    this.material.needsUpdate = true
  }

  setSrcs(fx: (ShaderEffect | HTMLCanvasElement)[]): void {
    this.inputs = fx
    for (let i = 0; i < Math.min(4, fx.length); i++) {
      const input = fx[i] ? fx[i] : errorImageTexture
      const inputVal = input instanceof ShaderEffect ? (input as ShaderEffect).output.texture : input
      this.material.uniforms['text'+i].value = inputVal
    }
  }
  render(renderer: THREE.WebGLRenderer): void {
    //render to the output
    renderer.setRenderTarget(this.output)
    renderer.render(this.scene, this.camera)
  }
}

class CustomFeedbackShaderEffect extends CustomShaderEffect {
  pingpong: Pingpong
  constructor(fsString: string, inputArgs: string[], width = 1280, height = 720) {
    super(fsString, inputArgs, width, height)
    this.pingpong = new Pingpong(this.output, new THREE.WebGLRenderTarget(width, height))
    this.material.uniforms['backbuffer'].value = this.pingpong.src.texture
  }

  render(renderer: THREE.WebGLRenderer): void {
    //render to the output
    renderer.setRenderTarget(this.pingpong.dst)
    renderer.render(this.scene, this.camera)
    this.pingpong.swap()
    this.material.uniforms['backbuffer'].value = this.pingpong.src.texture
  }
}

class Passthru extends CustomShaderEffect {
  constructor(width = 1280, height = 720) {
    super(passThruFS, ['input'], width, height)
  }

  setSrcs(fx: (ShaderEffect | HTMLCanvasElement)[]): void {
    this.inputs = fx
    const input = fx[0] ? fx[0] : errorImageTexture
    const inputVal = input instanceof ShaderEffect ? (input as ShaderEffect).output.texture : input
    this.material.uniforms.tex.value = inputVal
  }
}

