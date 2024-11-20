import * as THREE from 'three'

import { CustomShaderEffect, ShaderEffect, errorImageTexture, type Dynamic, type ShaderSource, CustomFeedbackShaderEffect } from "./shaderFX"

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]

//todo API - glsl/js uniform typos - add runtime check to make sure uniform declarations match uniforms object?
const wobbleFS = glsl`
precision highp float;

uniform float xStrength;
uniform float yStrength;
uniform sampler2D src;
uniform float time;

float sinN(float n) { return sin(n)*0.5 + 0.5; }

varying vec2 vUV;

void main() {
  vec2 uv = vUV;
  vec2 uv2 = uv;
  uv2.x += sin(uv.y * 10.0 + time * 2.0) * xStrength;
  uv2.y += cos(uv.x * 10.0 + time * 2.0) * yStrength;
  vec4 color = texture2D(src, uv2);
  // color.r = abs(sinN(time)-uv.x) < 0.05 ? 1.0 : 0.0; 
  gl_FragColor = color;
}`


/* 
todo API - cleaner api for instantiating fx with/without inputs + indicate when missing
           (runtime check since theyre all named?)
*/

//todo feature - need a way to explore fx graph and inspect the output of each node



export class Wobble extends CustomShaderEffect {
  effectName = "Wobble"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(wobbleFS, inputs, width, height)
    //todo API - need a more robust time function for shaders
    const timeStart = Date.now()
    this.setUniforms({xStrength: 0.1, yStrength: 0.1, time: () => (Date.now()-timeStart) / 1000})
  }
  setUniforms(uniforms: {xStrength: Dynamic<number>, yStrength: Dynamic<number>, time?: Dynamic<number>}): void {
    super.setUniforms(uniforms)
  }
}


const verticalBlurFs = glsl`
precision highp float;

uniform sampler2D src;       // The input texture
uniform int pixels;          // Size of the blur kernel

varying vec2 vUV;            // The texture coordinate, passed from the vertex shader

void main() {
  vec4 color = vec4(0.0);
  float total = 0.0;
  float offset = 1.0 / 720.0; // Hardcoded resolution

  // Calculate the triangular weight
  for (int i = -pixels; i <= pixels; ++i) {
    float weight = 1.0 - (abs(float(i)) / float(pixels + 1));
    color += texture2D(src, vUV + vec2(0.0, offset * float(i))) * weight;
    total += weight;
}

  gl_FragColor = color / total;
}`

export class VerticalBlur extends CustomShaderEffect {
  effectName = "VerticalBlur"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(verticalBlurFs, inputs, width, height)
    this.setUniforms({pixels: 5})
  }
  setUniforms(uniforms: {pixels: Dynamic<number>}): void {
    super.setUniforms(uniforms)
  }
}

const horizontalBlurFs = glsl`
precision highp float;

uniform sampler2D src;       // The input texture
uniform int pixels;          // Size of the blur kernel

varying vec2 vUV;            // The texture coordinate, passed from the vertex shader

void main() {
  vec4 color = vec4(0.0);
  float total = 0.0;
  float offset = 1.0 / 1280.0; // Hardcoded resolution for width

  // Calculate the triangular weight
  for (int i = -pixels; i <= pixels; ++i) {
    float weight = 1.0 - (abs(float(i)) / float(pixels + 1));
    color += texture2D(src, vUV + vec2(offset * float(i), 0.0)) * weight;
    total += weight;
  }

  gl_FragColor = color / total;
}`

export class HorizontalBlur extends CustomShaderEffect {
  effectName = "HorizontalBlur"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(horizontalBlurFs, inputs, width, height)
    this.setUniforms({pixels: 5})
  }
  setUniforms(uniforms: {pixels: Dynamic<number>}): void {
    super.setUniforms(uniforms)
  }
}

//a transform effect that has independent scale on x and y and translate on x and y, and a rotate parameter, and has an anchor point that is a vec2
const transformFs = glsl`
precision highp float;

uniform sampler2D src;
uniform float rotate;
uniform vec2 anchor;
uniform vec2 translate;
uniform vec2 scale;

varying vec2 vUV;

void main() {
  vec2 uv = vUV;
  uv -= anchor;
  uv *= scale;
  uv = vec2(uv.x * cos(rotate) - uv.y * sin(rotate), uv.x * sin(rotate) + uv.y * cos(rotate));
  uv += anchor;
  uv += translate;
  gl_FragColor = texture2D(src, uv);
}`

