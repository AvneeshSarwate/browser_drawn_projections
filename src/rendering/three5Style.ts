import * as THREE from 'three';
import { planeVS } from './vertexShaders';
import type { ShaderUniform, ShaderUniforms } from './shaderFX';
import { Three5 } from './three5';

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]


function threeTypeToGlsl(val: ShaderUniform) {
  if(typeof val === "number") return "float"
  if(val instanceof THREE.Vector2) return "vec2"
  if(val instanceof THREE.Vector3) return "vec3"
  if(val instanceof THREE.Vector4) return "vec4"
  if(val instanceof THREE.Color) return "vec3"
  if(val instanceof THREE.Matrix3) return "mat3"
  if(val instanceof THREE.Matrix4) return "mat4"
  if(val instanceof THREE.Texture) return "sampler2D"

  //arrays of above types
  if(Array.isArray(val)) {
    const v = (val as any[])[0]
    if(v instanceof THREE.Vector2) return "vec2[]"
    if(v instanceof THREE.Vector3) return "vec3[]"
    if(v instanceof THREE.Vector4) return "vec4[]"
    if(v instanceof THREE.Color) return "vec3[]"
    if(v instanceof THREE.Matrix3) return "mat3[]"
    if(v instanceof THREE.Matrix4) return "mat4[]"
    if(v instanceof THREE.Texture) return "sampler2D[]"
  }
}

//todo api - make this specific to three5style allowed values
type StaticShaderUniforms = {
  [key: string]: ShaderUniform
}

type ThreeUniforms = {
  [uniform: string]: THREE.IUniform<any>;
}

export class Three5Style {

  public baseFragmentShader = glsl`
    precision highp float;
    
    //REPLACE UNIFORMS HERE

    varying vec2 vUV;

    void main() {
      //REPLACE MAIN HERE
    }
    `
  
  public uniforms: StaticShaderUniforms = {}
  public mainString = ""
  public finalShader = ""

  buildShader() {
    const mainReplacedString = this.baseFragmentShader.replace("//REPLACE MAIN HERE", this.mainString)
    console.log("mainString", mainReplacedString, "rep", this.mainString)
    const uniformReplacedString = mainReplacedString.replace("//REPLACE UNIFORMS HERE", this.buildUniformString())
    console.log("uniformString", uniformReplacedString, "rep", this.buildUniformString())
    this.finalShader = uniformReplacedString
    console.log("finalShader", this.finalShader)
  }

  constructor() {
    this.buildShader()
  }

  public getMaterial(): THREE.Material { //call this "getMaterial()"
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

    
    const material = new THREE.ShaderMaterial({
      uniforms: this.buildThreeUniforms(),
      vertexShader: planeVS,
      fragmentShader: this.finalShader,
    });

    return material
  }

  buildThreeUniforms(): ThreeUniforms {
    const uniforms: ThreeUniforms = {}
    for (const [key, value] of Object.entries(this.uniforms)) {
      uniforms[key] = {value: value}
    }
    return uniforms
  }


  buildUniformString(): string {
    let uniformString = ""
    for (const [key, value] of Object.entries(this.uniforms)) {
      uniformString += `uniform ${threeTypeToGlsl(value)} ${key};\n`
    }
    return uniformString
  }
}

//todo api - is there a way to map user-custom names to the [type][0-3] names ergonomically? by order of key definition?
//is there a way to properly replace symbols in the shader? eg first float detected replaces USER_FLOAT_0 and up to 
//the user not to pick names that break string-replacement?
//https://github.com/ShaderFrog/glsl-parser - use this to replace [type][0-3] names?
//or - detect uniform types and just append those as uniforms into the shader template automatically?
export class LineStyle extends Three5Style {
  constructor() { super(); this.buildShader() } //necessary boilerplate due to typescript inheritance
  public mainString = glsl`
  gl_FragColor = abs(vUV.x - (sin(time)*0.5+0.5)) < 0.05 ? color0 : color1;
  `
  public uniforms = {
    time: 0,
    color0: new THREE.Vector4(1, 0, 0, 1),
    color1: new THREE.Vector4(0, 1, 0, 1),
  }
}
//todo api - have a three5style version that takes the mainString/uniforms as arguments to remove inheritance boilerplate




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