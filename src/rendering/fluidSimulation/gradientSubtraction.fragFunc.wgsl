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
  
  let center = textureSample(pressure, pressureSampler, clamp(uv, vec2f(0.0), vec2f(1.0))).x;
  
  let leftUv = uv - vec2f(texel.x, 0.0);
  var pL = textureSample(pressure, pressureSampler, clamp(leftUv, vec2f(0.0), vec2f(1.0))).x;
  if (leftUv.x < 0.0) {
    pL = center;
  }
  
  let rightUv = uv + vec2f(texel.x, 0.0);
  var pR = textureSample(pressure, pressureSampler, clamp(rightUv, vec2f(0.0), vec2f(1.0))).x;
  if (rightUv.x > 1.0) {
    pR = center;
  }
  
  let bottomUv = uv - vec2f(0.0, texel.y);
  var pB = textureSample(pressure, pressureSampler, clamp(bottomUv, vec2f(0.0), vec2f(1.0))).x;
  if (bottomUv.y < 0.0) {
    pB = center;
  }
  
  let topUv = uv + vec2f(0.0, texel.y);
  var pT = textureSample(pressure, pressureSampler, clamp(topUv, vec2f(0.0), vec2f(1.0))).x;
  if (topUv.y > 1.0) {
    pT = center;
  }
  
  let gradient = vec2f(pR - pL, pT - pB);
  
  let projectedVel = vel - gradient;
  
  return vec4f(projectedVel, 0.0, 1.0);
}
