struct InvertUniforms {
  strength: f32,
};

fn pass0(uv: vec2f, uniforms: InvertUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let color = textureSample(src, srcSampler, uv);
  let inverted = vec4f(1.0 - color.rgb, color.a);
  return mix(color, inverted, uniforms.strength);
}
