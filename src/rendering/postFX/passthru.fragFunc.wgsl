fn passthru(uv: vec2f, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  return textureSample(src, srcSampler, uv);
}
