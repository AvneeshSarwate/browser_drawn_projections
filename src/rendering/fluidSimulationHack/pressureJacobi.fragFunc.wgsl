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
  let center = textureSample(pressure, pressureSampler, uv).x;

  let leftUv = uv - vec2f(texel.x, 0.0);
  var pL = textureSample(pressure, pressureSampler, leftUv).x;

  let rightUv = uv + vec2f(texel.x, 0.0);
  var pR = textureSample(pressure, pressureSampler, rightUv).x;

  let bottomUv = uv + vec2f(0.0, texel.y);
  var pB = textureSample(pressure, pressureSampler, bottomUv).x;

  let topUv = uv - vec2f(0.0, texel.y);
  var pT = textureSample(pressure, pressureSampler, topUv).x;

  let div = textureSample(divergence, divergenceSampler, uv).x;

  let p = 0.25 * (pL + pR + pB + pT - div);
  
  return vec4f(p, 0.0, 0.0, 1.0);
}
