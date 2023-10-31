import * as THREE from 'three';
import { planeVS } from './vertexShaders';
import type { ShaderUniform, ShaderUniforms } from './shaderFX';
import { Three5 } from './three5';

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]

//todo api - make this specific to three5style allowed values
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
  public mainString = ""

  constructor() {

    this.material = new THREE.ShaderMaterial(
      {
        vertexShader: planeVS,
        fragmentShader: this.baseFragmentShader.replace("Replace String", this.mainString), //todo incomplete
        uniforms: {}
      }
    )
  }

  public clone(): THREE.Material { //call this "getMaterial()"
    /*
    push the uniform values from the uniform object into the actual material uniforms, and return the material
    do you need to dispose of these materials? maintain a cache based on shader string?
    should this be embedded inside three5, or be a utility that hooks in/works on top of it? 
      - (probs want to expose setting arbitrary custom material anyway)
      - give three5 a "setStyle" that takes either a raw material or three5Style and internally uses/disposes accordingly

    
    
    in three5, have a useMaterial or useStyle method that switches whether the "style mode" uses a raw three material or a three5Style
    - if using a raw material, user is responsible for handling update of the material uniforms as dicated by three
    - if using a three5style, user can set type-safe properties on the three5style and then three5 will extract an 
      appropriately cloned/managed material when creating a mesh
    */
      return this.material
  }
}

//todo api - is there a way to map user-custom names to the [type][0-3] names ergonomically? by order of key definition?
//is there a way to properly replace symbols in the shader? eg first float detected replaces USER_FLOAT_0 and up to 
//the user not to pick names that break string-replacement?
//https://github.com/ShaderFrog/glsl-parser - use this to replace [type][0-3] names?
//or - detect uniform types and just append those as uniforms into the shader template automatically?
class LineStyle extends Three5Style {
  public mainString = glsl`
  float time = float0;
  gl_FragColor = abs(vUV.x - sinN(time)) < 0.02 ? color0 : color1;
  `
  public uniforms = {
    time: 0,
    color0: new THREE.Vector4(),
    color1: new THREE.Vector4()
  }
}




const testCalls = () => {
  const t5 = new Three5(10, 10)
  const ls = new LineStyle()
  let i = 0
  //set the material for the circles
  //three5.useStyle(ls)
  while (i++ < 10) {
    //update the material uniforms in a typesafe way
    ls.uniforms.color0.setX(10)
    t5.circle(10, 10, 10, 10)
  }



}