export class Transform extends CustomShaderEffect {
  effectName = "Transform"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(transformFs, inputs, width, height)
    this.setUniforms({rotate: 0, anchor: [0.5, 0.5], translate: [0, 0], scale: [1, 1]})
  }
  setUniforms(uniforms: {rotate?: Dynamic<number>, anchor?: Dynamic<[number, number]>, translate?: Dynamic<[number, number]>, scale?: Dynamic<[number, number]>}): void {
    super.setUniforms(uniforms)
  }
}

const mathOpFs = glsl`
precision highp float;

uniform sampler2D src;
uniform float preAdd;
uniform float postAdd;
uniform float mult;

varying vec2 vUV;

void main() {
  vec4 color = texture2D(src, vUV);
  color = color * (mult + preAdd) + postAdd;
  gl_FragColor = color;
}`

export class MathOp extends CustomShaderEffect {
  effectName = "MathOp"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(mathOpFs, inputs, width, height)
    this.setUniforms({preAdd: 0, postAdd: 0, mult: 1})
  }
  setUniforms(uniforms: {preAdd?: Dynamic<number>, postAdd?: Dynamic<number>, mult?: Dynamic<number>}): void {
    super.setUniforms(uniforms)
  }
}



//an effect that takes layer 1 and layer 2, and shows layer 2 where layer 1 is transparent
const layerBlendFs = glsl`
precision highp float;

uniform sampler2D src1;
uniform sampler2D src2;

varying vec2 vUV;

void main() {
  vec2 uv = vUV;
  vec4 color1 = texture2D(src1, uv);
  vec4 color2 = texture2D(src2, uv);
  gl_FragColor = color1.a > 0.01 ? color1 : color2;
}`

export class LayerBlend extends CustomShaderEffect {
  effectName = "LayerBlend"
  constructor(inputs: {src1: ShaderSource, src2: ShaderSource}, width = 1280, height = 720) {
    super(layerBlendFs, inputs, width, height)
  }
}


/**
 * todo API - decide whether to make nullability of uniforms generic on ShaderUniforms, 
 *        or let each effect specify param by param
 */

// const ob = {
//   f: new CustomShaderEffect(wobbleFS, { src: errorImageTexture }),
//   t: new CustomShaderEffect(wobbleFS, this.f)

// }


// eslint-disable-next-line @typescript-eslint/no-unused-vars
const testCalls = () => {

  const w = new Wobble({ src: errorImageTexture })
  const timeStart = Date.now()
  w.setUniforms({ xStrength: 0.1, yStrength: () => Math.sin( (Date.now()-timeStart) / 1000) * 0.1 })

  type EffectGraph = {
    [key: string]: ShaderEffect
  }

  const ob: EffectGraph = {}
  ob.f = new Wobble({ src: errorImageTexture })
  ob.t = new CustomShaderEffect(wobbleFS, { src: ob.f })
}

/**
 * todo wishlist - what type level tricks can you use to define a shader graph and then 
 * get the graph object with autocomplete available in another file?
 * 
 * alternatively, just suck it up and rebuild the graph (an properly dispose of the old one)
 * on reload - can try to intelligently reuse nodes that haven't changed
 * - if you keep time/transport stuff consistent across reloads, it is only feedback loop textures
 *   that need to be recreated - for CustomFeedbackShader, you can compare the fragment shader,
 *   but for FeedbackNode, you might need to compare the whole graph
 * 
 * - todo hotreload - quick and dirty idea - for nodes to save their texture on hot reload, provide a "save key".
 *   could even be a required argument for FeedbackNode and CustomShaderEffect?
 */

const uvShader = glsl`
precision highp float;

varying vec2 vUV;

void main() {
  gl_FragColor = vec4(vUV, 1, 1);
} 
`

