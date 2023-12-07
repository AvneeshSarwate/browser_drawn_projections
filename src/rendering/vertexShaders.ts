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



//all instance textures will be 1024x1024

export const instanceVS = glsl`

attribute float instInd;

uniform sampler2D posTexture;
uniform sampler2D color1Texture; 
uniform sampler2D color2Texture; 

varying vec2 vUV;
varying vec4 color1;
varying vec4 color2;

void main() {
  ivec2 texCoord = ivec2(int(floor(instInd / 1024.)), int(mod(instInd, 1024.)));
  vec4 texPos = texelFetch(posTexture, texCoord, 0);
  vec4 p = vec4(texPos.rgb, 1.);
  
  p = texPos.a == 0. ? vec4(0) : p;
  gl_Position = projectionMatrix * modelViewMatrix * p;

  color1 = texelFetch(color1Texture, texCoord, 0);
  color2 = texelFetch(color2Texture, texCoord, 0);

  vUV = uv;
}`