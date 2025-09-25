fn layerBlend(uv: vec2f, src1: texture_2d<f32>, src1Sampler: sampler, src2: texture_2d<f32>, src2Sampler: sampler) -> vec4f {
  let color1 = textureSample(src1, src1Sampler, uv);
  if (color1.a > 0.01) {
    return color1;
  }
  let color2 = textureSample(src2, src2Sampler, uv);
  return color2;
}
