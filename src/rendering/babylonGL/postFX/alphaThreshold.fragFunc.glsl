struct AlphaThresholdUniforms {
  float threshold;
};

vec4 pass0(vec2 uv, AlphaThresholdUniforms uniforms, sampler2D src) {
  vec4 color = texture(src, uv);
  float newAlpha = color.a > uniforms.threshold ? 1.0 : 0.0;
  return vec4(color.rgb, newAlpha);
}
