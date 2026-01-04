struct WebcamPixelUniforms {
  float pixelSize;
  vec3 tint;
  float opacity;
};

vec2 vertShader(vec2 position, vec2 uv, WebcamPixelUniforms uniforms) {
  return position;
}

vec4 fragShader(
  vec2 uv,
  WebcamPixelUniforms uniforms,
  sampler2D webcamTex
) {
  float pixelSize = max(uniforms.pixelSize, 1.0);
  vec2 texSize = vec2(textureSize(webcamTex, 0));
  vec2 step = vec2(pixelSize, pixelSize) / texSize;
  vec2 uvClamped = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 quantUV = (floor(uvClamped / step) + vec2(0.5)) * step;
  vec4 pix = texture(webcamTex, quantUV);
  vec4 colorPassthru = texture(webcamTex, uv);
  vec4 color = uv.x > 0.5 ? pix : colorPassthru;
  return vec4(color.rgb * uniforms.tint, color.a * uniforms.opacity);
}
