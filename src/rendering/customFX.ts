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
