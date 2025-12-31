struct BasicStrokeUniforms {
  color: vec3f,
};

fn strokeVertShader(
  centerPos: vec2f,
  normal: vec2f,
  side: f32,
  arcLength: f32,
  normalizedArc: f32,
  miterFactor: f32,
  thickness: f32,
  uniforms: BasicStrokeUniforms,
) -> vec2f {
  return centerPos + normal * side * (thickness * 0.5) * miterFactor;
}

fn strokeFragShader(
  uv: vec2f,
  arcLength: f32,
  normalizedArc: f32,
  uniforms: BasicStrokeUniforms,
) -> vec4f {
  return vec4f(uniforms.color, 1.0);
}
