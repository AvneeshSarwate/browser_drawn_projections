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

uniform vec2 countDim;
uniform sampler2D posTexture;
uniform sampler2D scaleTexture; //todo api - need to toggle instance texture use based on if inputs are defined in ShaderInstancedGeo input params
uniform sampler2D color1Texture; 
uniform sampler2D color2Texture; 

varying vec2 vUV;
varying vec4 color1;
varying vec4 color2;
varying float instN;

void main() {
  ivec2 texCoord = ivec2(int(floor(mod(instInd, countDim.x))), int(floor(instInd / countDim.x)));
  vec4 texPos = texelFetch(posTexture, texCoord, 0);
  vec4 p = vec4(texPos.rgb, 1.);

  vec4 texScale = texelFetch(scaleTexture, texCoord, 0);
  vec3 scale = texScale.rgb;
  
  // p = texPos.a == 0. ? vec4(0) : p;
  vec4 pos4 = vec4(position*scale, 1);
  vec4 finalPos = texPos.a == 0. ? vec4(-5000) : pos4+p;
  gl_Position = projectionMatrix * modelViewMatrix * (finalPos);

  color1 = texelFetch(color1Texture, texCoord, 0);
  color2 = texelFetch(color2Texture, texCoord, 0);

  instN = instInd / (countDim.x * countDim.y);
  vUV = uv;
}`