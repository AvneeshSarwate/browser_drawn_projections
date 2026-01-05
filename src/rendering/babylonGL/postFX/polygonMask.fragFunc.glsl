struct PolygonMaskUniforms {
  vec2 points[64];
  int pointCount;
};

bool pointInPolygon(vec2 pt, PolygonMaskUniforms uniforms) {
  int count = uniforms.pointCount;
  if (count < 3) {
    return true;
  }

  bool inside = false;
  int j = count - 1;

  for (int i = 0; i < 64; i++) {
    if (i >= count) {
      break;
    }
    vec2 pi = uniforms.points[i];
    vec2 pj = uniforms.points[j];
    bool intersects = (pi.y > pt.y) != (pj.y > pt.y);
    if (intersects) {
      float xCross = (pj.x - pi.x) * (pt.y - pi.y) / (pj.y - pi.y) + pi.x;
      if (pt.x < xCross) {
        inside = !inside;
      }
    }
    j = i;
  }

  return inside;
}

vec4 pass0(vec2 uv, PolygonMaskUniforms uniforms, sampler2D src) {
  vec4 color = texture(src, uv);
  if (!pointInPolygon(uv, uniforms)) {
    return vec4(0.0, 0.0, 0.0, 0.0);
  }
  return color;
}
