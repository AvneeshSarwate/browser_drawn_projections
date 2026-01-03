struct InstancedBasicUniforms {
  time: f32,
  color: vec3f,
};

struct InstancedBasicInstance {
  offset: vec2f,
  scale: f32,
  rotation: f32,
  tint: vec3f,
  instanceIndex: f32,
};

fn vertShader(
  position: vec2f,
  uv: vec2f,
  uniforms: InstancedBasicUniforms,
  inst: InstancedBasicInstance,
) -> vec2f {
  let c = cos(inst.rotation);
  let s = sin(inst.rotation);
  let rotated = vec2f(
    position.x * c - position.y * s,
    position.x * s + position.y * c
  );
  return inst.offset + rotated * inst.scale;
}

fn fragShader(
  uv: vec2f,
  uniforms: InstancedBasicUniforms,
  inst: InstancedBasicInstance,
) -> vec4f {
  let pulse = 0.5 + 0.5 * sin(uniforms.time * 2.0 + uv.x * 3.14159 + inst.instanceIndex * 0.001);
  let color = uniforms.color * inst.tint * pulse;
  return vec4f(color, 1.0);
}
