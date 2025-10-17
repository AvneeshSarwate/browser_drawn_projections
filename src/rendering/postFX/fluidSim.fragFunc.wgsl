struct FluidSimUniforms {
  timeStep: f32, // 0.016
  velocityDissipation: f32, // 0.985
  densityDissipation: f32, // 0.995
  swirlStrength: f32, // 2.5
  turbulence: f32, // 0.2
  forceRadius: f32, // 0.12
  forceStrength: f32, // 18.0
  attraction: f32, // 0.35
  forcePosition: vec2f, // [0.5, 0.5]
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

fn advectUv(uv: vec2f, velocity: vec2f, delta: f32) -> vec2f {
  return clamp(uv - velocity * delta, vec2f(0.0), vec2f(1.0));
}

fn computeCurl(
  textureRef: texture_2d<f32>,
  samplerRef: sampler,
  uv: vec2f,
  texel: vec2f,
) -> f32 {
  let right = safeSample(textureRef, samplerRef, uv + vec2f(texel.x, 0.0)).xy;
  let left = safeSample(textureRef, samplerRef, uv - vec2f(texel.x, 0.0)).xy;
  let up = safeSample(textureRef, samplerRef, uv + vec2f(0.0, texel.y)).xy;
  let down = safeSample(textureRef, samplerRef, uv - vec2f(0.0, texel.y)).xy;
  let dY = right.y - left.y;
  let dX = up.x - down.x;
  return dY - dX;
}

fn applyForceField(
  uv: vec2f,
  uniforms: FluidSimUniforms,
  baseVelocity: vec2f,
  baseDensity: f32,
  forces: vec4f,
  curl: f32,
) -> vec4f {
  var velocity = baseVelocity;
  var density = baseDensity;

  let toCenter = uv - uniforms.forcePosition;
  let radius = max(uniforms.forceRadius, 1e-3);
  let dist = length(toCenter);
  let normalized = toCenter / max(dist, 1e-4);
  let radialFalloff = exp(-pow(dist / radius, 2.0));
  let swirlDir = vec2f(-normalized.y, normalized.x);
  velocity = velocity + swirlDir * uniforms.swirlStrength * radialFalloff;
  velocity = velocity - normalized * uniforms.attraction * radialFalloff;

  let turbulenceForce = vec2f(-curl, curl) * uniforms.turbulence;
  velocity = velocity + turbulenceForce;

  let encodedForce = forces.xy * 2.0 - vec2f(1.0);
  velocity = velocity + encodedForce * uniforms.forceStrength * forces.a;
  density = density + forces.z * (uniforms.forceStrength * 0.1) * forces.a;

  return vec4f(velocity, density, 1.0);
}

fn pass0(
  uv: vec2f,
  uniforms: FluidSimUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
  forces: texture_2d<f32>,
  forcesSampler: sampler,
) -> vec4f {
  let currentState = safeSample(state, stateSampler, uv);
  let texel = texelSize(state);
  let advectedUv = advectUv(uv, currentState.xy, uniforms.timeStep);
  let advectedState = safeSample(state, stateSampler, advectedUv);
  let curl = computeCurl(state, stateSampler, uv, texel);
  let forceSample = safeSample(forces, forcesSampler, uv);

  let blendedVelocity = mix(advectedState.xy, currentState.xy, 0.25);
  let blendedDensity = mix(advectedState.z, currentState.z, 0.35);

  let forced = applyForceField(uv, uniforms, blendedVelocity, blendedDensity, forceSample, curl);

  var velocity = forced.xy * uniforms.velocityDissipation;
  var density = forced.z * uniforms.densityDissipation;

  return vec4f(velocity, density, curl);
}

fn pass1(
  uv: vec2f,
  uniforms: FluidSimUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
  forces: texture_2d<f32>,
  forcesSampler: sampler,
  pass0Texture: texture_2d<f32>,
  pass0Sampler: sampler,
) -> vec4f {
  let texel = texelSize(pass0Texture);
  var accumVelocity = vec2f(0.0);
  var accumDensity = 0.0;
  var weightSum = 0.0;
  for (var x = -1; x <= 1; x = x + 1) {
    for (var y = -1; y <= 1; y = y + 1) {
      let offset = vec2f(f32(x), f32(y));
      let weight = select(2.0, 1.0, (x == 0 && y == 0));
      weightSum = weightSum + weight;
      let neighborUv = uv + offset * texel;
      let neighbor = safeSample(pass0Texture, pass0Sampler, neighborUv);
      accumVelocity = accumVelocity + neighbor.xy * weight;
      accumDensity = accumDensity + neighbor.z * weight;
    }
  }

  let velocity = accumVelocity / max(weightSum, 1e-4);
  let density = accumDensity / max(weightSum, 1e-4);

  let current = safeSample(pass0Texture, pass0Sampler, uv);
  let divergence = length(current.xy - velocity);

  return vec4f(velocity, density, divergence);
}

fn pass2(
  uv: vec2f,
  uniforms: FluidSimUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
  forces: texture_2d<f32>,
  forcesSampler: sampler,
  pass0Texture: texture_2d<f32>,
  pass0Sampler: sampler,
  pass1Texture: texture_2d<f32>,
  pass1Sampler: sampler,
) -> vec4f {
  let advected = safeSample(pass0Texture, pass0Sampler, uv);
  let relaxed = safeSample(pass1Texture, pass1Sampler, uv);
  var velocity = mix(advected.xy, relaxed.xy, 0.55);
  var density = mix(advected.z, relaxed.z, 0.4);
  let divergence = relaxed.w;
  let curl = advected.w;
  let alpha = clamp(density + divergence * 0.1 + abs(curl) * 0.05, 0.0, 1.0);
  return vec4f(velocity, density, alpha);
}
