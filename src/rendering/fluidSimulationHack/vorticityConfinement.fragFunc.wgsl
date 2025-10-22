struct VorticityConfinementUniforms {
  curlStrength: f32,
  timeStep: f32,
}

fn texelSize(textureRef: texture_2d<f32>) -> vec2f {
  let dims = textureDimensions(textureRef);
  let sx = select(1.0 / f32(dims.x), 0.0, dims.x == 0u);
  let sy = select(1.0 / f32(dims.y), 0.0, dims.y == 0u);
  return vec2f(sx, sy);
}

fn clampUv(uv: vec2f) -> vec2f {
  return clamp(uv, vec2f(0.0), vec2f(1.0));
}

fn pass0(
  uv: vec2f,
  uniforms: VorticityConfinementUniforms,
  velocity: texture_2d<f32>,
  velocitySampler: sampler,
  curl: texture_2d<f32>,
  curlSampler: sampler,
) -> vec4f {
  let texel = texelSize(velocity);
  let centerVelocity = textureSample(velocity, velocitySampler, clampUv(uv)).xy;
  let centerCurl = textureSample(curl, curlSampler, clampUv(uv)).x;

  let leftUv = uv - vec2f(texel.x, 0.0);
  var curlL = textureSample(curl, curlSampler, clampUv(leftUv)).x;

  let rightUv = uv + vec2f(texel.x, 0.0);
  var curlR = textureSample(curl, curlSampler, clampUv(rightUv)).x;

  let topUv = uv + vec2f(0.0, texel.y);
  var curlT = textureSample(curl, curlSampler, clampUv(topUv)).x;

  let bottomUv = uv - vec2f(0.0, texel.y);
  var curlB = textureSample(curl, curlSampler, clampUv(bottomUv)).x;

  var force = 0.5 * vec2f(abs(curlT) - abs(curlB), abs(curlR) - abs(curlL));
  force = force * (1.0 / max(length(force), 1e-4));
  force = force * (uniforms.curlStrength * centerCurl);
  force.y = -force.y;

  var updatedVelocity = centerVelocity + force * uniforms.timeStep;
  updatedVelocity = clamp(updatedVelocity, vec2f(-1000.0), vec2f(1000.0));

  return vec4f(updatedVelocity, 0.0, 1.0);
}
