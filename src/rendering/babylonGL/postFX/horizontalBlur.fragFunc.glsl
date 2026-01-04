struct HorizontalBlurUniforms {
  int pixels;
  float resolution;
};

vec4 pass0(vec2 uv, HorizontalBlurUniforms uniforms, sampler2D src) {
  if (uniforms.pixels <= 0) {
    return texture(src, uv);
  }

  vec4 color = vec4(0.0);
  float total = 0.0;
  float offset = 1.0 / uniforms.resolution;

  for (int i = -uniforms.pixels; i <= uniforms.pixels; i++) {
    float weight = 1.0 - (abs(float(i)) / float(uniforms.pixels + 1));
    vec2 sampleUV = uv + vec2(offset * float(i), 0.0);
    color += texture(src, sampleUV) * weight;
    total += weight;
  }

  return color / total;
}
