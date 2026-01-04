struct VerticalBlurUniforms {
  int pixels;
  float resolution;
};

vec4 pass0(vec2 uv, VerticalBlurUniforms uniforms, sampler2D src) {
  if (uniforms.pixels <= 0) {
    return texture(src, uv);
  }

  vec4 color = vec4(0.0);
  float total = 0.0;
  float offset = 1.0 / uniforms.resolution;

  for (int i = -uniforms.pixels; i <= uniforms.pixels; i++) {
    float weight = 1.0 - (abs(float(i)) / float(uniforms.pixels + 1));
    vec2 sampleUV = uv + vec2(0.0, offset * float(i));
    color += texture(src, sampleUV) * weight;
    total += weight;
  }

  return color / total;
}
