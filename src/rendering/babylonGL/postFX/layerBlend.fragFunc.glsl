vec4 pass0(vec2 uv, sampler2D src1, sampler2D src2) {
  vec4 color1 = texture(src1, uv);
  vec4 color2 = texture(src2, uv);
  return color1.a > 0.01 ? color1 : color2;
}
