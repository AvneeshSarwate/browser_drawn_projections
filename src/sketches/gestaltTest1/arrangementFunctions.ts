import type { Vec2 } from './pathFunctions'
import { catmullRomSpline } from '@/rendering/catmullRom'

const TAU = Math.PI * 2
const EPS = 1e-6

const clampCount = (count: number) => Math.max(0, Math.floor(count))

const addVec = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
const scaleVec = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s })

const defaultCenter = (): Vec2 => ({ x: 0, y: 0 })

const computeSegmentLengths = (points: Vec2[], closed: boolean): number[] => {
  const lengths: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    lengths.push(Math.hypot(dx, dy))
  }
  if (closed && points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]
    const dx = first.x - last.x
    const dy = first.y - last.y
    lengths.push(Math.hypot(dx, dy))
  }
  return lengths
}

const cumulativeSums = (values: number[]): number[] => {
  const sums: number[] = []
  values.reduce((acc, val, idx) => {
    const next = acc + val
    sums[idx] = next
    return next
  }, 0)
  return sums
}

const interpolateSegment = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const sampleEvenlySpacedPointsOnPath = (points: Vec2[], count: number, closed: boolean): Vec2[] => {
  const usableCount = clampCount(count)
  if (usableCount === 0 || points.length === 0) return []
  if (points.length === 1) return Array.from({ length: usableCount }, () => ({ ...points[0] }))
  const pathPoints = closed ? [...points, points[0]] : [...points]
  const segmentLengths = computeSegmentLengths(pathPoints, false)
  const cumulative = cumulativeSums(segmentLengths)
  const totalLength = cumulative[cumulative.length - 1] ?? 0
  if (totalLength < EPS) {
    return Array.from({ length: usableCount }, () => ({ ...pathPoints[0] }))
  }

  const result: Vec2[] = []
  for (let i = 0; i < usableCount; i++) {
    const targetDist = (totalLength * i) / usableCount
    const segIndex = cumulative.findIndex(sum => sum >= targetDist)
    const safeIndex = segIndex === -1 ? segmentLengths.length - 1 : segIndex
    const prevCum = safeIndex === 0 ? 0 : cumulative[safeIndex - 1]
    const segT = segmentLengths[safeIndex] < EPS ? 0 : (targetDist - prevCum) / segmentLengths[safeIndex]
    const start = pathPoints[safeIndex]
    const end = pathPoints[safeIndex + 1]
    result.push(interpolateSegment(start, end, segT))
  }

  return result
}

export const circleArrangement = (
  count: number,
  radius: number,
  center: Vec2 = defaultCenter(),
  options?: { phase?: number }
): Vec2[] => {
  const usableCount = clampCount(count)
  if (usableCount === 0) return []
  const phase = options?.phase ?? 0
  const result: Vec2[] = []
  for (let i = 0; i < usableCount; i++) {
    const angle = phase + (TAU * i) / usableCount
    result.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  return result
}

const regularPolygonVertices = (sides: number, radius: number, center: Vec2, phase = 0): Vec2[] => {
  const usableSides = Math.max(3, Math.floor(sides))
  const verts: Vec2[] = []
  for (let i = 0; i < usableSides; i++) {
    const angle = phase + (TAU * i) / usableSides
    verts.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  return verts
}

export const polygonArrangement = (
  count: number,
  sides: number,
  radius: number,
  center: Vec2 = defaultCenter(),
  options?: { phase?: number }
): Vec2[] => {
  const vertices = regularPolygonVertices(sides, radius, center, options?.phase ?? 0)
  return sampleEvenlySpacedPointsOnPath(vertices, count, true)
}

export const splineArrangement = (
  count: number,
  controlPoints: Vec2[],
  options?: { closed?: boolean }
): Vec2[] => {
  if (controlPoints.length === 0) return []
  return sampleEvenlySpacedPointsOnPath(controlPoints, count, options?.closed ?? false)
}

export const translatedArrangement = (points: Vec2[], offset: Vec2): Vec2[] =>
  points.map(point => addVec(point, offset))

export const scaledArrangement = (points: Vec2[], scale: number): Vec2[] =>
  points.map(point => scaleVec(point, scale))

const sampleCatmullSpline = (controlPoints: Vec2[], count: number, closed: boolean): Vec2[] => {
  const usableCount = clampCount(count)
  if (usableCount === 0 || controlPoints.length === 0) return []
  if (controlPoints.length === 1) return Array.from({ length: usableCount }, () => ({ ...controlPoints[0] }))

  const denominator = closed ? usableCount : Math.max(1, usableCount - 1)
  return Array.from({ length: usableCount }, (_, i) => {
    const t = denominator === 0 ? 0 : i / denominator
    const safeT = closed && usableCount > 1 ? Math.min(t, (usableCount - 1) / usableCount) : t
    const point = catmullRomSpline(controlPoints, safeT, { closed })
    return { x: point.x, y: point.y }
  })
}

export const smoothSplineArrangement = (
  count: number,
  controlPoints: Vec2[],
  options?: { closed?: boolean }
): Vec2[] => sampleCatmullSpline(controlPoints, count, options?.closed ?? false)
