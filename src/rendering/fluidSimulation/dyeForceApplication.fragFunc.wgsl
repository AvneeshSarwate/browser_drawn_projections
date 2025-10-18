struct DyeForceApplicationUniforms {
  injectionStrength: f32,
}

fn clampUv(uv: vec2f) -> vec2f {
  return clamp(uv, vec2f(0.0), vec2f(1.0));
}

fn pass0(
  uv: vec2f,
  uniforms: DyeForceApplicationUniforms,
  dye: texture_2d<f32>,
  dyeSampler: sampler,
  forces: texture_2d<f32>,
  forcesSampler: sampler,
) -> vec4f {
  let base = textureSample(dye, dyeSampler, clampUv(uv)).xyz;
  let forceSample = textureSample(forces, forcesSampler, vec2f(uv.x, 1.0 - uv.y));
  let intensity = clamp(forceSample.a, 0.0, 1.0);
  let injected = forceSample.rgb * (uniforms.injectionStrength * intensity);
  let result = min(base + injected, vec3f(1.0));
  return vec4f(result, 1.0);
}
