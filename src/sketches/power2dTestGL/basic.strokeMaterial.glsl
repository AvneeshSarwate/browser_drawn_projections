struct BasicStrokeUniforms {
  vec3 color;
};

vec2 strokeVertShader(
  vec2 centerPos,
  vec2 normal,
  float side,
  float arcLength,
  float normalizedArc,
  float miterFactor,
  float thickness,
  BasicStrokeUniforms uniforms
) {
  return centerPos + normal * side * (thickness * 0.5) * miterFactor;
}

vec4 strokeFragShader(
  vec2 uv,
  float arcLength,
  float normalizedArc,
  BasicStrokeUniforms uniforms
) {
  return vec4(uniforms.color, 1.0);
}