export class UVDraw extends CustomShaderEffect {
  effectName = "UVdraw"
  constructor(width = 1280, height = 720) {
    super(uvShader, {}, width, height)
  }
}

const feedbackZoomFS = glsl`
precision highp float;

uniform float zoom;
uniform sampler2D src;
uniform sampler2D backbuffer;

varying vec2 vUV;

void main() {
  vec2 uv = vUV;
  vec4 color = texture2D(src, uv);
  vec4 bb = texture2D(backbuffer, mix(uv, vec2(0.5), zoom));
  color = color.a > 0.01 ? color : bb;
  gl_FragColor = color;
}`

export class FeedbackZoom extends CustomFeedbackShaderEffect {
  effectName = "FeedbackZoom"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(feedbackZoomFS, inputs, width, height)
    this.setUniforms({zoom: 0.005})
  }
  setUniforms(uniforms: {zoom: Dynamic<number>}): void {
    super.setUniforms(uniforms)
  }
}


const rgDisplaceFs = glsl`
precision highp float;

uniform sampler2D src;
uniform sampler2D displacementMap; //a float32 texture with xy displacement in rg channels
uniform float strength;

varying vec2 vUV;

void main() {
  vec2 uv = vUV;
  vec2 disp = texture2D(displacementMap, uv).xy * strength;
  vec2 uv2 = uv + disp;
  gl_FragColor = texture2D(src, uv2);
}
`

export class RGDisplace extends CustomShaderEffect {
  effectName = "RGDisplace"
  constructor(inputs: {src: ShaderSource, displacementMap: ShaderSource}, width = 1280, height = 720) {
    super(rgDisplaceFs, inputs, width, height)
    this.setUniforms({strength: 0.1})
  }
  setUniforms(uniforms: {strength: Dynamic<number>}): void {
    super.setUniforms(uniforms)
  }
}


function generateCompositeShaderSource(numInputs: number): string {
  let inputsDeclaration = '';
  let inputSampling = '';

  for (let i = 0; i < numInputs; i++) {
    inputsDeclaration += `uniform sampler2D input${i};\n`;
    inputSampling += `colors[${i}] = texture2D(input${i}, uv);\n`;

  }

  return `
precision highp float;

const int NUM_INPUTS = ${numInputs};

${inputsDeclaration}

varying vec2 vUV;

void main() {
  vec2 uv = vUV;
  vec4 colors[NUM_INPUTS];
  for (int i = 0; i < NUM_INPUTS; i++) {
    colors[i] = vec4(0.0);  // Initialize each element to (0.0, 0.0, 0.0, 0.0)
  }


  vec4 color = vec4(0.0);
  float alphaSum = 0.0;
  vec3 colorSum = vec3(0.0);
  ${inputSampling}
  for (int i = 0; i < NUM_INPUTS; i++) {
    color = colors[i].a > color.a ? colors[i] : color;
    alphaSum += colors[i].a;
    colorSum += colors[i].rgb * colors[i].a;
  }
  color = vec4(colorSum / alphaSum, 1);


  // gl_FragColor = texture2D(input4, uv).aaaa;
  gl_FragColor = color;
}
`;
}

export class CompositeShaderEffect extends CustomShaderEffect {
  effectName = "CompositeShaderEffect";
  numInputs: number;
  shaderSource: string;
  constructor(inputs: ShaderEffect[], numInputs: number, width = 1280, height = 720) {
    const shaderSource = generateCompositeShaderSource(numInputs);
    const inputObject: { [key: string]: ShaderEffect } = {};
    const uniformObject: { [key: string]: THREE.WebGLRenderTarget } = {};
    inputs.forEach((input, index) => {
      inputObject[`input${index}`] = input;
    });
    super(shaderSource, inputObject, width, height);
    this.shaderSource = shaderSource
    this.numInputs = Math.max(numInputs, inputs.length);
    this.inputs = inputObject
    this.setUniforms(uniformObject);
  }

