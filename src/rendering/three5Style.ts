import * as THREE from 'three';
import { planeVS } from './vertexShaders';
import type { ShaderUniform, ShaderUniforms } from './shaderFX';
import { Three5 } from './three5';

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]


type StaticShaderUniforms = {
  [key: string]: ShaderUniform
}

type ThreeUniforms = {
  [uniform: string]: THREE.IUniform<any>;
}

class Three5Style {

  public baseFragmentShader = glsl`
    precision highp float;
    
    uniform sampler2D tex0;
    uniform sampler2D tex1;
    uniform sampler2D tex2;
    uniform sampler2D tex3;

    uniform float float0;
    uniform float float1;
    uniform float float2;
    uniform float float3;

    
    uniform vec3 color0;
    uniform vec3 color1;
    uniform vec3 color2;
    uniform vec3 color3;

    varying vec2 vUV;

    void main() {
      //REPLACE STRING HERE
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
    `
  
  public material: THREE.Material
  public uniforms: StaticShaderUniforms = {}

  constructor(mainString: string, uniforms: StaticShaderUniforms) {
    this.uniforms = uniforms
    this.material = new THREE.ShaderMaterial(
      {
        vertexShader: planeVS,
        fragmentShader: this.baseFragmentShader.replace("Replace String", mainString), //todo incomplete
        uniforms: {}
      }
    )
  }

  public clone() { //call this "getMaterial()"
    //push the uniform values from the uniform object into the actual material uniforms, and return the material
    //do you need to dispose of these materials? maintain a cache based on shader string?
    //should this be embedded inside three5, or be a utility that hooks in/works on top of it? 
      //(probs want to expose setting arbitrary custom material anyway)
  }
}


const testCalls = () => {
  const t5 = new Three5(10, 10)
  let i = 0
  //set the material for the circles
  while (i++ < 10) {
    //update the material uniforms in a typesafe way
    t5.circle(10, 10, 10, 10)
  }



}