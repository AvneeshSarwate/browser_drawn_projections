struct LimitUniforms {
  minFunction: u32,
  maxFunction: u32,
  minValue: f32,
  maxValue: f32,
  positiveOnly: u32,
  normalize: u32,
  normalizeMin: f32,
  normalizeMax: f32,
  quantizeValueMode: u32,
  valueStep: f32,
  valueOffset: f32,
  quantizePositionMode: u32,
  positionStep: vec2f,
  positionOffset: vec2f,
};

fn pass0(uv: vec2f, uniforms: LimitUniforms, src: texture_2d<f32>, srcSampler: sampler) -> vec4f {
  var sampleUv = uv;
  if (uniforms.quantizePositionMode != 0u) {
    let step = uniforms.positionStep;
    let offset = uniforms.positionOffset;
    let safeStepX = max(step.x, 1e-6);
    let safeStepY = max(step.y, 1e-6);
    var xValue = uv.x;
    var yValue = uv.y;
    if (!(step.x <= 1e-6 && step.y <= 1e-6)) {
      let mode = uniforms.quantizePositionMode;
      if (step.x > 1e-6) {
        let shiftedX = (uv.x - offset.x) / safeStepX;
        if (mode == 1u) {
          xValue = ceil(shiftedX) * safeStepX + offset.x;
        } else if (mode == 2u) {
          xValue = floor(shiftedX) * safeStepX + offset.x;
        } else {
          xValue = round(shiftedX) * safeStepX + offset.x;
        }
      }
      if (step.y > 1e-6) {
        let shiftedY = (uv.y - offset.y) / safeStepY;
        if (mode == 1u) {
          yValue = ceil(shiftedY) * safeStepY + offset.y;
        } else if (mode == 2u) {
          yValue = floor(shiftedY) * safeStepY + offset.y;
        } else {
          yValue = round(shiftedY) * safeStepY + offset.y;
        }
      }
      sampleUv = clamp(vec2f(xValue, yValue), vec2f(0.0), vec2f(1.0));
    }
  }

  var color = textureSample(src, srcSampler, sampleUv);
  let range = max(uniforms.maxValue - uniforms.minValue, 1e-6);
  let doubleRange = range * 2.0;

  // Apply min/max to each channel
  var r = color.r;
  if (uniforms.minFunction != 0u && r < uniforms.minValue) {
    if (uniforms.minFunction == 1u) {
      r = uniforms.minValue;
    } else if (uniforms.minFunction == 2u) {
      let offset = r - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      r = uniforms.minValue + wrapped;
    } else if (uniforms.minFunction == 3u) {
      let offset = r - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        r = uniforms.minValue + wrapped;
      } else {
        r = uniforms.maxValue - (wrapped - range);
      }
    }
  }
  if (uniforms.maxFunction != 0u && r > uniforms.maxValue) {
    if (uniforms.maxFunction == 1u) {
      r = uniforms.maxValue;
    } else if (uniforms.maxFunction == 2u) {
      let offset = r - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      r = uniforms.minValue + wrapped;
    } else if (uniforms.maxFunction == 3u) {
      let offset = r - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        r = uniforms.minValue + wrapped;
      } else {
        r = uniforms.maxValue - (wrapped - range);
      }
    }
  }

  var g = color.g;
  if (uniforms.minFunction != 0u && g < uniforms.minValue) {
    if (uniforms.minFunction == 1u) {
      g = uniforms.minValue;
    } else if (uniforms.minFunction == 2u) {
      let offset = g - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      g = uniforms.minValue + wrapped;
    } else if (uniforms.minFunction == 3u) {
      let offset = g - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        g = uniforms.minValue + wrapped;
      } else {
        g = uniforms.maxValue - (wrapped - range);
      }
    }
  }
  if (uniforms.maxFunction != 0u && g > uniforms.maxValue) {
    if (uniforms.maxFunction == 1u) {
      g = uniforms.maxValue;
    } else if (uniforms.maxFunction == 2u) {
      let offset = g - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      g = uniforms.minValue + wrapped;
    } else if (uniforms.maxFunction == 3u) {
      let offset = g - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        g = uniforms.minValue + wrapped;
      } else {
        g = uniforms.maxValue - (wrapped - range);
      }
    }
  }

  var b = color.b;
  if (uniforms.minFunction != 0u && b < uniforms.minValue) {
    if (uniforms.minFunction == 1u) {
      b = uniforms.minValue;
    } else if (uniforms.minFunction == 2u) {
      let offset = b - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      b = uniforms.minValue + wrapped;
    } else if (uniforms.minFunction == 3u) {
      let offset = b - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        b = uniforms.minValue + wrapped;
      } else {
        b = uniforms.maxValue - (wrapped - range);
      }
    }
  }
  if (uniforms.maxFunction != 0u && b > uniforms.maxValue) {
    if (uniforms.maxFunction == 1u) {
      b = uniforms.maxValue;
    } else if (uniforms.maxFunction == 2u) {
      let offset = b - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      b = uniforms.minValue + wrapped;
    } else if (uniforms.maxFunction == 3u) {
      let offset = b - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        b = uniforms.minValue + wrapped;
      } else {
        b = uniforms.maxValue - (wrapped - range);
      }
    }
  }

  var a = color.a;
  if (uniforms.minFunction != 0u && a < uniforms.minValue) {
    if (uniforms.minFunction == 1u) {
      a = uniforms.minValue;
    } else if (uniforms.minFunction == 2u) {
      let offset = a - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      a = uniforms.minValue + wrapped;
    } else if (uniforms.minFunction == 3u) {
      let offset = a - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        a = uniforms.minValue + wrapped;
      } else {
        a = uniforms.maxValue - (wrapped - range);
      }
    }
  }
  if (uniforms.maxFunction != 0u && a > uniforms.maxValue) {
    if (uniforms.maxFunction == 1u) {
      a = uniforms.maxValue;
    } else if (uniforms.maxFunction == 2u) {
      let offset = a - uniforms.minValue;
      let wrapped = offset - range * floor(offset / range);
      a = uniforms.minValue + wrapped;
    } else if (uniforms.maxFunction == 3u) {
      let offset = a - uniforms.minValue;
      let wrapped = offset - doubleRange * floor(offset / doubleRange);
      if (wrapped <= range) {
        a = uniforms.minValue + wrapped;
      } else {
        a = uniforms.maxValue - (wrapped - range);
      }
    }
  }

  var limited = vec4f(r, g, b, a);

  if (uniforms.quantizeValueMode != 0u && uniforms.valueStep > 1e-6) {
    let mode = uniforms.quantizeValueMode;
    let step = uniforms.valueStep;
    let offset = uniforms.valueOffset;
    var qr = limited.r;
    var qg = limited.g;
    var qb = limited.b;
    var qa = limited.a;
    let shiftedR = (limited.r - offset) / step;
    let shiftedG = (limited.g - offset) / step;
    let shiftedB = (limited.b - offset) / step;
    let shiftedA = (limited.a - offset) / step;
    if (mode == 1u) {
      qr = ceil(shiftedR);
      qg = ceil(shiftedG);
      qb = ceil(shiftedB);
      qa = ceil(shiftedA);
    } else if (mode == 2u) {
      qr = floor(shiftedR);
      qg = floor(shiftedG);
      qb = floor(shiftedB);
      qa = floor(shiftedA);
    } else {
      qr = round(shiftedR);
      qg = round(shiftedG);
      qb = round(shiftedB);
      qa = round(shiftedA);
    }
    limited = vec4f(qr * step + offset, qg * step + offset, qb * step + offset, qa * step + offset);
  }

  if (uniforms.positiveOnly != 0u) {
    limited = abs(limited);
  }

  if (uniforms.normalize != 0u) {
    let normalized = (limited - vec4f(uniforms.minValue, uniforms.minValue, uniforms.minValue, uniforms.minValue)) / range;
    let targetRange = uniforms.normalizeMax - uniforms.normalizeMin;
    let scaled = normalized * targetRange + uniforms.normalizeMin;
    let minClamp = vec4f(uniforms.normalizeMin, uniforms.normalizeMin, uniforms.normalizeMin, uniforms.normalizeMin);
    let maxClamp = vec4f(uniforms.normalizeMax, uniforms.normalizeMax, uniforms.normalizeMax, uniforms.normalizeMax);
    limited = clamp(scaled, minClamp, maxClamp);
  }

  return limited;
}
