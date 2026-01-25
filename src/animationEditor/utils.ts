/**
 * Animation Editor Utility Functions
 */

/**
 * Binary search to find the first index where times[i] > t
 * Returns times.length if all values are <= t
 */
export function upperBound(times: number[], t: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (times[mid] > t) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

/**
 * Linear interpolation between a and b
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Clamp value x to [low, high]
 */
export function clamp(x: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, x))
}

/**
 * Generate a stable HSL color from a string
 * Uses a simple hash function to produce consistent colors
 */
export function hashStringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Use hash to generate HSL values
  // Hue: 0-360, Saturation: 50-80%, Lightness: 35-55%
  const hue = Math.abs(hash) % 360
  const saturation = 50 + (Math.abs(hash >> 8) % 30)
  const lightness = 35 + (Math.abs(hash >> 16) % 20)

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

/**
 * Map a time value to an x pixel position within a canvas
 */
export function timeToX(
  time: number,
  windowStart: number,
  windowEnd: number,
  canvasWidth: number
): number {
  const duration = windowEnd - windowStart
  if (duration <= 0) return 0
  return ((time - windowStart) / duration) * canvasWidth
}

/**
 * Map an x pixel position to a time value
 */
export function xToTime(
  x: number,
  windowStart: number,
  windowEnd: number,
  canvasWidth: number
): number {
  const duration = windowEnd - windowStart
  if (canvasWidth <= 0) return windowStart
  return windowStart + (x / canvasWidth) * duration
}

/**
 * Calculate nice tick intervals for a given range and pixel width
 * Returns an array of tick values
 */
export function calculateTickValues(
  windowStart: number,
  windowEnd: number,
  pixelWidth: number,
  minTickSpacing: number
): number[] {
  const duration = windowEnd - windowStart
  if (duration <= 0 || pixelWidth <= 0) return []

  // Calculate how many ticks can fit
  const maxTicks = Math.floor(pixelWidth / minTickSpacing)
  if (maxTicks < 1) return []

  // Find a nice interval (1, 2, 5, 10, 20, 50, etc.)
  const rawInterval = duration / maxTicks
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
  const normalized = rawInterval / magnitude

  let niceInterval: number
  if (normalized <= 1) {
    niceInterval = magnitude
  } else if (normalized <= 2) {
    niceInterval = 2 * magnitude
  } else if (normalized <= 5) {
    niceInterval = 5 * magnitude
  } else {
    niceInterval = 10 * magnitude
  }

  // Generate tick values
  const ticks: number[] = []
  const start = Math.ceil(windowStart / niceInterval) * niceInterval
  for (let t = start; t <= windowEnd; t += niceInterval) {
    ticks.push(t)
  }

  return ticks
}

/**
 * Format a time value for display
 */
export function formatTime(t: number): string {
  // Show up to 2 decimal places, but trim trailing zeros
  const fixed = t.toFixed(2)
  return parseFloat(fixed).toString()
}
