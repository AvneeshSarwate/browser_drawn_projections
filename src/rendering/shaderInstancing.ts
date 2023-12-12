
import * as THREE from 'three'
import { instanceVS } from './vertexShaders'
import { CustomShaderEffect, halfTarget, ShaderEffect, type Dynamic, type ShaderInputs } from './shaderFX'

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]


const indexArray = new Float32Array(1024*1024).map((_, i) => i)


export class ShaderInstancedGeo extends CustomShaderEffect {

  constructor(fsString: string, xCount: number, yCount: number, inputs: ShaderInputs, geometry: THREE.BufferGeometry, width = 1280, height = 720, customOutput?: THREE.WebGLRenderTarget, filterType: ('nearest' | 'linear') = 'nearest') {
    super(fsString, inputs, width, height, customOutput, filterType)
    //todo hotreload - register ShaderEffects so textures can be cleaned up on reload
    /* todo hotreload/deep design - should hotreload safetfy of ShaderEffects be internal, or an external wrapper?
            external allows reusing this more flexibly, but internal is probs easier?
            see if hotreloading three.js resources already has a solution in the ecosystem,
            and if not, see if you can expose a minimal API that is then mostly managed by an outside service
    */

    this.output = customOutput ?? halfTarget(width, height, filterType)
    this.width = xCount
    this.height = yCount
    //a scene with an orthographic camera, a single plane, and a shader material
    this.scene = new THREE.Scene()
    this.camera = new THREE.OrthographicCamera(0, 1280, 720, 0, -1, 1)
    this.uniforms = {}
    this.inputs = inputs
    this.material = new THREE.ShaderMaterial({
      vertexShader: instanceVS,
      fragmentShader: fsString, 
      uniforms: {
        countDim: {value: new THREE.Vector2(xCount, yCount)},
      }
    })
    //todo bug - need to set texture size (xCount, yCount) for instancing shader
    this._setMaterialUniformsFromInputs()


    const geometryInstanced = new THREE.InstancedBufferGeometry();
    geometryInstanced.index = geometry.index
    geometryInstanced.attributes = geometry.attributes
    const numInst = xCount * yCount
    // geometryInstanced.instanceCount = numInst

    geometryInstanced.setAttribute('instInd', new THREE.InstancedBufferAttribute(indexArray.slice(0, numInst), 1))


    const mesh = new THREE.Mesh(geometryInstanced, this.material)
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


export const redFrag = glsl`

void main() {
  gl_FragColor = vec4(1, 0, 0, 1);
}
`



const circleFS = glsl`
precision highp float;

uniform float time;

float w = 1280.;
float h = 720.;

uniform float cW;
uniform float cH;

varying vec2 vUV;  

float sinN(float n) { return sin(n)*0.5 + 0.5; }
float cosN(float n) { return cos(n)*0.5 + 0.5; }

void main() {
  float ind = vUV.x * cW * cH + vUV.y * cH;
  float indN = ind / (cW * cH);
  vec2 scale = vec2(w, h);
  vec2 circle = vec2(cosN(indN*2.*3.1415), sinN(indN*2.*3.1415))*scale;
  gl_FragColor = vec4(circle, 0, 1);
  // float d = 128.;
  // vec2 xy = vUV.xy * vec2(cW, cH) / d;
  // gl_FragColor = vec4(xy, 0, 1);
}
`
//todo bug - shader that drives instancing not working (details below)
// when using vUV in any expression for output, positions fall to 0
// also, 1280,720 only is halfway up/right instead of all the way
//maybe instanced draw call isn't running right so you're only seeing the first instance drawn (with vUV/pos 0?)


export class CircleDef extends CustomShaderEffect {
  constructor(width: number, height: number) {
    const startTime = performance.now()
    super(circleFS, {}, width, height, undefined, 'nearest')
    this.setUniforms({time: () => (performance.now() - startTime)/1000, cW: width, cH: height})
  }
  setUniforms(uniforms: {time: Dynamic<number>, cW: number, cH: number}): void {
    super.setUniforms(uniforms)
  }
}



export const debugFrag = glsl`
precision highp float;

varying float insti;

varying vec2 vUV;

void main() {
  gl_FragColor = vec4(1, vUV.x * insti, 0, 1);
}
`