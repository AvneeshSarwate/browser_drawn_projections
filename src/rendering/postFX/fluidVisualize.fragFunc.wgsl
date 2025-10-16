struct FluidVisualizeUniforms {
  velocityScale: f32, // 0.5
  densityScale: f32, // 1.0
  tint: vec3f, // [0.2, 0.6, 1.0]
  background: vec3f, // [0.02, 0.02, 0.025]
};

fn pass0(
  uv: vec2f,
  uniforms: FluidVisualizeUniforms,
  state: texture_2d<f32>,
  stateSampler: sampler,
) -> vec4f {
  let sample = textureSample(state, stateSampler, uv);
  let velocity = sample.xy;
  let density = clamp(sample.z * uniforms.densityScale, 0.0, 1.0);
  let curlIntensity = abs(sample.w);
  let swirlColor = vec3f(velocity.x, velocity.y, curlIntensity) * uniforms.velocityScale + vec3f(0.5);
  let densityColor = uniforms.tint * density;
  let color = mix(swirlColor, densityColor, density);
  color = mix(uniforms.background, color, clamp(density + curlIntensity * 0.25, 0.0, 1.0));
  return vec4f(color, 1.0);
}
