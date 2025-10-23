struct SplatUniforms {
  mode: u32,
  splatType: u32,
  point: vec2<f32>,
  color: vec3<f32>,
  radius: f32,
  aspectRatio: f32,
  strength: f32,
  time: f32,
  shapeParams0: vec4<f32>,
  shapeParams1: vec4<f32>,
}

fn gaussianSplat(uv: vec2f, uniforms: SplatUniforms) -> vec4f {
  var offset = uv - uniforms.point;
  offset.x = offset.x * uniforms.aspectRatio;
  let influence = exp(-dot(offset, offset) / max(uniforms.radius, 1e-6));
  let delta = uniforms.color * influence;
  return vec4f(delta, influence);
}

fn rectangleSplat(uv: vec2f, uniforms: SplatUniforms) -> vec4f {
  let halfSize = max(uniforms.shapeParams0.xy, vec2f(1e-4, 1e-4));
  let baseAngle = uniforms.shapeParams0.z;
  let rotationSpeed = uniforms.shapeParams1.x;
  let pulseAmount = uniforms.shapeParams1.y;
  let pulseFrequency = uniforms.shapeParams1.z;
  let proceduralForce = uniforms.shapeParams1.w;
  let softness = max(uniforms.shapeParams0.w, 1e-3);
  let rotation = baseAngle + rotationSpeed * uniforms.time;
  let dynamicScale = 1.0 + pulseAmount * sin(uniforms.time * pulseFrequency);

  let offset = uv - uniforms.point;
  var local = offset;
  local.x = local.x * uniforms.aspectRatio;

  let cosTheta = cos(rotation);
  let sinTheta = sin(rotation);
  let rotated = vec2f(
    cosTheta * local.x + sinTheta * local.y,
    -sinTheta * local.x + cosTheta * local.y,
  );

  let effectiveHalfSize = halfSize * max(dynamicScale, 1e-3);
  let normalized = vec2f(rotated.x / effectiveHalfSize.x, rotated.y / effectiveHalfSize.y);
  let distance = max(abs(normalized.x), abs(normalized.y));
  let mask = 1.0 - smoothstep(1.0, 1.0 + softness, distance);

  let col = vec3f(0.0, 0.0, 0.0);
  var delta = vec3f(uniforms.color * mask);

  if (abs(proceduralForce) > 1e-5) {
    let tangential = vec2f(-offset.y, offset.x);
    let tangentialLength = length(tangential);
    if (tangentialLength > 1e-5) {
      let normalizedTangential = tangential / tangentialLength;
      let radiusFactor = clamp(length(normalized), 0.0, 1.0);
      let velocityMagnitude = proceduralForce * radiusFactor * mask;
      let velocityDelta = normalizedTangential * velocityMagnitude;
      delta = vec3f(delta.xy + velocityDelta, delta.z);
    }
  }

  return vec4f(delta, mask);
}

fn computeSplat(uv: vec2f, uniforms: SplatUniforms) -> vec4f {
  switch uniforms.splatType {
    case 0u {
      return gaussianSplat(uv, uniforms);
    }
    case 1u {
      return rectangleSplat(uv, uniforms);
    }
    default {
      return gaussianSplat(uv, uniforms);
    }
  }
}

// Pass 0: Compute the impulse delta for the selected procedural splat
// This is a pure function that computes the splat without reading base
fn pass0(
  uv: vec2f,
  uniforms: SplatUniforms,
  base: texture_2d<f32>,
  baseSampler: sampler,
) -> vec4f {
  let clampedUv = clamp(uv, vec2f(0.0), vec2f(1.0));
  return computeSplat(clampedUv, uniforms);
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
