import * as THREE from 'three'
import { planeVS } from './vertexShaders'

export const errorImageTexture = new THREE.TextureLoader().load('src/assets/error.jpg')


export type ShaderSource = THREE.Texture | THREE.WebGLRenderTarget | HTMLCanvasElement | ShaderEffect | OffscreenCanvas;
export type ShaderInputs = {
  [key: string]: ShaderSource
};

type ThreeVector = THREE.Vector2 | THREE.Vector3 | THREE.Vector4;
type ThreeMatrix = THREE.Matrix3 | THREE.Matrix4;
type ThreeColor = THREE.Color;
type ThreeVectorArray = ThreeVector[];

export type Dynamic<T> = T | (() => T)
export type ShaderUniform = number | number[] | ThreeVector | ThreeMatrix | ThreeColor | ThreeVectorArray | THREE.Texture | THREE.WebGLRenderTarget
export type ShaderUniforms = {
  [key: string]: Dynamic<ShaderUniform>
}

function extract<T>(dyn: Dynamic<T>): T {
  return dyn instanceof Function ? dyn() : dyn
}

export abstract class ShaderEffect {
  abstract setSrcs(fx: ShaderInputs): void
  abstract render(renderer: THREE.WebGLRenderer): void
  abstract setUniforms(uniforms: ShaderUniforms): void
  abstract updateUniforms(): void
  abstract output: THREE.WebGLRenderTarget
  public debugId: string = "unset"
  effectName: string = "unset"
  width: number = 1280
  height: number = 720
  inputs: ShaderInputs = {}
  uniforms: ShaderUniforms = {}
  abstract dispose(): void
  disposeAll(): void {
    this.dispose()
    for (const key in this.inputs) {
      const input = this.inputs[key]
      if (input instanceof ShaderEffect) {
        input.disposeAll()
      }
    }
  }
  renderAll(renderer: THREE.WebGLRenderer): void {
    for (const key in this.inputs) {
      const input = this.inputs[key]
      if (input instanceof ShaderEffect) {
        input.renderAll(renderer)
      }
    }
    this.render(renderer)
  }
}

export class FeedbackNode extends ShaderEffect {
  output: THREE.WebGLRenderTarget
  _passthru: Passthru
  feedbackSrc?: ShaderEffect
  firstRender = true

  constructor(startState: ShaderEffect) {
    super()
    this.inputs = {initialState: startState}
    this.width = startState.width
    this.height = startState.height
    this.output = halfTarget(this.width, this.height, 'linear')
    this._passthru = new Passthru({src: startState.output}, this.width, this.height, this.output)
  }

  setFeedbackSrc(fx: ShaderEffect): void {
    this.feedbackSrc = fx
  }

  setSrcs(fx: {initialState: ShaderEffect}): void {
    if (!fx.initialState) {
      console.log('no input to feedback node')
      return
    }
    if (!(fx.initialState instanceof ShaderEffect)) {
      console.log('input to feedback node is not a ShaderEffect')
      return
    }
    this.inputs = fx
  }

  render(renderer: THREE.WebGLRenderer): void {
    this._passthru.render(renderer)
    if (this.firstRender) {
      this.firstRender = false
      //todo bug - need runtime check to make sure feedbackSrc is set on FeedbackNode
      this._passthru.setSrcs({src: this.feedbackSrc!!.output})
    }
  }

  dispose(): void {
    this._passthru.dispose()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setUniforms(_uniforms: ShaderUniforms): void { }
  
  updateUniforms(): void { }
}

export function halfTarget(width: number, height: number, filterType: ('nearest' | 'linear') = 'nearest'): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    minFilter: filterType == 'nearest' ? THREE.NearestFilter : THREE.LinearFilter,
    magFilter: filterType == 'nearest' ? THREE.NearestFilter : THREE.LinearFilter,
  })
}

class Pingpong {
  src: THREE.WebGLRenderTarget
  dst: THREE.WebGLRenderTarget
  swap() {
    const temp = this.src
    this.src = this.dst
    this.dst = temp
  }
  constructor(width: number, height: number) {
    this.src = halfTarget(width, height)
    this.dst = halfTarget(width, height)
  }
}

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]

const passThruFS = glsl`
precision highp float;

varying vec2 vUV;

uniform sampler2D src;

void main() {
  gl_FragColor = texture2D(src, vUV);
}`

function getConcreteSource(input: ShaderSource): THREE.Texture {
  if (input instanceof THREE.WebGLRenderTarget) {
    return input.texture
  } else if (input instanceof THREE.Texture) {
    return input
  } else if (input instanceof ShaderEffect) {
    return input.output.texture
  } else {
    return new THREE.CanvasTexture(input, THREE.UVMapping, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter)
  }
}

