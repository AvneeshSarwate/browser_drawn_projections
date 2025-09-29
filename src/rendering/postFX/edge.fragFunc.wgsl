struct EdgeUniforms {
  channelMode: u32, // 0
  blackLevel: f32, // 0.0
  strength: f32, // 1.0
  sampleStep: vec2f, // [1.0, 1.0]
  sampleStepUnit: u32, // 1
  edgeColor: vec4f, // [1.0, 1.0, 1.0, 1.0]
  alphaMode: u32, // 0
  composite: u32, // 1
};

fn pass0(uv: vec2f, uniforms: EdgeUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  let dims = textureDimensions(src);
  let texelSize = vec2f(
    select(1.0 / f32(dims.x), 0.0, dims.x == 0u),
    select(1.0 / f32(dims.y), 0.0, dims.y == 0u),
  );

  var step = uniforms.sampleStep;
  if (uniforms.sampleStepUnit != 0u) {
    step = uniforms.sampleStep * texelSize;
  }
  let eps = 1e-6;
  if (abs(step.x) < eps) {
    step.x = texelSize.x;
  }
  if (abs(step.y) < eps) {
    step.y = texelSize.y;
  }

  let baseColor = textureSample(src, srcSampler, uv);
  var baseValue = 0.0;
  switch uniforms.channelMode {
    case 0u: {
      baseValue = dot(baseColor.rgb, vec3f(0.2126, 0.7152, 0.0722));
    }
    case 1u: {
      baseValue = baseColor.r;
    }
    case 2u: {
      baseValue = baseColor.g;
    }
    case 3u: {
      baseValue = baseColor.b;
    }
    case 4u: {
      baseValue = baseColor.a;
    }
    case 5u: {
      baseValue = (baseColor.r + baseColor.g + baseColor.b) / 3.0;
    }
    case 6u: {
      baseValue = (baseColor.r + baseColor.g + baseColor.b + baseColor.a) * 0.25;
    }
    default: {
      baseValue = dot(baseColor.rgb, vec3f(0.2126, 0.7152, 0.0722));
    }
  }
  baseValue = max(baseValue - uniforms.blackLevel, 0.0);

  var maxDiff = 0.0;

  for (var i = 0u; i < 8u; i = i + 1u) {
    var offset = vec2f(step.x, 0.0);
    switch i {
      case 0u: {
        offset = vec2f(step.x, 0.0);
      }
      case 1u: {
        offset = vec2f(-step.x, 0.0);
      }
      case 2u: {
        offset = vec2f(0.0, step.y);
      }
      case 3u: {
        offset = vec2f(0.0, -step.y);
      }
      case 4u: {
        offset = vec2f(step.x, step.y);
      }
      case 5u: {
        offset = vec2f(-step.x, step.y);
      }
      case 6u: {
        offset = vec2f(step.x, -step.y);
      }
      default: {
        offset = vec2f(-step.x, -step.y);
      }
    }
    let sampleUV = uv + offset;
    let neighborColor = textureSample(src, srcSampler, sampleUV);
    var neighborValue = 0.0;
    switch uniforms.channelMode {
      case 0u: {
        neighborValue = dot(neighborColor.rgb, vec3f(0.2126, 0.7152, 0.0722));
      }
      case 1u: {
        neighborValue = neighborColor.r;
      }
      case 2u: {
        neighborValue = neighborColor.g;
      }
      case 3u: {
        neighborValue = neighborColor.b;
      }
      case 4u: {
        neighborValue = neighborColor.a;
      }
      case 5u: {
        neighborValue = (neighborColor.r + neighborColor.g + neighborColor.b) / 3.0;
      }
      case 6u: {
        neighborValue = (neighborColor.r + neighborColor.g + neighborColor.b + neighborColor.a) * 0.25;
      }
      default: {
        neighborValue = dot(neighborColor.rgb, vec3f(0.2126, 0.7152, 0.0722));
      }
    }
    neighborValue = max(neighborValue - uniforms.blackLevel, 0.0);
    maxDiff = max(maxDiff, abs(baseValue - neighborValue));
  }

  let intensity = clamp(maxDiff * uniforms.strength, 0.0, 1.0);
  let edgeRgb = uniforms.edgeColor.rgb * intensity;

  var edgeAlpha = uniforms.edgeColor.a * intensity;
  switch uniforms.alphaMode {
    case 1u: {
      edgeAlpha = 1.0;
    }
    case 2u: {
      edgeAlpha = 0.0;
    }
    default: {
      edgeAlpha = uniforms.edgeColor.a * intensity;
    }
  }

  if (uniforms.composite != 0u) {
    let composedRgb = clamp(baseColor.rgb + edgeRgb * edgeAlpha, vec3f(0.0), vec3f(1.0));
    var composedAlpha = baseColor.a;
    switch uniforms.alphaMode {
      case 0u: {
        composedAlpha = clamp(max(baseColor.a, edgeAlpha), 0.0, 1.0);
      }
      case 1u: {
        composedAlpha = 1.0;
      }
      case 2u: {
        composedAlpha = 0.0;
      }
      default: {
        composedAlpha = clamp(max(baseColor.a, edgeAlpha), 0.0, 1.0);
      }
    }
    return vec4f(composedRgb, composedAlpha);
  }

  return vec4f(edgeRgb, edgeAlpha);
}
