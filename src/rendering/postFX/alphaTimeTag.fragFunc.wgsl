struct AlphaTimeTagUniforms {
  drawTime: f32,
};

fn pass0(uv: vec2f, uniforms: AlphaTimeTagUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let color = textureSample(src, srcSampler, uv);
  let alphaTime = select(0.0, uniforms.drawTime, color.a > 0.0);
  return vec4f(color.rgb, alphaTime);
}
