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
  let dims = textureDimensions(velocity);
  let texel = vec2f(
    select(1.0 / f32(dims.x), 0.0, dims.x == 0u),
    select(1.0 / f32(dims.y), 0.0, dims.y == 0u),
  );
  let prevUv = clamp(uv - vel * uniforms.timeStep * texel, vec2f(0.0), vec2f(1.0));
  
  let advectedVel = textureSample(velocity, velocitySampler, prevUv).xy;
  
  let finalVel = advectedVel * uniforms.dissipation;
  
  return vec4f(finalVel, 0.0, 1.0);
}
