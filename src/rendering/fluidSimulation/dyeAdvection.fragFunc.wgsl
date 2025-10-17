struct DyeAdvectionUniforms {
  timeStep: f32,
  dissipation: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: DyeAdvectionUniforms,
  dye: texture_2d<f32>,
  dyeSampler: sampler,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
) -> vec4f {
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  let prevUv = uv - vel * uniforms.timeStep;
  
  let advectedDye = textureSample(dye, dyeSampler, prevUv).xyz;
  
  let finalDye = advectedDye * uniforms.dissipation;
  
  return vec4f(finalDye, 1.0);
}
