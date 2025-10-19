struct SplatUniforms {
  mode: u32,
  point: vec2<f32>,
  color: vec3<f32>,
  radius: f32,
  aspectRatio: f32,
  strength: f32,
}

// Pass 0: Compute the Gaussian impulse delta
// This is a pure function that computes the splat without reading base
fn pass0(
  uv: vec2f,
  uniforms: SplatUniforms,
  base: texture_2d<f32>,
  baseSampler: sampler,
) -> vec4f {
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  
  var offset = clampedUv - uniforms.point;
  offset.x = offset.x * uniforms.aspectRatio;
  
  let influence = exp(-dot(offset, offset) / max(uniforms.radius, 1e-6));
  let delta = uniforms.color * influence;
  
  return vec4f(delta, 1.0);
}

// Pass 1: Apply the delta to the base based on mode
fn pass1(
  uv: vec2f,
  uniforms: SplatUniforms,
  base: texture_2d<f32>,
  baseSampler: sampler,
  pass0Texture: texture_2d<f32>,
  pass0Sampler: sampler,
) -> vec4f {
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  let baseColor = textureSample(base, baseSampler, clampedUv);
  let delta = textureSample(pass0Texture, pass0Sampler, clampedUv);
  
  // Mode-based behavior
  if (uniforms.mode == 0u) {
    // Passthrough mode: just return base
    return baseColor;
  } else if (uniforms.mode == 1u) {
    // Additive mode: add delta * strength to base
    return vec4f(baseColor.xyz + delta.xyz * uniforms.strength, 1.0);
  } else {
    // Reserved for exotic operations (mode >= 2)
    return baseColor;
  }
}
