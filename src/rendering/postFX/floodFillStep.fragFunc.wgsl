fn pass0(uv: vec2f, seed: texture_2d<f32>, seedSampler: sampler, feedback: texture_2d<f32>, feedbackSampler: sampler) -> vec4f {
  let seedColor = textureSample(seed, seedSampler, uv);
  let feedbackColor = textureSample(feedback, feedbackSampler, uv);

  let dims = vec2f(textureDimensions(feedback, 0));
  let invDims = 1.0 / dims;

  var recentColor = vec4f(-1.0);

  for (var x = -1; x <= 1; x = x + 1) {
    for (var y = -1; y <= 1; y = y + 1) {
      let offset = vec2f(f32(x), f32(y)) * invDims;
      let neighborUV = clamp(uv + offset, vec2f(0.0), vec2f(1.0));
      let candidate = textureSample(feedback, feedbackSampler, neighborUV);
      if (candidate.a > recentColor.a) {
        recentColor = candidate;
      }
    }
  }

  var chosenFeedback = recentColor;
  if (feedbackColor.a == recentColor.a) {
    chosenFeedback = feedbackColor;
  }

  if (seedColor.a > 0.0) {
    return seedColor;
  }

  return chosenFeedback;
}
