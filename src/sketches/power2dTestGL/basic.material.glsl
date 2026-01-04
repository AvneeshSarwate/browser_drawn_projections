struct BasicUniforms {
  float time;
  vec3 color;
};

vec2 vertShader(vec2 position, vec2 uv, BasicUniforms uniforms) {
  float wobble = sin((uv.x + uv.y + uniforms.time) * 6.283) * 2.0;
  return position + vec2(wobble, wobble);
}

vec4 fragShader(vec2 uv, BasicUniforms uniforms) {
  float pulse = 0.5 + 0.5 * sin(uniforms.time * 2.0 + uv.x * 3.14159);
  return vec4(uniforms.color * pulse, 1.0);
}
