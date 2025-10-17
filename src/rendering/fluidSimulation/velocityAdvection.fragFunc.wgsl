struct VelocityAdvectionUniforms {
  timeStep: f32,
  dissipation: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: VelocityAdvectionUniforms,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
) -> vec4f {
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  let prevUv = uv - vel * uniforms.timeStep;
  
  let advectedVel = textureSample(velocity, velocitySampler, prevUv).xy;
  
  let finalVel = advectedVel * uniforms.dissipation;
  
  return vec4f(finalVel, 0.0, 1.0);
}