  //todo api - figure out how to genericize the types of inputs for this kind of thing to also take Shader FX and html5 canvases?
  resetInputs(inputs: ShaderEffect[]): void {
    if (inputs.length > this.numInputs) {
      // throw new Error(`Number of inputs (${inputs.length}) is greater than the number of inputs in the shader (${this.numInputs})`);
      //need to rebuild shader when number of inputs changes because having/using unused texture inputs is undefined behavior
      //and completely messes up the shader
      this.setShader(generateCompositeShaderSource(inputs.length))
      this.numInputs = inputs.length
    }
    const inputObject: { [key: string]: ShaderEffect } = {};
    inputs.forEach((input, index) => {
      inputObject[`input${index}`] = input;
    });
    this.inputs = inputObject

    //todo api - should this be public?
    this._setMaterialUniformsFromInputs()
  }

  override render(renderer: THREE.WebGLRenderer): void {
    super.render(renderer)
  }
}



const antiAliasFs = glsl`
precision highp float;

uniform sampler2D src;
uniform float resolutionX;
uniform float resolutionY;
varying vec2 vUV;

void main() {
  vec2 texelSize = vec2(1.0 / resolutionX, 1.0 / resolutionY);

  vec3 centerColor = texture2D(src, vUV).rgb;

  // Sample surrounding texels
  vec3 colorTop = texture2D(src, vUV + vec2(0.0, texelSize.y)).rgb;
  vec3 colorBottom = texture2D(src, vUV - vec2(0.0, texelSize.y)).rgb;
  vec3 colorLeft = texture2D(src, vUV - vec2(texelSize.x, 0.0)).rgb;
  vec3 colorRight = texture2D(src, vUV + vec2(texelSize.x, 0.0)).rgb;

  // Compute edge detection (luminance difference)
  float edgeHorizontal = abs(dot(colorLeft, vec3(0.299, 0.587, 0.114)) - dot(colorRight, vec3(0.299, 0.587, 0.114)));
  float edgeVertical = abs(dot(colorTop, vec3(0.299, 0.587, 0.114)) - dot(colorBottom, vec3(0.299, 0.587, 0.114)));

  float edgeFactor = smoothstep(0.0, 0.3, max(edgeHorizontal, edgeVertical));

  // Blend original color with the average to smooth edges
  vec3 blendedColor = (colorTop + colorBottom + colorLeft + colorRight + centerColor) / 5.0;

  gl_FragColor = vec4(mix(centerColor, blendedColor, edgeFactor), 1.0);
}
`

export class AntiAlias extends CustomShaderEffect {
  effectName = "AntiAlias"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(antiAliasFs, inputs, width, height)
    this.setUniforms({resolutionX: width, resolutionY: height})
  }
}

const bloomFs = glsl`
precision highp float;

uniform sampler2D src;       // Input texture
uniform float intensity;     // Bloom intensity
uniform float width;         // Texture width
uniform float height;        // Texture height
varying vec2 vUV;



void main() {
  // Gaussian blur weights - 0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216
  float weights[5];
  weights[0] = 0.227027;
  weights[1] = 0.1945946;
  weights[2] = 0.1216216;
  weights[3] = 0.054054;
  weights[4] = 0.016216;
  vec4 color = texture2D(src, vUV) * weights[0]; // Base weight

  // Perform horizontal and vertical blur
  for (int i = 1; i < 5; i++) {
    float offsetX = float(i) / width;
    float offsetY = float(i) / height;

    // Horizontal blur
    color += texture2D(src, vUV + vec2(offsetX, 0.0)) * weights[i];
    color += texture2D(src, vUV - vec2(offsetX, 0.0)) * weights[i];

    // Vertical blur
    color += texture2D(src, vUV + vec2(0.0, offsetY)) * weights[i];
    color += texture2D(src, vUV - vec2(0.0, offsetY)) * weights[i];
  }

  // Add bloom by mixing the blurred image with the original
  gl_FragColor = mix(texture2D(src, vUV), color, intensity);
}
`

export class Bloom extends CustomShaderEffect {
  effectName = "Bloom"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(bloomFs, inputs, width, height)
    this.setUniforms({intensity: 0.1})
  }
  setUniforms(uniforms: { intensity: Dynamic<number> }): void {
    const fullUniforms = {
      ...uniforms,
      width: this.width,
      height: this.height
    }
    super.setUniforms(fullUniforms)
  }
}