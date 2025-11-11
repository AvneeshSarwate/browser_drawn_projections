import { catmullRomSpline } from '@/rendering/catmullRom'

export type Vec2 = { x: number, y: number }

export type PathDefaultsContext = {
  start: Vec2
  end: Vec2
  center?: Vec2 | null
}

export type PathSampleArgs = PathDefaultsContext & {
  t: number
  params: PathFunctionParams
}

export type PathFunctionParams = Record<string, any>

export type ParametricPathDefinition = {
  id: string
  label: string
  description: string
  createParams: (ctx: PathDefaultsContext) => PathFunctionParams
  sample: (args: PathSampleArgs) => Vec2
}

const clamp01 = (val: number) => Math.max(0, Math.min(1, val))

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
})

const distance = (a: Vec2, b: Vec2) => Math.hypot(b.x - a.x, b.y - a.y)

const createBasis = (start: Vec2, end: Vec2) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const dist = Math.hypot(dx, dy)
  if (dist === 0) {
    return {
      distance: 0,
      direction: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
    }
  }
  const direction = { x: dx / dist, y: dy / dist }
  const normal = { x: -direction.y, y: direction.x }
  return { distance: dist, direction, normal }
}

const normalizeAngle = (angle: number) => {
  let a = angle
  const tau = Math.PI * 2
  while (a <= -Math.PI) a += tau
  while (a > Math.PI) a -= tau
  return a
}

const sampleCatmullPath = (points: Vec2[], t: number): Vec2 => {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }
  if (points.length === 1) {
    return points[0]
  }
  return catmullRomSpline(points, clamp01(t))
}

const straightLinePath: ParametricPathDefinition = {
  id: 'straight-line',
  label: 'Straight Line',
  description: 'Simple linear interpolation between the start and end point.',
  createParams: () => ({}),
  sample: ({ start, end, t }) => lerpVec(start, end, clamp01(t)),
}

type SinusoidalParams = {
  amplitude: number
  frequency: number
  phase: number
}

const sinusoidalWavePath: ParametricPathDefinition = {
  id: 'sinusoidal-wave',
  label: 'Sinusoidal Wave',
  description: 'Travels along the straight line while oscillating with a sine wave offset.',
  createParams: ({ start, end }) => {
    const { distance } = createBasis(start, end)
    const fallback = distance || 100
    return {
      amplitude: fallback * 0.2,
      frequency: 2,
      phase: 0,
    } satisfies SinusoidalParams
  },
  sample: ({ start, end, t, params }) => {
    const safeT = clamp01(t)
    const basis = createBasis(start, end)
    const basePoint = lerpVec(start, end, safeT)
    const amplitude = Number.isFinite(params.amplitude) ? params.amplitude : (basis.distance || 100) * 0.2
    const frequency = Number.isFinite(params.frequency) ? params.frequency : 2
    const phase = Number.isFinite(params.phase) ? params.phase : 0
    const offset = Math.sin((safeT + phase) * Math.PI * 2 * frequency) * amplitude
    return {
      x: basePoint.x + basis.normal.x * offset,
      y: basePoint.y + basis.normal.y * offset,
    }
  },
}

type SemiCircleParams = { orientation: 1 | -1 }

const semiCirclePath: ParametricPathDefinition = {
  id: 'semi-circle',
  label: 'Semi Circle',
  description: 'Draws the diameter between the points and follows the semicircle above or below it.',
  createParams: () => ({ orientation: 1 } satisfies SemiCircleParams),
  sample: ({ start, end, t, params }) => {
    const safeT = clamp01(t)
    const basis = createBasis(start, end)
    if (basis.distance === 0) {
      return start
    }
    const radius = basis.distance / 2
    const center = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    }
    const theta = Math.PI * (1 - safeT)
    const xLocal = radius * Math.cos(theta)
    const yLocal = radius * Math.sin(theta) * (params.orientation ?? 1)
    return {
      x: center.x + basis.direction.x * xLocal + basis.normal.x * yLocal,
      y: center.y + basis.direction.y * xLocal + basis.normal.y * yLocal,
    }
  },
}

type ArcParams = { center: Vec2 | null }

const isValidArcCenter = (center: Vec2, start: Vec2, end: Vec2) => {
  const radiusStart = distance(center, start)
  const radiusEnd = distance(center, end)
  if (!Number.isFinite(radiusStart) || !Number.isFinite(radiusEnd)) return false
  if (radiusStart < 1e-3 || radiusEnd < 1e-3) return false
  return Math.abs(radiusStart - radiusEnd) < 1e-3
}

