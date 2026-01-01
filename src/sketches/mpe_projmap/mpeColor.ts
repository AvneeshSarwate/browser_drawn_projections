/**
 * Maps MIDI pitch to a color using a circular hue ramp.
 * Pitch classes (0-11) map to equally spaced hues around the color wheel.
 * Pitch bend shifts all colors along the hue circle.
 */

// Hue values for each pitch class (0-11) in degrees (0-360)
// Starting from C = red (0), progressing through the spectrum
const PITCH_CLASS_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

export type RGB = { r: number; g: number; b: number }

/**
 * Convert MIDI note number and pitch bend to an RGB color.
 *
 * @param noteNum - MIDI note number (0-127)
 * @param bend - Pitch bend value (-8192 to +8191, 0 = center)
 * @param bendRange - Pitch bend range in semitones (default: 48)
 * @returns RGB color with values 0-1
 */
export function pitchToColor(noteNum: number, bend: number, bendRange = 48): RGB {
  const pitchClass = noteNum % 12
  // Convert bend to semitones offset
  const bendSemitones = (bend / 8192) * bendRange
  // 30 degrees per semitone (360 / 12)
  const hueOffset = bendSemitones * (30 / 12)
  const hue = ((PITCH_CLASS_HUES[pitchClass] ?? 0) + hueOffset + 360) % 360

  return hslToRgb(hue, 0.8, 0.6)
}

/**
 * Get a color for a released note (no pitch modulation).
 * Uses a neutral white-ish color.
 */
export function releaseColor(): RGB {
  return { r: 1, g: 1, b: 1 }
}

/**
 * Convert HSL color to RGB.
 *
 * @param h - Hue in degrees (0-360)
 * @param s - Saturation (0-1)
 * @param l - Lightness (0-1)
 * @returns RGB color with values 0-1
 */
function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0

  if (h < 60) {
    r = c; g = x
  } else if (h < 120) {
    r = x; g = c
  } else if (h < 180) {
    g = c; b = x
  } else if (h < 240) {
    g = x; b = c
  } else if (h < 300) {
    r = x; b = c
  } else {
    r = c; b = x
  }

  return {
    r: r + m,
    g: g + m,
    b: b + m
  }
}
