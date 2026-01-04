struct WobbleUniforms {
  float xStrength;
  float yStrength;
  float time;
};

vec4 pass0(vec2 uv, WobbleUniforms uniforms, sampler2D src) {
  vec2 uv2 = uv;
  uv2.x = uv2.x + sin(uv.y * 10.0 + uniforms.time * 2.0) * uniforms.xStrength;
  uv2.y = uv2.y + cos(uv.x * 10.0 + uniforms.time * 2.0) * uniforms.yStrength;
  return texture(src, uv2);
}
