struct TransformUniforms {
  rotate: f32,
  anchor: vec2f,
  translate: vec2f,
  scale: vec2f,
};

fn transformEffect(uv: vec2f, uniforms: TransformUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  var uvLocal = uv - uniforms.anchor;
  uvLocal = uvLocal * uniforms.scale;
  let cosR = cos(uniforms.rotate);
  let sinR = sin(uniforms.rotate);
  let rotated = vec2f(
    uvLocal.x * cosR - uvLocal.y * sinR,
    uvLocal.x * sinR + uvLocal.y * cosR,
  ) + uniforms.anchor + uniforms.translate;
  return textureSample(src, srcSampler, rotated);
}