export class CustomShaderEffect extends ShaderEffect {
  output: THREE.WebGLRenderTarget
  scene: THREE.Scene
  camera: THREE.Camera
  material: THREE.ShaderMaterial
  constructor(fsString: string, inputs: ShaderInputs, width = 1280, height = 720, customOutput?: THREE.WebGLRenderTarget, filterType: ('nearest' | 'linear') = 'linear') {
    super()
    //todo hotreload - register ShaderEffects so textures can be cleaned up on reload
    /* todo hotreload/deep design - should hotreload safetfy of ShaderEffects be internal, or an external wrapper?
            external allows reusing this more flexibly, but internal is probs easier?
            see if hotreloading three.js resources already has a solution in the ecosystem,
            and if not, see if you can expose a minimal API that is then mostly managed by an outside service
    */

    this.output = customOutput ?? halfTarget(width, height, filterType)
    this.width = width
    this.height = height
    //a scene with an orthographic camera, a single plane, and a shader material
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.uniforms = {}
    this.inputs = inputs
    this.material = new THREE.ShaderMaterial({
      vertexShader: planeVS,
      fragmentShader: fsString,
      uniforms: {} //todo api - set width and height as uniform
    })
    this._setMaterialUniformsFromInputs()
    const mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(mesh)
  }

  dispose(): void {
    this.output.dispose()
  }

  setUniforms(uniforms: ShaderUniforms): void {
    for (const key in uniforms) {
      this.uniforms[key] = uniforms[key]
    }
  }

  updateSources(): void {
    for (const key in this.inputs) {
      const input = this.inputs[key]
      if (input instanceof HTMLCanvasElement || input instanceof OffscreenCanvas) {
        this.material.uniforms[key].value.needsUpdate = true
      }
    }
  }

  updateUniforms(): void {
    for (const key in this.uniforms) {
      if (!this.material.uniforms[key]) {
        this.material.uniforms[key] = { value: extract(this.uniforms[key]) }
      } else {
        this.material.uniforms[key].value = extract(this.uniforms[key])
      }
      if (this.uniforms[key] instanceof THREE.CanvasTexture) {
        this.material.uniforms[key].value.needsUpdate = true
        console.log('updating canvas texture')
      }
    }
  }

  setShader(fragmentString: string): void {
    this.material.fragmentShader = fragmentString
    this.material.needsUpdate = true
  }

  setSrcs(inputs: ShaderInputs): void {
    for (const key in inputs) {
      this.inputs[key] = inputs[key]
    }
    this._setMaterialUniformsFromInputs()
  }

  //this can create new textures from html5 elements - only use in setups, not draw calls
  _setMaterialUniformsFromInputs(): void {
    for (const key in this.inputs) {
      const input = this.inputs[key]
      const inputVal = getConcreteSource(input)
      if (!this.material.uniforms[key]) {
        this.material.uniforms[key] = { value: inputVal }
      } else {
        this.material.uniforms[key].value = inputVal
        //todo performance - determine if/when to clean up old textures when setting new sources on ShaderEffect
      }
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    //render to the output
    this.updateSources()
    this.updateUniforms()
    renderer.setRenderTarget(this.output)
    renderer.render(this.scene, this.camera)
  }
}

export class CustomFeedbackShaderEffect extends CustomShaderEffect {
  pingpong: Pingpong
  _passthrough: Passthru
  constructor(fsString: string, inputArgs: ShaderInputs, width = 1280, height = 720) {
    super(fsString, inputArgs, width, height)
    this.pingpong = new Pingpong(width, height)
    this.material.uniforms['backbuffer'] = { value: this.pingpong.src.texture }
    this._passthrough = new Passthru({src: this.pingpong.src.texture}, width, height, this.output)
  }

  render(renderer: THREE.WebGLRenderer): void {
    //render to the output
    this.updateSources()
    this.updateUniforms()
    renderer.setRenderTarget(this.pingpong.dst)
    renderer.render(this.scene, this.camera)

    this._passthrough.setSrcs({ src: this.pingpong.dst.texture })
    this._passthrough.render(renderer)

    this.pingpong.swap()
    this.material.uniforms['backbuffer'].value = this.pingpong.src.texture
  }

  dispose(): void {
    super.dispose()
    this.pingpong.src.dispose()
    this.pingpong.dst.dispose()
  }
}

//todo api - make custom shader inputs a single object/type with optional pars instead of having optional positional args

export class Passthru extends CustomShaderEffect {
  effectName = "Passthru"
  constructor(inputs: {src: ShaderSource},  width = 1280, height = 720, customOutput?: THREE.WebGLRenderTarget, filterType: ('nearest' | 'linear') = 'linear') {
    super(passThruFS, inputs, width, height, customOutput, filterType)
  }

  setSrcs(fx: {src: ShaderSource}): void {
    this.inputs = fx
    const input = fx.src ? fx.src : errorImageTexture
    const inputVal = getConcreteSource(input)
    this.material.uniforms['src'] = { value: inputVal }
  }
}

//todo bug - feeding a canvas as a source to CanvasPaint doesn't update properly
export class CanvasPaint extends CustomShaderEffect {
  effectName = "CanvasPaint"
  constructor(inputs: {src: ShaderSource},  width = 1280, height = 720) {
    super(passThruFS, inputs, width, height, new THREE.WebGLRenderTarget(1, 1))
  }

  setSrcs(fx: {src: ShaderSource}): void {
    this.inputs = fx
    const input = fx.src ? fx.src : errorImageTexture
    const inputVal = getConcreteSource(input)
    this.material.uniforms['src'] = { value: inputVal }
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.setRenderTarget(null)
    renderer.render(this.scene, this.camera)
  }
}