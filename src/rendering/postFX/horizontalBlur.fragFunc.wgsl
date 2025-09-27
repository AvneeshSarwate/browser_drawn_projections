struct HorizontalBlurUniforms {
  pixels: i32,
  resolution: f32,
};

fn pass0(uv: vec2f, uniforms: HorizontalBlurUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  var color = vec4f(0.0);
  var total = 0.0;
  let offset = 1.0 / uniforms.resolution;
  var i: i32 = -uniforms.pixels;
  loop {
    let weight = 1.0 - (abs(f32(i)) / f32(uniforms.pixels + 1));
    let sampleUV = uv + vec2f(offset * f32(i), 0.0);
    color = color + textureSample(src, srcSampler, sampleUV) * weight;
    total = total + weight;
    if (i >= uniforms.pixels) {
      break;
    }
    i = i + 1;
  }
  return color / total;
}
