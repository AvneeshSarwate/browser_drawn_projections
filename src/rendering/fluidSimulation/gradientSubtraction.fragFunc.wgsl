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
  var pL = textureSample(pressure, pressureSampler, leftUv).x;
  
  let rightUv = uv + vec2f(texel.x, 0.0);
  var pR = textureSample(pressure, pressureSampler, rightUv).x;
  
  let topUv = uv + vec2f(0.0, texel.y);
  var pT = textureSample(pressure, pressureSampler, topUv).x;
  
  let bottomUv = uv - vec2f(0.0, texel.y);
  var pB = textureSample(pressure, pressureSampler, bottomUv).x;
  
  let gradient = vec2f(pR - pL, pT - pB);
  
  let projectedVel = vel - gradient;
  
  return vec4f(projectedVel, 0.0, 1.0);
}
