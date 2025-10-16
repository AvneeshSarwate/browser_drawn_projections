fn pass0(
  uv: vec2f,
  left: texture_2d<f32>,
  leftSampler: sampler,
  right: texture_2d<f32>,
  rightSampler: sampler,
) -> vec4f {
  let halfSplit = 0.5;
  if (uv.x < halfSplit) {
    let localUv = vec2f(uv.x / halfSplit, uv.y);
    return textureSample(left, leftSampler, localUv);
  }
  let localUv = vec2f((uv.x - halfSplit) / (1.0 - halfSplit), uv.y);
  return textureSample(right, rightSampler, localUv);
}
