import { CustomShaderEffect, type Dynamic, type ShaderSource } from "@/rendering/shaderFX"

//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]

const horLineShader = glsl`
precision highp float;

varying vec2 vUV;
uniform float n;

void main() {
  //create n horizontal lines, for each alternating line r is either -1 or 1
  float r = 1.0;
  if (mod(floor(vUV.y * n), 2.0) == 0.0) {
    r = -1.0;
  }

  gl_FragColor = vec4(r, 0, 0, 1);
} 
`

export class HorizontalAlternateDisplace extends CustomShaderEffect {
  effectName = "HorizontalAlternateDisplace"
  constructor(width = 1280, height = 720) {
    super(horLineShader, {}, width, height)
    this.setUniforms({n: 10})
  }

  setUniforms(uniforms: {n: Dynamic<number>}) {
    super.setUniforms(uniforms)
  }
}


const pointZoomShader = glsl`
precision highp float;

varying vec2 vUV;
uniform float centerX;
uniform float centerY;
uniform float strength;

uniform sampler2D source;

void main() {
  vec2 uv = mix(vUV, vec2(centerX, centerY), strength);
  gl_FragColor = texture2D(source, uv);
} 
`

export class PointZoom extends CustomShaderEffect {
  effectName = "PointZoom"
  constructor(inputs: {src: ShaderSource}, width = 1280, height = 720) {
    super(pointZoomShader, inputs, width, height)
    this.setUniforms({centerX: 0.5, centerY: 0.5, strength: 0.02})
  }

  setUniforms(uniforms: {centerX: Dynamic<number>, centerY: Dynamic<number>, strength: Dynamic<number>}) {
    super.setUniforms(uniforms)
  }
}