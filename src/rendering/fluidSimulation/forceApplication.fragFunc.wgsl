struct ForceApplicationUniforms {
  forceStrength: f32,
};

fn pass0(
  uv: vec2f,
  uniforms: ForceApplicationUniforms,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
  forces: texture_2d<f32>,
  forcesSampler: sampler,
) -> vec4f {
  let vel = textureSample(velocity, velocitySampler, uv).xy;
  
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  let forceSample = textureSample(forces, forcesSampler, clampedUv);
  let intensity = clamp(forceSample.a, 0.0, 1.0);
  let encodedForce = forceSample.xy * 2.0 - vec2f(1.0);
  
  let newVel = vel + encodedForce * uniforms.forceStrength * intensity;
  
  return vec4f(newVel, 0.0, 1.0);
}
