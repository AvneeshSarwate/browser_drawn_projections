
import * as THREE from 'three'
import { instanceVS } from './vertexShaders'

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


function shaderCompileTest(renderer: THREE.Renderer) {
  const fillerFrag = `

  void main() {
    gl_FragColor = vec4(1, 0, 0, 1);
  }
  `
  const geo = new THREE.CircleGeometry(1, 32)
  const instMes = instanceMesh(fillerFrag, geo)
  const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
  const scene = new THREE.Scene()
  scene.add(instMes)

  renderer.render(scene, cam)
}