struct MathOpUniforms {
  preAdd: f32,
  postAdd: f32,
  mult: f32,
  colorOnly: bool,
};

fn mathOp(uv: vec2f, uniforms: MathOpUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let color = textureSample(src, srcSampler, uv);
  let factor = uniforms.mult + uniforms.preAdd;
  let offset = vec4f(uniforms.postAdd, uniforms.postAdd, uniforms.postAdd, uniforms.postAdd);
  let color2 = color * factor + offset;
  if (uniforms.colorOnly) {
    return vec4f(color2.rgb, color.a);
  }
  return color2;
}
