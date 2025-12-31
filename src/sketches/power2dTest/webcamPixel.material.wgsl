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
  let pixelSize = max(uniforms.pixelSize, 1.0);
  let texSize = vec2f(textureDimensions(webcamTex));
  let step = vec2f(pixelSize, pixelSize) / texSize;
  let uvClamped = clamp(uv, vec2f(0.0, 0.0), vec2f(1.0, 1.0));
  let quantUV = (floor(uvClamped / step) + vec2f(0.5, 0.5)) * step;
  let pix = textureSample(webcamTex, webcamTexSampler, quantUV);
  let colorPassthru = textureSample(webcamTex, webcamTexSampler, uv);
  let color = select(colorPassthru, pix, uv.x > 0.5);
  return vec4f(color.rgb * uniforms.tint, color.a * uniforms.opacity);
}
