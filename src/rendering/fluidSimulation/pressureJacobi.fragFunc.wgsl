fn safeSample(tex: texture_2d<f32>, samp: sampler, uv: vec2f) -> f32 {
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  return textureSample(tex, samp, clampedUv).x;
}

fn texelSize(tex: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(tex);
  return vec2f(
    select(1.0 / f32(dims.x), 0.0, dims.x == 0u),
    select(1.0 / f32(dims.y), 0.0, dims.y == 0u)
  );
}

fn pass0(
  uv: vec2f,
  pressure: texture_2d<f32>,
  pressureSampler: sampler,
  divergence: texture_2d<f32>,
  divergenceSampler: sampler,
) -> vec4f {
  let texel = texelSize(pressure);
  
  let pL = safeSample(pressure, pressureSampler, uv - vec2f(texel.x, 0.0));
  let pR = safeSample(pressure, pressureSampler, uv + vec2f(texel.x, 0.0));
  let pB = safeSample(pressure, pressureSampler, uv - vec2f(0.0, texel.y));
  let pT = safeSample(pressure, pressureSampler, uv + vec2f(0.0, texel.y));
  
  let div = safeSample(divergence, divergenceSampler, uv);
  
  let p = 0.25 * (pL + pR + pB + pT - div);
  
  return vec4f(p, 0.0, 0.0, 1.0);
}
