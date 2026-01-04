struct TransformUniforms {
  float rotate;
  vec2 anchor;
  vec2 translate;
  vec2 scale;
};

vec4 pass0(vec2 uv, TransformUniforms uniforms, sampler2D src) {
  vec2 uvLocal = uv - uniforms.anchor;
  uvLocal = uvLocal * uniforms.scale;
  float cosR = cos(uniforms.rotate);
  float sinR = sin(uniforms.rotate);
  vec2 rotated = vec2(
    uvLocal.x * cosR - uvLocal.y * sinR,
    uvLocal.x * sinR + uvLocal.y * cosR
  ) + uniforms.anchor + uniforms.translate;
  return texture(src, rotated);
}
