struct AlphaThresholdUniforms {
  threshold: f32,
};

fn pass0(uv: vec2f, uniforms: AlphaThresholdUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let color = textureSample(src, srcSampler, uv);
  // Round alpha to 0 or 1 based on threshold
  let newAlpha = select(0.0, 1.0, color.a > uniforms.threshold);
  return vec4f(color.rgb, newAlpha);
}
