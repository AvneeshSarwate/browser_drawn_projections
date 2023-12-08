
import * as THREE from 'three'
import { instanceVS } from './vertexShaders'
import { CustomShaderEffect, halfTarget, ShaderEffect, type ShaderInputs } from './shaderFX'

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]



//all instance textures will be 1024x1024


const indexArray = new Float32Array(1024*1024).map((_, i) => i)


export function instanceMesh(fragShader: string, geometry: THREE.BufferGeometry): THREE.Mesh {

  const material = new THREE.ShaderMaterial({
    uniforms: {
      posTexture: {value: null},
      color1Texture: {value: null},
      color2Texture: {value: null},
    },
    vertexShader: instanceVS,
    fragmentShader: fragShader,
  })

  const geometryInstanced = new THREE.InstancedBufferGeometry();
  geometryInstanced.index = geometry.index
  geometryInstanced.attributes = geometry.attributes

  geometry.setAttribute('instInd', new THREE.InstancedBufferAttribute(indexArray, 1))

  const mesh = new THREE.Mesh(geometry, material)

  return mesh
}



export class ShaderInstancedGeo extends CustomShaderEffect {

  constructor(fsString: string, inputs: ShaderInputs, geometry: THREE.BufferGeometry, width = 1280, height = 720, customOutput?: THREE.WebGLRenderTarget, filterType: ('neareast' | 'linear') = 'linear') {
    super(fsString, inputs, width, height, customOutput, filterType)
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
    this.camera = new THREE.OrthographicCamera(0, 1280, 720, 0, -1, 1)
    this.uniforms = {}
    this.inputs = inputs
    this.material = new THREE.ShaderMaterial({
      vertexShader: instanceVS,
      fragmentShader: fsString,
      uniforms: {}
    })
    this._setMaterialUniformsFromInputs()
    const mesh = new THREE.Mesh(geometry, this.material)
    this.scene.add(mesh)
  }

  renderAll(renderer: THREE.WebGLRenderer, skipTextureRender = false): void {
    for (const key in this.inputs) {
      const input = this.inputs[key]
      if (input instanceof ShaderEffect) {
        input.renderAll(renderer)
      }
    }
    if(!skipTextureRender) this.render(renderer)
  }

  render(renderer: THREE.WebGLRenderer, skipTextureRender = false): void {
    //render to the output
    this.updateSources()
    this.updateUniforms()
    if (!skipTextureRender) {
      renderer.setRenderTarget(this.output)
      renderer.render(this.scene, this.camera)
    }
  }



}


export const redFrag = `

void main() {
  gl_FragColor = vec4(1, 0, 0, 1);
}
`


function shaderCompileTest(renderer: THREE.Renderer) {
  
  const geo = new THREE.CircleGeometry(1, 32)
  const instMes = instanceMesh(redFrag, geo)
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
  const scene = new THREE.Scene()
  scene.add(instMes)

  renderer.render(scene, cam)
}



const circleFS = glsl`
precision highp float;

float w = 1280.;
float h = 720.;

varying vec2 vUV;  

float sinN(float n) { return sin(n)*0.5 + 0.5; }
float cosN(float n) { return cos(n)*0.5 + 0.5; }

void main() {
  float ind = vUV.x * w * h + vUV.y * h;
  float indN = ind / (w * h);
  vec2 scale = vec2(w, h);
  vec2 circle = vec2(cosN(indN*3.), sinN(indN*2.))*scale;
  gl_FragColor = vec4(circle, 0, 1);
  float d = 120.;
  gl_FragColor = vec4(vUV*scale, 0, 1);
}
`

export class CircleDef extends CustomShaderEffect {
  constructor(width = 1280, height = 720) {
    super(circleFS, {}, width, height)
  }
}