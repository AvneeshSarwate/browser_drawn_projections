struct PixelateUniforms {
  float pixelSize; // 1.0 min=1.0 max=64.0 step=1.0
};

vec4 pass0(vec2 uv, PixelateUniforms uniforms, sampler2D src) {
  ivec2 dims = textureSize(src, 0);
  vec2 res = vec2(
    dims.x > 0 ? float(dims.x) : 1.0,
    dims.y > 0 ? float(dims.y) : 1.0
  );
  float size = max(uniforms.pixelSize, 1.0);
  vec2 pixelatedUV = floor(uv * res / size) * (size / res);
  return texture(src, pixelatedUV);
}
