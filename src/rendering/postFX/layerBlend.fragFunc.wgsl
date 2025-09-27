fn pass0(uv: vec2f, src1: texture_2d<f32>, src1Sampler: sampler, src2: texture_2d<f32>, src2Sampler: sampler) -> vec4f {
  let color1 = textureSample(src1, src1Sampler, uv);
  let color2 = textureSample(src2, src2Sampler, uv);
  let returnColor = select(color2, color1, color1.a > 0.01);
  return returnColor;
}
