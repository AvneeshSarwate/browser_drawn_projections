struct PolygonMaskUniforms {
  points: array<vec4f, 64>, //todo - annoying that this has to always be vec4 for webgpu alignment - is it better to rewite in wrapper or just keep vec4?
  pointCount: i32,
};

fn pointInPolygon(pt: vec2f, uniforms: PolygonMaskUniforms) -> bool {
  let count = uniforms.pointCount;
  if (count < 3) {
    return true;
  }

  var inside = false;
  var j = count - 1;

  for (var i = 0; i < 64; i = i + 1) {
    if (i >= count) {
      break;
    }
    let pi = uniforms.points[u32(i)].xy;
    let pj = uniforms.points[u32(j)].xy;
    let intersects = (pi.y > pt.y) != (pj.y > pt.y);
    if (intersects) {
      let xCross = (pj.x - pi.x) * (pt.y - pi.y) / (pj.y - pi.y) + pi.x;
      if (pt.x < xCross) {
        inside = !inside;
      }
    }
    j = i;
  }

  return inside;
}

fn pass0(uv: vec2f, uniforms: PolygonMaskUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let color = textureSample(src, srcSampler, uv);
  if (!pointInPolygon(uv, uniforms)) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return color;
}




/* // struct pointer version with no compile errors, but more annoying to write
struct PolygonMaskUniforms {
  points: array<vec2f, 64>,
  pointCount: i32,
};

fn pointInPolygon(pt: vec2f, uniforms: ptr<function, PolygonMaskUniforms>) -> bool {
  let count = (*uniforms).pointCount;
  if (count < 3) {
    return true;
  }

  var inside = false;
  var j = count - 1;

  for (var i = 0; i < 64; i = i + 1) {
    if (i >= count) {
      break;
    }
    let pi = (*uniforms).points[u32(i)];
    let pj = (*uniforms).points[u32(j)];
    let intersects = (pi.y > pt.y) != (pj.y > pt.y);
    if (intersects) {
      let xCross = (pj.x - pi.x) * (pt.y - pi.y) / (pj.y - pi.y) + pi.x;
      if (pt.x < xCross) {
        inside = !inside;
      }
    }
    j = i;
  }

  return inside;
}

fn pass0(uv: vec2f, uniforms: ptr<function, PolygonMaskUniforms>, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let color = textureSample(src, srcSampler, uv);
  if (!pointInPolygon(uv, uniforms)) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  return color;
}


*/