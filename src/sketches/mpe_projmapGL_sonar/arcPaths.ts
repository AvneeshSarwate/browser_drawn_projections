import type { Point } from './textRegionUtils'

/**
 * Derived geometric information computed on-the-fly for arc path calculations
 */
export type DerivedPolygonGeometry = {
  centroid: Point
}

/**
 * Arc path function signature
 * Returns the position along the arc at a given progress value
 */
export type ArcPathFn = (
  startPt: Point,
  endPt: Point,
  progress: number, // 0-1
  geometry: DerivedPolygonGeometry
) => Point

/**
 * Available arc types
 */
export type ArcType = 'linear' | 'catmulRom' | 'spiral'

/**
 * Computes derived geometry from polygon points
 */
export function computeGeometry(points: Point[]): DerivedPolygonGeometry {
  if (points.length === 0) {
    return { centroid: { x: 0, y: 0 } }
  }

  const centroid = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length
  }

  return { centroid }
}

/**
 * Linear interpolation path - straight line from start to end
 */
export function linearPath(
  startPt: Point,
  endPt: Point,
  progress: number,
  _geometry: DerivedPolygonGeometry
): Point {
  const t = Math.max(0, Math.min(1, progress))
  return {
    x: startPt.x + (endPt.x - startPt.x) * t,
    y: startPt.y + (endPt.y - startPt.y) * t
  }
}

/**
 * Catmull-Rom spline interpolation for a single segment
 * Given 4 control points P0, P1, P2, P3 and parameter t in [0,1],
 * interpolates between P1 and P2
 */
function catmullRomInterpolate(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const t2 = t * t
  const t3 = t2 * t

  // Catmull-Rom basis functions
  const b0 = -0.5 * t3 + t2 - 0.5 * t
  const b1 = 1.5 * t3 - 2.5 * t2 + 1
  const b2 = -1.5 * t3 + 2 * t2 + 0.5 * t
  const b3 = 0.5 * t3 - 0.5 * t2

  return {
    x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y
  }
}

/**
 * Catmull-Rom spline path - curves through the centroid
 * Path goes: start → centroid → end
 * Uses phantom points to create smooth entry/exit
 */
export function catmulRomPath(
  startPt: Point,
  endPt: Point,
  progress: number,
  geometry: DerivedPolygonGeometry
): Point {
  const t = Math.max(0, Math.min(1, progress))
  const { centroid } = geometry

  // Control points: start, centroid, end
  // We need 4 points for Catmull-Rom, so we use phantom points
  // Phantom before start: reflect start across centroid direction
  // Phantom after end: reflect end across centroid direction

  if (t <= 0.5) {
    // First half: interpolating from start toward centroid
    // Control points: phantom0, start, centroid, end
    const phantom0 = {
      x: 2 * startPt.x - centroid.x,
      y: 2 * startPt.y - centroid.y
    }
    // Remap t from [0, 0.5] to [0, 1]
    const localT = t * 2
    return catmullRomInterpolate(phantom0, startPt, centroid, endPt, localT)
  } else {
    // Second half: interpolating from centroid toward end
    // Control points: start, centroid, end, phantom3
    const phantom3 = {
      x: 2 * endPt.x - centroid.x,
      y: 2 * endPt.y - centroid.y
    }
    // Remap t from [0.5, 1] to [0, 1]
    const localT = (t - 0.5) * 2
    return catmullRomInterpolate(startPt, centroid, endPt, phantom3, localT)
  }
}

/**
 * Spiral path - Catmull-Rom base path with circular deviation
 * The spiral deviation is lerped in/out so the path starts and ends exactly at the target points
 */
export function spiralPath(
  startPt: Point,
  endPt: Point,
  progress: number,
  geometry: DerivedPolygonGeometry
): Point {
  const t = Math.max(0, Math.min(1, progress))

  // Get base position from catmull-rom curve
  const basePos = catmulRomPath(startPt, endPt, t, geometry)

  // Deviation amplitude - sin curve makes it lerp in/out smoothly
  // Peaks at progress = 0.5, zero at 0 and 1
  const deviationAmp = Math.sin(t * Math.PI * 2 * 5) * 15

  // Spiral rotation - 2 full rotations over the path
  const angle = t * Math.PI * 4

  return {
    x: basePos.x + Math.cos(angle) * deviationAmp,
    y: basePos.y + Math.sin(angle) * deviationAmp
  }
}

/**
 * Registry of arc path functions by type
 */
const arcPathRegistry: Record<ArcType, ArcPathFn> = {
  linear: linearPath,
  catmulRom: catmulRomPath,
  spiral: spiralPath
}

/**
 * Gets the arc path function for a given arc type
 */
export function getArcPathFn(arcType: ArcType): ArcPathFn {
  return arcPathRegistry[arcType] ?? linearPath
}
