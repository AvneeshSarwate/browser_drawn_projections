export type RGB = { r: number; g: number; b: number }

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function rgbToHsl01({ r, g, b }: RGB): [number, number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const chroma = max - min
  let h = 0
  if (chroma > 0) {
    if (max === R) h = ((G - B) / chroma + (G < B ? 6 : 0)) / 6
    else if (max === G) h = ((B - R) / chroma + 2) / 6
    else h = ((R - G) / chroma + 4) / 6
  }
  const l = (max + min) / 2
  let s = 0
  if (chroma > 0) {
    s = chroma / (1 - Math.abs(2 * l - 1))
  }
  return [h, s, l, chroma]
}

function hsl01ToRgb({ h, s, l }: { h: number; s: number; l: number }): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h * 6
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (0 <= hp && hp < 1) [r1, g1, b1] = [c, x, 0]
  else if (1 <= hp && hp < 2) [r1, g1, b1] = [x, c, 0]
  else if (2 <= hp && hp < 3) [r1, g1, b1] = [0, c, x]
  else if (3 <= hp && hp < 4) [r1, g1, b1] = [0, x, c]
  else if (4 <= hp && hp < 5) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  const m = l - c / 2
  const r = Math.round(clamp01(r1 + m) * 255)
  const g = Math.round(clamp01(g1 + m) * 255)
  const b = Math.round(clamp01(b1 + m) * 255)
  return { r, g, b }
}

/**
 * Adaptively saturate and darken washed-out colors while preserving vibrant ones.
 * Uses HSL color space to detect "washout" (low saturation + high lightness) and
 * applies proportional corrections.
 * 
 * @param rgb - Input RGB color (0-255 per channel)
 * @param opts - Tuning parameters
 * @returns Enhanced RGB color
 */
export function adjustExpressiveColor(
  rgb: RGB,
  opts: {
    satBoost?: number
    darkenMax?: number
    satFloorMax?: number
    sCap?: number
    graySthresh?: number
    grayChromaThresh?: number
  } = {}
): RGB {
  const {
    satBoost = 0.85,
    darkenMax = 0.22,
    satFloorMax = 0.70,
    sCap = 0.92,
    graySthresh = 0.03,
    grayChromaThresh = 0.02,
  } = opts

  const [h, s, l, chroma] = rgbToHsl01(rgb)

  // Preserve true grays - only darken, don't add color
  if (s < graySthresh && chroma < grayChromaThresh) {
    const wl = smoothstep(0.5, 1.0, l)
    const l2 = clamp01(l - darkenMax * wl)
    return hsl01ToRgb({ h, s: 0, l: l2 })
  }

  // Compute washout score from low saturation + high lightness
  const wS = 1 - s
  const wL = smoothstep(0.60, 1.00, l)
  const washout = clamp01(0.55 * wS + 0.45 * wL)

  // Lightness-dependent saturation floor (pale colors get higher floor)
  const satFloor = satFloorMax * smoothstep(0.60, 0.95, l)

  // Pull saturation toward floor proportional to washout
  const sTarget = Math.max(s, satFloor)
  let s2 = lerp(s, sTarget, satBoost * washout)
  s2 = Math.min(s2, sCap)

  // Darken proportional to washout and high lightness
  const darken = darkenMax * washout * wL
  const l2 = clamp01(l - darken)

  return hsl01ToRgb({ h, s: s2, l: l2 })
}
