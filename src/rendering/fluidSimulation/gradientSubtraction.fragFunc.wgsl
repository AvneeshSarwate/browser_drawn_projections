fn texelSize(tex: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(tex);
  return 1.0 / vec2f(f32(dims.x), f32(dims.y));
}

fn pass0(
  uv: vec2f,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
  pressure: texture_2d<f32>,
  pressureSampler: sampler,
) -> vec4f {
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  let texel = texelSize(pressure);
  
  let pL = textureSample(pressure, pressureSampler, uv - vec2f(texel.x, 0.0)).x;
  let pR = textureSample(pressure, pressureSampler, uv + vec2f(texel.x, 0.0)).x;
  let pB = textureSample(pressure, pressureSampler, uv - vec2f(0.0, texel.y)).x;
  let pT = textureSample(pressure, pressureSampler, uv + vec2f(0.0, texel.y)).x;
  
  let gradient = vec2f(pR - pL, pT - pB);
  
  let projectedVel = vel - gradient;
  
  return vec4f(projectedVel, 0.0, 1.0);
}
