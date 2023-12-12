//used with the "glsl-literal" vscode plugin to get syntax highlighting for embedded glsl
const glsl = (x: any): string => x[0]

export const planeVS = glsl`

// attribute vec3 position;
// attribute vec2 uv;

varying vec2 vUV;

void main() {
  vec4 p = vec4(position, 1.);
  gl_Position = projectionMatrix * modelViewMatrix * p;
  vUV = uv;
}`



//all instance property will be 1024x1024
//assumes rooted at 0,0

export const instanceVS = glsl`

attribute float instInd;
// attribute vec3 position;

uniform sampler2D posTexture;
uniform sampler2D color1Texture; 
uniform sampler2D color2Texture; 

varying vec2 vUV;
varying vec4 color1;
varying vec4 color2;
varying float insti;

void main() {
  ivec2 texCoord = ivec2(int(floor(instInd / 128.)), int(mod(instInd, 128.)));
  vec4 texPos = texelFetch(posTexture, texCoord, 0);
  vec4 p = vec4(texPos.rgb, 1.);
  
  p = texPos.a == 0. ? vec4(0) : p;
  vec4 pos4 = vec4(position, 1);
  gl_Position = projectionMatrix * modelViewMatrix * (pos4+p);

  color1 = texelFetch(color1Texture, texCoord, 0);
  color2 = texelFetch(color2Texture, texCoord, 0);

  insti = 1.;
  vUV = uv;
}`