fn texelSize(tex: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(tex);
  return 1.0 / vec2f(f32(dims.x), f32(dims.y));
}

fn pass0(
  uv: vec2f,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
) -> vec4f {
  let texel = texelSize(velocity);
  let center = textureSample(velocity, velocitySampler, clamp(uv, vec2f(0.0), vec2f(1.0))).xy;
  
  let leftUv = uv - vec2f(texel.x, 0.0);
  var left = textureSample(velocity, velocitySampler, leftUv).xy;
  if (leftUv.x < 0.0) {
    left.x = -center.x;
  }
  
  let rightUv = uv + vec2f(texel.x, 0.0);
  var right = textureSample(velocity, velocitySampler, rightUv).xy;
  if (rightUv.x > 1.0) {
    right.x = -center.x;
  }
  
  let topUv = uv + vec2f(0.0, texel.y);
  var top = textureSample(velocity, velocitySampler, topUv).xy;
  if (topUv.y > 1.0) {
    top.y = -center.y;
  }
  
  let bottomUv = uv - vec2f(0.0, texel.y);
  var bottom = textureSample(velocity, velocitySampler, bottomUv).xy;
  if (bottomUv.y < 0.0) {
    bottom.y = -center.y;
  }
  
  let div = 0.5 * ((right.x - left.x) + (top.y - bottom.y));
  
  return vec4f(div, 0.0, 0.0, 1.0);
}
