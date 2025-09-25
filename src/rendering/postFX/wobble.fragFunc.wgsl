struct WobbleUniforms {
  xStrength: f32,
  yStrength: f32,
  time: f32,
};

fn wobble(uv: vec2f, uniforms: WobbleUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  var uvLocal = uv;
  var uv2 = uvLocal;
  uv2.x = uv2.x + sin(uvLocal.y * 10.0 + uniforms.time * 2.0) * uniforms.xStrength;
  uv2.y = uv2.y + cos(uvLocal.x * 10.0 + uniforms.time * 2.0) * uniforms.yStrength;
  let color = textureSample(src, srcSampler, uv2);
  return color;
}
