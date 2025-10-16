struct ReactionDiffusionUniforms {
  feed: f32, // 0.055
  kill: f32, // 0.062
  diffRateA: f32, // 1.0
  diffRateB: f32, // 0.5
  deltaT: f32, // 1.0
  brushRadius: f32, // 0.035
  brushStrength: f32, // 0.85
  noiseAmount: f32, // 0.02
  brushPosition: vec2f, // [0.5, 0.5]
};

fn safeSample(textureRef: texture_2d<f32>, samplerRef: sampler, uv: vec2f) -> vec4f {
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  return textureSample(textureRef, samplerRef, clampedUv);
}

fn texelSize(textureRef: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(textureRef);
  return vec2f(
    select(1.0 / f32(dims.x), 0.0, dims.x == 0u),
    select(1.0 / f32(dims.y), 0.0, dims.y == 0u),
  );
}

fn laplacian(textureRef: texture_2d<f32>, samplerRef: sampler, uv: vec2f, texel: vec2f) -> vec4f {
  let center = safeSample(textureRef, samplerRef, uv);
  var accum = vec2f(-center.xy * 1.0);
  let offsets = array<vec2f, 4>(
    vec2f(texel.x, 0.0),
    vec2f(-texel.x, 0.0),
    vec2f(0.0, texel.y),
    vec2f(0.0, -texel.y),
  );
  for (var i = 0; i < 4; i = i + 1) {
    let neighbor = safeSample(textureRef, samplerRef, uv + offsets[i]);
    accum = accum + neighbor.xy * 0.25;
  }
  return vec4f(accum, center.xy);
}

fn brushInfluence(uv: vec2f, uniforms: ReactionDiffusionUniforms) -> f32 {
  let radius = max(uniforms.brushRadius, 1e-3);
  let toCenter = uv - uniforms.brushPosition;
  let dist = length(toCenter);
  return exp(-pow(dist / radius, 2.0));
}

fn pass0(
  uv: vec2f,
  uniforms: ReactionDiffusionUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
  seed: texture_2d<f32>,
  seedSampler: sampler,
) -> vec4f {
  let texel = texelSize(state);
  let lap = laplacian(state, stateSampler, uv, texel);
  return lap;
}

fn pass1(
  uv: vec2f,
  uniforms: ReactionDiffusionUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
  seed: texture_2d<f32>,
  seedSampler: sampler,
  pass0Texture: texture_2d<f32>,
  pass0Sampler: sampler,
) -> vec4f {
  let lapData = safeSample(pass0Texture, pass0Sampler, uv);
  var a = lapData.z;
  var b = lapData.w;
  let lapA = lapData.x;
  let lapB = lapData.y;

  let reaction = a * b * b;
  let feedTerm = uniforms.feed * (1.0 - a);
  let killTerm = (uniforms.feed + uniforms.kill) * b;

  a = a + (uniforms.diffRateA * lapA - reaction + feedTerm) * uniforms.deltaT;
  b = b + (uniforms.diffRateB * lapB + reaction - killTerm) * uniforms.deltaT;

  let brush = brushInfluence(uv, uniforms) * uniforms.brushStrength;
  a = a - brush * 0.5;
  b = b + brush;

  let seedSample = safeSample(seed, seedSampler, uv);
  b = mix(b, max(b, seedSample.r), seedSample.a);
  a = mix(a, min(a, 1.0 - seedSample.g), seedSample.a);

  let noise = (fract(sin(dot(uv, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5) * uniforms.noiseAmount;
  b = b + noise;

  a = clamp(a, 0.0, 1.0);
  b = clamp(b, 0.0, 1.0);

  return vec4f(a, b, lapA, lapB);
}

fn pass2(
  uv: vec2f,
  uniforms: ReactionDiffusionUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
  seed: texture_2d<f32>,
  seedSampler: sampler,
  pass0Texture: texture_2d<f32>,
  pass0Sampler: sampler,
  pass1Texture: texture_2d<f32>,
  pass1Sampler: sampler,
) -> vec4f {
  let updated = safeSample(pass1Texture, pass1Sampler, uv);
  let a = updated.x;
  let b = updated.y;
  let lapA = updated.z;
  let lapB = updated.w;
  let edge = clamp(length(vec2f(lapA, lapB)) * 0.75, 0.0, 1.0);
  let pigment = clamp(b - a + edge, 0.0, 1.0);
  return vec4f(a, b, pigment, 1.0);
}
