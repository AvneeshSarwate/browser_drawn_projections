/**
 * Maps MIDI pitch to color using an explicit 12-color palette.
 * Pitch bend blends between adjacent pitch-class colors (circularly).
 */

export type RGB = { r: number; g: number; b: number }

// Hardcoded pitch-class colors (C..B). Edit these to taste.
// Values are 0-1 RGB. The ramp and pitch-bend blending are derived from this list.
const PITCH_CLASS_COLORS: RGB[] = [
  { r: 0.91, g: 0.20, b: 0.20 }, // C
  { r: 0.94, g: 0.43, b: 0.14 }, // C#
  { r: 0.95, g: 0.64, b: 0.18 }, // D
  { r: 0.80, g: 0.73, b: 0.20 }, // D#
  { r: 0.46, g: 0.74, b: 0.28 }, // E
  { r: 0.18, g: 0.70, b: 0.54 }, // F
  { r: 0.18, g: 0.62, b: 0.82 }, // F#
  { r: 0.20, g: 0.46, b: 0.86 }, // G
  { r: 0.28, g: 0.32, b: 0.78 }, // G#
  { r: 0.46, g: 0.26, b: 0.69 }, // A
  { r: 0.70, g: 0.24, b: 0.62 }, // A#
  { r: 0.85, g: 0.25, b: 0.45 }, // B
]

/**
 * Convert MIDI note number and pitch bend to an RGB color.
 *
 * @param noteNum - MIDI note number (0-127)
 * @param bend - Pitch bend value (-8192 to +8191, 0 = center)
 * @param bendRange - Pitch bend range in semitones (default: 48)
 * @returns RGB color with values 0-1
 */
export function pitchToColor(noteNum: number, bend: number, bendRange = 48): RGB {
  const pitchClass = mod(noteNum, 12)
  const bendNorm = normalizeBend(bend)
  // Convert bend to semitone offset
  const bendSemitones = bendNorm * bendRange

  const pitchFloat = pitchClass + bendSemitones
  const baseIndex = Math.floor(pitchFloat)
  const t = pitchFloat - baseIndex
  const colorA = PITCH_CLASS_COLORS[mod(baseIndex, 12)] ?? { r: 1, g: 1, b: 1 }
  const colorB = PITCH_CLASS_COLORS[mod(baseIndex + 1, 12)] ?? { r: 1, g: 1, b: 1 }

  return lerpRgb(colorA, colorB, t)
}

export function pitchToColor2(melodyRootBlend: number, melodyProgBlend: number): RGB {

  const g1 = gradient1;
  const g2 = gradient3;
  
  const colorA = sampleGradient(g1, melodyProgBlend)
  const colorB = sampleGradient(g2, melodyProgBlend)
  
  return lerpRgb(colorA, colorB, melodyRootBlend)
}

/**
 * Get a color for a released note (no pitch modulation).
 * Uses a neutral white-ish color.
 */
export function releaseColor(): RGB {
  return { r: 1, g: 1, b: 1 }
}

function mod(value: number, n: number): number {
  const m = value % n
  return m < 0 ? m + n : m
}

function normalizeBend(bend: number): number {
  if (!Number.isFinite(bend)) return 0
  // MIDIVal reports pitch bend as -1..1
  if (Math.abs(bend) <= 1.2) return bend
  // Common 14-bit MIDI range 0..16383
  if (bend >= 0 && bend <= 16383) {
    return (bend - 8192) / 8192
  }
  // Signed 14-bit range -8192..8191
  if (bend >= -8192 && bend <= 8191) {
    return bend / 8192
  }
  return Math.max(-1, Math.min(1, bend))
}

function lerpRgb(a: RGB, b: RGB, t: number): RGB {
  const tt = Math.max(0, Math.min(1, t))
  return {
    r: a.r + (b.r - a.r) * tt,
    g: a.g + (b.g - a.g) * tt,
    b: a.b + (b.b - a.b) * tt,
  }
}

function sampleGradient(gradient: GradientStop[], s: number): RGB {
  if (!Number.isFinite(s)) return { r: 0, g: 0, b: 0 }
  const epsilon = 1e-6
  const clamped = Math.max(0, Math.min(1 - epsilon, s))

  let stop1 = gradient[0]
  let stop2 = gradient[gradient.length - 1]
  for (let i = 0; i < gradient.length - 1; i += 1) {
    const current = gradient[i]
    const next = gradient[i + 1]
    if (clamped >= current.s && clamped < next.s) {
      stop1 = current
      stop2 = next
      break
    }
  }

  if (!stop1 || !stop2) return { r: 0, g: 0, b: 0 }
  const denom = stop2.s - stop1.s
  const t = denom <= 0 ? 0 : (clamped - stop1.s) / denom
  const rgb1 = {
    r: stop1.rgb[0],
    g: stop1.rgb[1],
    b: stop1.rgb[2],
  }
  const rgb2 = {
    r: stop2.rgb[0],
    g: stop2.rgb[1],
    b: stop2.rgb[2],
  }
  return lerpRgb(rgb1, rgb2, t)
}

type GradientStop = {
  s: number
  rgb: [number, number, number]
}

const gradient1: GradientStop[] = [
  {
    s: 0,
    rgb: [0.74, 0.8748, 0.3724],
  },
  {
    s: 0.5,
    rgb: [0.5513, 0.2665, 0.2722],
  },
  {
    s: 1,
    rgb: [0.2567, 0.1789, 0.6694],
  },
]

const gradient2: GradientStop[] = [
  {
    s: 0,
    rgb: [0.93, 0.48, 0.074],
  },
  {
    s: 0.3,
    rgb: [0.563, 0.2969, 0.2114],
  },
  {
    s: 0.6,
    rgb: [0.5846, 0.2553, 0.4176],
  },
  {
    s: 1,
    rgb: [0.2888, 0.1516, 0.9331],
  },
]

const gradient3: GradientStop[] = [
  {
    s: 0,
    rgb: [0.9645, 0.9348, 0.9339],
  },
  {
    s: 0.5,
    rgb: [0.6437, 0.1906, 0.4073],
  },
  {
    s: 1,
    rgb: [0.0568, 0.3515, 0.0807],
  },
]
