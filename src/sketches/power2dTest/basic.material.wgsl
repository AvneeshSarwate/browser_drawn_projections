struct BasicUniforms {
  time: f32,
  color: vec3f,
};

fn vertShader(position: vec2f, uv: vec2f, uniforms: BasicUniforms) -> vec2f {
  let wobble = sin((uv.x + uv.y + uniforms.time) * 6.283) * 2.0;
  return position + vec2f(wobble, wobble);
}

fn fragShader(uv: vec2f, uniforms: BasicUniforms) -> vec4f {
  let pulse = 0.5 + 0.5 * sin(uniforms.time * 2.0 + uv.x * 3.14159);
  return vec4f(uniforms.color * pulse, 1.0);
}
