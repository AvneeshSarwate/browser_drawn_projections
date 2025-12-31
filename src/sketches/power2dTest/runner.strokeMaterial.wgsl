struct RunnerStrokeUniforms {
  time: f32,
  speed: f32,
  segmentLength: f32,
  feather: f32,
};

fn strokeVertShader(
  centerPos: vec2f,
  normal: vec2f,
  side: f32,
  arcLength: f32,
  normalizedArc: f32,
  miterFactor: f32,
  thickness: f32,
  uniforms: RunnerStrokeUniforms,
) -> vec2f {
  return centerPos + normal * side * (thickness * 0.5) * miterFactor;
}

fn strokeFragShader(
  uv: vec2f,
  arcLength: f32,
  normalizedArc: f32,
  uniforms: RunnerStrokeUniforms,
) -> vec4f {
  let head = fract(uniforms.time * uniforms.speed);
  let dist = abs(normalizedArc - head);
  let wrappedDist = min(dist, 1.0 - dist);
  let seg = max(uniforms.segmentLength, 0.001);
  let feather = max(uniforms.feather, 0.0001);
  let edge0 = max(seg - feather, 0.0);
  let falloff = smoothstep(edge0, seg, wrappedDist);
  let alpha = 1.0 - falloff;
  // Premultiplied alpha avoids MSAA fringe because RGB goes to 0 as coverage fades.
  return vec4f(1.0, 1.0, 1.0, 1.0) * alpha;
}
