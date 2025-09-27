struct LevelUniforms {
  clampInputMode: u32,
  invert: u32,
  blackLevel: f32,
  brightness1: f32,
  gamma1: f32,
  contrast: f32,
  inLow: f32,
  inHigh: f32,
  outLow: f32,
  outHigh: f32,
  lowRGBA: vec4f,
  highRGBA: vec4f,
  stepping: u32,
  stepSize: f32,
  stepThreshold: f32,
  stepClampLow: f32,
  stepClampHigh: f32,
  stepSoften: f32,
  gamma2: f32,
  brightness2: f32,
  opacity: f32,
  postClamp: f32,
};

fn levelEffect(uv: vec2f, uniforms: LevelUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  var color = textureSample(src, srcSampler, uv);
  var rgb = color.rgb;
  var alpha = color.a;

  if (uniforms.clampInputMode != 2u) {
    rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
    alpha = clamp(alpha, 0.0, 1.0);
  }

  if (uniforms.invert != 0u) {
    rgb = vec3f(1.0) - rgb;
  }

  rgb = max(rgb - vec3f(uniforms.blackLevel), vec3f(0.0));
  rgb = rgb + vec3f(uniforms.brightness1);
  let gammaOne = max(uniforms.gamma1, 1e-6);
  rgb = pow(max(rgb, vec3f(0.0)), vec3f(1.0 / gammaOne));
  rgb = (rgb - vec3f(0.5)) * uniforms.contrast + vec3f(0.5);

  let range = max(uniforms.inHigh - uniforms.inLow, 1e-6);
  let normalized = clamp((rgb - vec3f(uniforms.inLow)) / range, vec3f(0.0), vec3f(1.0));
  let outRange = uniforms.outHigh - uniforms.outLow;
  rgb = vec3f(uniforms.outLow) + normalized * outRange;

  let lowVec = uniforms.lowRGBA.xyz;
  let highVec = uniforms.highRGBA.xyz;
  rgb = clamp(rgb, lowVec, highVec);
  alpha = clamp(alpha, uniforms.lowRGBA.w, uniforms.highRGBA.w);

  if (uniforms.stepping != 0u && uniforms.stepSize > 1e-6) {
    let originalRgb = rgb;
    let step = uniforms.stepSize;
    let shifted = (rgb + vec3f(uniforms.stepThreshold)) / step;
    let quantized = floor(shifted) * step;
    let clamped = clamp(quantized, vec3f(uniforms.stepClampLow), vec3f(uniforms.stepClampHigh));
    let softenAmount = clamp(uniforms.stepSoften, 0.0, 1.0);
    rgb = mix(clamped, originalRgb, vec3f(softenAmount));
  }

  rgb = rgb + vec3f(uniforms.brightness2);
  let gammaTwo = max(uniforms.gamma2, 1e-6);
  rgb = pow(max(rgb, vec3f(0.0)), vec3f(1.0 / gammaTwo));

  if (uniforms.postClamp < 1e9) {
    rgb = min(rgb, vec3f(uniforms.postClamp));
  }

  alpha = clamp(alpha * uniforms.opacity, 0.0, 1.0);

  return vec4f(rgb, alpha);
}
