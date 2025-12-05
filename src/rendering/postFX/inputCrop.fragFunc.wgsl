struct InputCropUniforms {
  origin: vec2f,
  size: vec2f,
};

fn pass0(uv: vec2f, uniforms: InputCropUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  // Map origin from p5's Y-down into texture Y-up: flip origin and keep uv as-is.
  let originFlipped = vec2f(uniforms.origin.x, 1.0 - uniforms.origin.y - uniforms.size.y);
  let sampleUv = originFlipped + uv * uniforms.size;
  let uvClamped = clamp(sampleUv, vec2f(0.0, 0.0), vec2f(1.0, 1.0));

  // mask is 1 when inside [0,1] range, else 0; keeps control flow uniform
  let maskX = step(0.0, sampleUv.x) * step(sampleUv.x, 1.0);
  let maskY = step(0.0, sampleUv.y) * step(sampleUv.y, 1.0);
  let mask = maskX * maskY;

  let color = textureSample(src, srcSampler, uvClamped);
  return vec4f(color.rgb * mask, color.a * mask);
}
