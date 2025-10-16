struct ReactionVisualizeUniforms {
  colorA: vec3f, // [0.1, 0.05, 0.12]
  colorB: vec3f, // [0.9, 0.95, 0.8]
  edgeColor: vec3f, // [0.2, 0.3, 0.6]
  contrast: f32, // 1.4
};

fn softSaturate(value: vec3f) -> vec3f {
  return clamp(value, vec3f(0.0), vec3f(1.0));
}

fn pass0(
  uv: vec2f,
  uniforms: ReactionVisualizeUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
) -> vec4f {
  let sample = textureSample(state, stateSampler, uv);
  let a = sample.x;
  let b = sample.y;
  let pigment = clamp(sample.z, 0.0, 1.0);
  let mixFactor = clamp(pow(b - a, uniforms.contrast), 0.0, 1.0);
  let baseColor = mix(uniforms.colorA, uniforms.colorB, mixFactor);
  let finalColor = mix(baseColor, uniforms.edgeColor, pigment);
  return vec4f(softSaturate(finalColor), 1.0);
}