const chooseArcDelta = (center: Vec2, start: Vec2, end: Vec2, radius: number) => {
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x)
  const shortDelta = normalizeAngle(endAngle - startAngle)
  const longDelta = shortDelta >= 0 ? shortDelta - Math.PI * 2 : shortDelta + Math.PI * 2

  const chordMid = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  }
  const desiredDir = {
    x: center.x - chordMid.x,
    y: center.y - chordMid.y,
  }
  const desiredLen = Math.hypot(desiredDir.x, desiredDir.y)
  if (desiredLen < 1e-6) {
    return { startAngle, delta: shortDelta }
  }

  const evalDelta = (delta: number) => {
    const midAngle = startAngle + delta / 2
    const pt = {
      x: center.x + Math.cos(midAngle) * radius,
      y: center.y + Math.sin(midAngle) * radius,
    }
    const arcDir = {
      x: pt.x - chordMid.x,
      y: pt.y - chordMid.y,
    }
    return desiredDir.x * arcDir.x + desiredDir.y * arcDir.y
  }

  const shortScore = evalDelta(shortDelta)
  const longScore = evalDelta(longDelta)

  const shortOpposite = shortScore <= 0
  const longOpposite = longScore <= 0

  let delta: number
  if (shortOpposite && longOpposite) {
    delta = Math.abs(shortDelta) > Math.abs(longDelta) ? shortDelta : longDelta
  } else if (shortOpposite) {
    delta = shortDelta
  } else if (longOpposite) {
    delta = longDelta
  } else {
    delta = Math.abs(shortDelta) > Math.abs(longDelta) ? shortDelta : longDelta
  }

  return { startAngle, delta }
}

const sampleArcPosition = (center: Vec2, start: Vec2, end: Vec2, t: number): Vec2 => {
  const radius = distance(center, start)
  const { startAngle, delta } = chooseArcDelta(center, start, end, radius)
  const angle = startAngle + delta * t
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  }
}

const circularArcPath: ParametricPathDefinition = {
  id: 'circular-arc',
  label: 'Circle Arc (centered)',
  description: 'Follows the circle defined by the provided center point. Falls back to a semicircle if the center is invalid.',
  createParams: ({ center }) => ({
    center: center ? { ...center } : null,
  } satisfies ArcParams),
  sample: ({ start, end, t, params }) => {
    const safeT = clamp01(t)
    const center = params.center
    if (center && isValidArcCenter(center, start, end)) {
      return sampleArcPosition(center, start, end, safeT)
    }
    return semiCirclePath.sample({
      start,
      end,
      t: safeT,
      params: { orientation: 1 } satisfies SemiCircleParams,
    })
  },
}

type DetourParams = { controlPoints: Vec2[] }

const randomDetourPath: ParametricPathDefinition = {
  id: 'random-detour',
  label: 'Random Detour',
  description: 'Adds 2–3 procedural detours that can overshoot or double back before arriving at the end.',
  createParams: ({ start, end }) => {
    const basis = createBasis(start, end)
    const axisLen = basis.distance || 150
    const controlPoints: Vec2[] = []
    const detourCount = 2 + Math.floor(Math.random() * 2) // 2 or 3
    for (let i = 0; i < detourCount; i++) {
      const along = -0.15 + Math.random() * 1.3 // travel before/after endpoints
      const tangential = (Math.random() - 0.5) * 0.6 * axisLen
      const lateral = (Math.random() * 2 - 1) * 0.5 * axisLen
      const anchor = {
        x: start.x + basis.direction.x * axisLen * along,
        y: start.y + basis.direction.y * axisLen * along,
      }
      const detour = {
        x: anchor.x + basis.direction.x * tangential + basis.normal.x * lateral,
        y: anchor.y + basis.direction.y * tangential + basis.normal.y * lateral,
      }
      controlPoints.push(detour)
    }
    return { controlPoints } satisfies DetourParams
  },
  sample: ({ start, end, t, params }) => {
    const points = [start, ...(params.controlPoints ?? []), end]
    return sampleCatmullPath(points, t)
  },
}

type ScatterParams = { scatterPoints: Vec2[] }

const scatterSplinePath: ParametricPathDefinition = {
  id: 'scatter-spline',
  label: 'Scatter Spline',
  description: 'Visits a scatter-shot set of random points (splined) before finishing at the target.',
  createParams: ({ start, end }) => {
    const dx = Math.abs(end.x - start.x)
    const dy = Math.abs(end.y - start.y)
    const span = Math.max(dx, dy, 80)
    const minX = Math.min(start.x, end.x) - span * 0.25
    const minY = Math.min(start.y, end.y) - span * 0.25
    const width = dx + span * 0.5 || span
    const height = dy + span * 0.5 || span
    const pointCount = 3 + Math.floor(Math.random() * 3) // 3-5 scatter points
    const scatterPoints = Array.from({ length: pointCount }, () => ({
      x: minX + Math.random() * width,
      y: minY + Math.random() * height,
    }))
    return { scatterPoints } satisfies ScatterParams
  },
  sample: ({ start, end, t, params }) => {
    const points = [start, ...(params.scatterPoints ?? []), end]
    return sampleCatmullPath(points, t)
  },
}

export const parametricPaths: ParametricPathDefinition[] = [
  straightLinePath,
  sinusoidalWavePath,
  semiCirclePath,
  circularArcPath,
  randomDetourPath,
  scatterSplinePath,
]

export const parametricPathMap = new Map(parametricPaths.map(def => [def.id, def]))
