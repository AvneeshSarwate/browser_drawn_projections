struct PixelateUniforms {
  pixelSize: f32, // 1.0 min=1.0 max=64.0 step=1.0
};

fn pass0(uv: vec2f, uniforms: PixelateUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let dims = textureDimensions(src);
  let res = vec2f(
    select(1.0, f32(dims.x), dims.x > 0u),
    select(1.0, f32(dims.y), dims.y > 0u),
  );
  let size = max(uniforms.pixelSize, 1.0);
  let pixelatedUV = floor(uv * res / size) * (size / res);
  return textureSample(src, srcSampler, pixelatedUV);
}
