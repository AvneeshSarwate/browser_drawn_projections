struct BloomUniforms {
  float preBlackLevel; // 0.05
  float preGamma; // 1.0
  float preBrightness; // 2.0
  float minBloomRadius; // 0.1
  float maxBloomRadius; // 0.6
  float bloomThreshold; // 0.12
  float bloomSCurve; // 0.35
  float bloomFill; // 0.25
  float bloomIntensity; // 1.1
  int outputMode; // 0
  float inputImage; // 1.0
};

vec3 saturateVec3(vec3 value) {
  return clamp(value, vec3(0.0), vec3(1.0));
}

float saturateScalar(float value) {
  return clamp(value, 0.0, 1.0);
}

vec3 applyPreprocess(vec3 color, BloomUniforms uniforms) {
  vec3 isolated = max(color - vec3(uniforms.preBlackLevel), vec3(0.0));
  isolated = isolated * uniforms.preBrightness;
  float gamma = max(uniforms.preGamma, 1e-6);
  float invGamma = 1.0 / gamma;
  isolated = pow(max(isolated, vec3(0.0)), vec3(invGamma));
  return saturateVec3(isolated);
}

vec3 applyThreshold(vec3 value, float threshold) {
  return max(value - vec3(threshold), vec3(0.0));
}

vec3 applySCurve(vec3 value, float amount) {
  float t = saturateScalar(amount);
  if (t <= 0.0) {
    return value;
  }
  vec3 smoothVal = value * value * (3.0 - 2.0 * value);
  return mix(value, smoothVal, vec3(t));
}

vec2 computeRadiusUv(float radiusNorm, float fill, vec2 texelSize) {
  float safeNorm = saturateScalar(radiusNorm);
  float spread = 1.0 + fill * 6.0;
  float radiusPixels = (1.0 + safeNorm * 6.0) * spread;
  return radiusPixels * texelSize;
}

vec4 pass0(vec2 uv, BloomUniforms uniforms, sampler2D src) {
  vec4 baseColor = texture(src, uv);
  vec3 processed = applyPreprocess(baseColor.rgb, uniforms);
  float alpha = max(max(processed.r, processed.g), processed.b);
  return vec4(processed, alpha);
}

vec4 pass1(vec2 uv, BloomUniforms uniforms, sampler2D src, sampler2D pass0Texture) {
  vec4 baseColor = texture(src, uv);
  vec3 preColor = texture(pass0Texture, uv).rgb;

  ivec2 dims = textureSize(pass0Texture, 0);
  vec2 texelSize = vec2(
    dims.x == 0 ? 0.0 : (1.0 / float(dims.x)),
    dims.y == 0 ? 0.0 : (1.0 / float(dims.y))
  );
  float minRadius = min(uniforms.minBloomRadius, uniforms.maxBloomRadius);
  float maxRadius = max(uniforms.minBloomRadius, uniforms.maxBloomRadius);
  vec3 accum = preColor;
  float totalWeight = 1.0;
  int levelCount = 6;
  for (int level = 0; level < levelCount; level++) {
    float t = float(level + 1) / float(levelCount);
    float radiusNorm = mix(minRadius, maxRadius, t);
    vec2 offsetScale = computeRadiusUv(radiusNorm, uniforms.bloomFill, texelSize);
    float weightBase = 1.0 / (1.0 + radiusNorm * 8.0 + uniforms.bloomFill * 4.0);
    for (int i = 0; i < 8; i++) {
      vec2 direction = vec2(1.0, 0.0);
      if (i == 1) {
        direction = vec2(-1.0, 0.0);
      } else if (i == 2) {
        direction = vec2(0.0, 1.0);
      } else if (i == 3) {
        direction = vec2(0.0, -1.0);
      } else if (i == 4) {
        direction = vec2(0.7071, 0.7071);
      } else if (i == 5) {
        direction = vec2(-0.7071, 0.7071);
      } else if (i == 6) {
        direction = vec2(0.7071, -0.7071);
      } else if (i == 7) {
        direction = vec2(-0.7071, -0.7071);
      }
      vec2 offsetUV = uv + direction * offsetScale;
      vec3 sampleColor = texture(pass0Texture, offsetUV).rgb;
      accum += sampleColor * weightBase;
      totalWeight += weightBase;
    }
  }

  vec3 bloom = accum / max(totalWeight, 1e-5);
  bloom = applyThreshold(bloom, uniforms.bloomThreshold);
  bloom = applySCurve(bloom, uniforms.bloomSCurve);
  bloom = bloom * uniforms.bloomIntensity;
  bloom = saturateVec3(bloom);

  int outputMode = uniforms.outputMode;
  vec3 inputContribution = baseColor.rgb * uniforms.inputImage;

  float bloomAlpha = max(max(bloom.r, bloom.g), bloom.b);
  vec3 finalColor = vec3(0.0);
  float finalAlpha = baseColor.a;

  if (outputMode == 1) {
    finalColor = inputContribution;
    finalAlpha = baseColor.a;
  } else if (outputMode == 2) {
    finalColor = preColor;
    finalAlpha = 1.0;
  } else if (outputMode == 3) {
    finalColor = bloom;
    finalAlpha = 1.0;
  } else if (outputMode == 4) {
    finalColor = bloom;
    finalAlpha = bloomAlpha;
  } else {
    finalColor = saturateVec3(inputContribution + bloom);
    finalAlpha = baseColor.a;
  }

  return vec4(finalColor, finalAlpha);
}
