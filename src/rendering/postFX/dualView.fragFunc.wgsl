fn pass0(
  uv: vec2f,
  left: texture_2d<f32>,
  leftSampler: sampler,
  right: texture_2d<f32>,
  rightSampler: sampler,
) -> vec4f {
  let halfSplit = 0.5;
  let leftUv = vec2f(uv.x / halfSplit, uv.y);
  let rightUv = vec2f((uv.x - halfSplit) / (1.0 - halfSplit), uv.y);
  
  let leftSample = textureSample(left, leftSampler, leftUv);
  let rightSample = textureSample(right, rightSampler, rightUv);
  
  return select(rightSample, leftSample, uv.x < halfSplit);
}
