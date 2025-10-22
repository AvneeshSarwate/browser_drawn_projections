struct SplatUniforms {
  point: vec2<f32>,
  color: vec3<f32>,
  radius: f32,
  aspectRatio: f32,
}

fn pass0(
  uv: vec2f,
  uniforms: SplatUniforms,
  splatTarget: texture_2d<f32>,
  splatTargetSampler: sampler,
) -> vec4f {
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  let base = textureSample(splatTarget, splatTargetSampler, clampedUv);

  var offset = clampedUv - uniforms.point;
  offset.x = offset.x * uniforms.aspectRatio;

  let influence = exp(-dot(offset, offset) / max(uniforms.radius, 1e-6));
  let added = uniforms.color * influence;
  return vec4f(base.xyz + added, base.w);
}
