struct BloomUniforms {
  preBlackLevel: f32, // 0.05
  preGamma: f32, // 1.0
  preBrightness: f32, // 2.0
  minBloomRadius: f32, // 0.1
  maxBloomRadius: f32, // 0.6
  bloomThreshold: f32, // 0.12
  bloomSCurve: f32, // 0.35
  bloomFill: f32, // 0.25
  bloomIntensity: f32, // 1.1
  outputMode: u32, // 0
  inputImage: f32, // 1.0
};

fn saturateVec3(value: vec3f) -> vec3f {
  return clamp(value, vec3f(0.0), vec3f(1.0));
}

fn saturateScalar(value: f32) -> f32 {
  return clamp(value, 0.0, 1.0);
}

fn applyPreprocess(color: vec3f, uniforms: BloomUniforms) -> vec3f {
  var isolated = max(color - vec3f(uniforms.preBlackLevel), vec3f(0.0));
  isolated = isolated * uniforms.preBrightness;
  let gamma = max(uniforms.preGamma, 1e-6);
  let invGamma = 1.0 / gamma;
  isolated = pow(max(isolated, vec3f(0.0)), vec3f(invGamma));
  return saturateVec3(isolated);
}

fn applyThreshold(value: vec3f, threshold: f32) -> vec3f {
  return max(value - vec3f(threshold), vec3f(0.0));
}

fn applySCurve(value: vec3f, amount: f32) -> vec3f {
  let t = saturateScalar(amount);
  if (t <= 0.0) {
    return value;
  }
  let smoothVal = value * value * (3.0 - 2.0 * value);
  return mix(value, smoothVal, vec3f(t));
}

fn computeRadiusUv(radiusNorm: f32, fill: f32, texelSize: vec2f) -> vec2f {
  let safeNorm = saturateScalar(radiusNorm);
  let spread = 1.0 + fill * 6.0;
  let radiusPixels = (1.0 + safeNorm * 6.0) * spread;
  return radiusPixels * texelSize;
}

fn pass0(uv: vec2f, uniforms: BloomUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let baseColor = textureSample(src, srcSampler, uv);
  let processed = applyPreprocess(baseColor.rgb, uniforms);
  let alpha = max(max(processed.r, processed.g), processed.b);
  return vec4f(processed, alpha);
}

fn pass1(
  uv: vec2f,
  uniforms: BloomUniforms,
  src: texture_2d<f32>,
  srcSampler: sampler,
  pass0Texture: texture_2d<f32>,
  pass0Sampler: sampler,
) -> vec4f {
  let baseColor = textureSample(src, srcSampler, uv);
  let preColor = textureSample(pass0Texture, pass0Sampler, uv).rgb;

  let dims = textureDimensions(pass0Texture);
  let texelSize = vec2f(
    select(1.0 / f32(dims.x), 0.0, dims.x == 0u),
    select(1.0 / f32(dims.y), 0.0, dims.y == 0u),
  );
  let minRadius = min(uniforms.minBloomRadius, uniforms.maxBloomRadius);
  let maxRadius = max(uniforms.minBloomRadius, uniforms.maxBloomRadius);
  var accum = preColor;
  var totalWeight = 1.0;
  let levelCount = 6;
  for (var level = 0; level < levelCount; level = level + 1) {
    let t = f32(level + 1) / f32(levelCount);
    let radiusNorm = mix(minRadius, maxRadius, t);
    let offsetScale = computeRadiusUv(radiusNorm, uniforms.bloomFill, texelSize);
    let weightBase = 1.0 / (1.0 + radiusNorm * 8.0 + uniforms.bloomFill * 4.0);
    for (var i = 0; i < 8; i = i + 1) {
      var direction = vec2f(1.0, 0.0);
      switch u32(i) {
        case 0u: {
          direction = vec2f(1.0, 0.0);
        }
        case 1u: {
          direction = vec2f(-1.0, 0.0);
        }
        case 2u: {
          direction = vec2f(0.0, 1.0);
        }
        case 3u: {
          direction = vec2f(0.0, -1.0);
        }
        case 4u: {
          direction = vec2f(0.7071, 0.7071);
        }
        case 5u: {
          direction = vec2f(-0.7071, 0.7071);
        }
        case 6u: {
          direction = vec2f(0.7071, -0.7071);
        }
        default: {
          direction = vec2f(-0.7071, -0.7071);
        }
      }
      let offsetUV = uv + direction * offsetScale;
      let sampleColor = textureSample(pass0Texture, pass0Sampler, offsetUV).rgb;
      accum = accum + sampleColor * weightBase;
      totalWeight = totalWeight + weightBase;
    }
  }

  var bloom = accum / max(totalWeight, 1e-5);
  bloom = applyThreshold(bloom, uniforms.bloomThreshold);
  bloom = applySCurve(bloom, uniforms.bloomSCurve);
  bloom = bloom * uniforms.bloomIntensity;
  bloom = saturateVec3(bloom);

  let outputMode = uniforms.outputMode;
  let inputContribution = baseColor.rgb * uniforms.inputImage;

  let bloomAlpha = max(max(bloom.r, bloom.g), bloom.b);
  var finalColor = vec3f(0.0);
  var finalAlpha = baseColor.a;

  switch outputMode {
    case 1u: { // Input only
      finalColor = inputContribution;
      finalAlpha = baseColor.a;
    }
    case 2u: { // Preprocess preview
      finalColor = preColor;
      finalAlpha = 1.0;
    }
    case 3u: { // Bloom only
      finalColor = bloom;
      finalAlpha = 1.0;
    }
    case 4u: { // Bloom with alpha
      finalColor = bloom;
      finalAlpha = bloomAlpha;
    }
    default: { // Input + Bloom
      finalColor = saturateVec3(inputContribution + bloom);
      finalAlpha = baseColor.a;
    }
  }

  return vec4f(finalColor, finalAlpha);
}
