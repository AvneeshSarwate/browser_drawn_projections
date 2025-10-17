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
  
  let vL = textureSample(velocity, velocitySampler, uv - vec2f(texel.x, 0.0)).x;
  let vR = textureSample(velocity, velocitySampler, uv + vec2f(texel.x, 0.0)).x;
  let vB = textureSample(velocity, velocitySampler, uv - vec2f(0.0, texel.y)).y;
  let vT = textureSample(velocity, velocitySampler, uv + vec2f(0.0, texel.y)).y;
  
  let div = 0.5 * (vR - vL + vT - vB);
  
  return vec4f(div, 0.0, 0.0, 1.0);
}
