struct InstancedBasicUniforms {
  float time;
  vec3 color;
};

struct InstancedBasicInstance {
  vec2 offset;
  float scale;
  float rotation;
  vec3 tint;
  float instanceIndex;
};

vec2 vertShader(
  vec2 position,
  vec2 uv,
  InstancedBasicUniforms uniforms,
  InstancedBasicInstance inst
) {
  float c = cos(inst.rotation);
  float s = sin(inst.rotation);
  vec2 rotated = vec2(
    position.x * c - position.y * s,
    position.x * s + position.y * c
  );
  return inst.offset + rotated * inst.scale;
}

vec4 fragShader(
  vec2 uv,
  InstancedBasicUniforms uniforms,
  InstancedBasicInstance inst
) {
  float pulse = 0.5 + 0.5 * sin(uniforms.time * 2.0 + uv.x * 3.14159 + inst.instanceIndex * 0.001);
  vec3 color = uniforms.color * inst.tint * pulse;
  return vec4(color, 1.0);
}
