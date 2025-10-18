fn texelSize(textureRef: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(textureRef);
  let sx = select(1.0 / f32(dims.x), 0.0, dims.x == 0u);
  let sy = select(1.0 / f32(dims.y), 0.0, dims.y == 0u);
  return vec2f(sx, sy);
}

fn pass0(
  uv: vec2f,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
) -> vec4f {
  let texel = texelSize(velocity);
  let center = textureSample(velocity, velocitySampler, uv).xy;

  let leftUv = uv - vec2f(texel.x, 0.0);
  var leftY = textureSample(velocity, velocitySampler, leftUv).y;

  let rightUv = uv + vec2f(texel.x, 0.0);
  var rightY = textureSample(velocity, velocitySampler, rightUv).y;

  let bottomUv = uv + vec2f(0.0, texel.y);
  var bottomX = textureSample(velocity, velocitySampler, bottomUv).x;

  let topUv = uv - vec2f(0.0, texel.y);
  var topX = textureSample(velocity, velocitySampler, topUv).x;

  let curl = (rightY - leftY) - (topX - bottomX);
  return vec4f(0.5 * curl, 0.0, 0.0, 1.0);
}
