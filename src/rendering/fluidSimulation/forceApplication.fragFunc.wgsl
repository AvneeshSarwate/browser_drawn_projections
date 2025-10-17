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
  
  let forceSample = textureSample(forces, forcesSampler, vec2f(uv.x, 1.0 - uv.y));
  
  let a = max(forceSample.a, 1e-4);
  let forceDir = forceSample.xy / a;
  let encodedForce = forceDir * 2.0 - vec2f(1.0);
  
  let newVel = vel + encodedForce * uniforms.forceStrength * a;
  
  return vec4f(newVel, 0.0, 1.0);
}
