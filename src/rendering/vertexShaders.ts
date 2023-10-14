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