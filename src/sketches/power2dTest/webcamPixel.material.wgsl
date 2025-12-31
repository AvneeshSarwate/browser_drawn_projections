struct WebcamPixelUniforms {
  pixelSize: f32,
  tint: vec3f,
  opacity: f32,
};

fn vertShader(position: vec2f, uv: vec2f, uniforms: WebcamPixelUniforms) -> vec2f {
  return position;
}

fn fragShader(
  uv: vec2f,
  uniforms: WebcamPixelUniforms,
  webcamTex: texture_2d<f32>,
  webcamTexSampler: sampler,
) -> vec4f {
  let size = max(uniforms.pixelSize, 1.0);
  let quantUV = (floor(uv * size) + vec2f(0.5, 0.5)) / size;
  let color = textureSample(webcamTex, webcamTexSampler, quantUV);
  return vec4f(color.rgb * uniforms.tint, color.a * uniforms.opacity);
}
