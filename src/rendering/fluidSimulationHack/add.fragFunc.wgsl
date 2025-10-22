fn pass0(
  uv: vec2f,
  base: texture_2d<f32>,
  baseSampler: sampler,
  delta: texture_2d<f32>,
  deltaSampler: sampler,
) -> vec4f {
  let b = textureSample(base, baseSampler, uv);
  let d = textureSample(delta, deltaSampler, uv);
  return b + d;
}
