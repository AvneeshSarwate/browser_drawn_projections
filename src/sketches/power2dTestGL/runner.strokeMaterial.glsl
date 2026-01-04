struct RunnerStrokeUniforms {
  float time;
  float speed;
  float segmentLength;
  float feather;
};

vec2 strokeVertShader(
  vec2 centerPos,
  vec2 normal,
  float side,
  float arcLength,
  float normalizedArc,
  float miterFactor,
  float thickness,
  RunnerStrokeUniforms uniforms
) {
  return centerPos + normal * side * (thickness * 0.5) * miterFactor;
}

vec4 strokeFragShader(
  vec2 uv,
  float arcLength,
  float normalizedArc,
  RunnerStrokeUniforms uniforms
) {
  float head = fract(uniforms.time * uniforms.speed);
  float dist = abs(normalizedArc - head);
  float wrappedDist = min(dist, 1.0 - dist);
  float seg = max(uniforms.segmentLength, 0.001);
  float feather = max(uniforms.feather, 0.0001);
  float edge0 = max(seg - feather, 0.0);
  float falloff = smoothstep(edge0, seg, wrappedDist);
  float alpha = 1.0 - falloff;
  return vec4(1.0, 1.0, 1.0, 1.0) * alpha;
}
