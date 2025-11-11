export type CatmullPoint = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const clonePoint = (point: CatmullPoint): CatmullPoint => ({ x: point.x, y: point.y });

const padOpenPoints = (points: CatmullPoint[]): CatmullPoint[] => {
    if (points.length >= 4) return points
    if (points.length === 3) return [clonePoint(points[0]), ...points]
    if (points.length === 2) return [clonePoint(points[0]), ...points, clonePoint(points[1])]
    if (points.length === 1) {
        const [p] = points
        return [clonePoint(p), clonePoint(p), clonePoint(p), clonePoint(p)]
    }
    throw new Error('Need at least one point for Catmull-Rom spline calculation.')
}

const catmullBlend = (P0: CatmullPoint, P1: CatmullPoint, P2: CatmullPoint, P3: CatmullPoint, t: number): CatmullPoint => {
    const a = { x: -P0.x + 3 * P1.x - 3 * P2.x + P3.x, y: -P0.y + 3 * P1.y - 3 * P2.y + P3.y }
    const b = { x: 2 * P0.x - 5 * P1.x + 4 * P2.x - P3.x, y: 2 * P0.y - 5 * P1.y + 4 * P2.y - P3.y }
    const c = { x: -P0.x + P2.x, y: -P0.y + P2.y }
    const d = { x: 2 * P1.x, y: 2 * P1.y }

    const x = 0.5 * (a.x * t ** 3 + b.x * t ** 2 + c.x * t + d.x)
    const y = 0.5 * (a.y * t ** 3 + b.y * t ** 2 + c.y * t + d.y)
    return { x, y }
}

export function catmullRomSpline(points: CatmullPoint[], pos: number, options?: { closed?: boolean }): CatmullPoint {
    if (points.length === 0) throw new Error('Need at least one point for Catmull-Rom spline calculation.')
    if (points.length === 1) return clonePoint(points[0])

    const closed = options?.closed ?? false
    const safePos = clamp(pos, 0, 1)

    if (closed) {
        const len = points.length
        const totalSegments = len
        const scaled = safePos * totalSegments
        const segment = Math.floor(scaled) % totalSegments
        const t = scaled - segment
        const getPoint = (offset: number) => points[(segment + offset + len) % len]
        return catmullBlend(getPoint(-1), getPoint(0), getPoint(1), getPoint(2), t)
    }

    const safePoints = padOpenPoints(points)
    const n = safePoints.length - 1
    const segment = Math.min(Math.floor(safePos * n), n - 1)
    const t = (safePos - segment / n) * n

    const i0 = Math.max(0, segment - 1)
    const i1 = segment
    const i2 = Math.min(segment + 1, n)
    const i3 = Math.min(segment + 2, n)

    return catmullBlend(safePoints[i0], safePoints[i1], safePoints[i2], safePoints[i3], t)
}

export function catmullRomAtY(yTarget: number, controlPoints: CatmullPoint[]): CatmullPoint[] {
    if (controlPoints.length < 4) return []
    const solutions: CatmullPoint[] = []

    const calculateCoefficients = (p0: number, p1: number, p2: number, p3: number): [number, number, number, number] => {
        const a0 = 2 * p1
        const a1 = p2 - p0
        const a2 = 2 * p0 - 5 * p1 + 4 * p2 - p3
        const a3 = -p0 + 3 * p1 - 3 * p2 + p3
        return [a0, a1, a2, a3]
    }

    const solveCubic = (coeffs: [number, number, number, number], target: number): number[] => {
        const [b0, b1, b2, b3] = coeffs

        const cubic = (t: number): number => b0 + b1 * t + b2 * t ** 2 + b3 * t ** 3 - target
        const cubicDerivative = (t: number): number => b1 + 2 * b2 * t + 3 * b3 * t ** 2

        const roots: number[] = []
        const maxIterations = 100
        const tolerance = 1e-6
        const initialGuesses = [0, 0.5, 1]

        for (const guess of initialGuesses) {
            let t = guess
            let iteration = 0
            while (iteration < maxIterations) {
                const value = cubic(t)
                const derivative = cubicDerivative(t)

                if (Math.abs(value) < tolerance) break
                if (Math.abs(derivative) < tolerance) break

                t -= value / derivative
                iteration++
            }

            if (t >= 0 && t <= 1 && !roots.some(root => Math.abs(root - t) < tolerance)) {
                roots.push(t)
            }
        }

        return roots
    }

    for (let i = 0; i < controlPoints.length - 3; i++) {
        const [P0, P1, P2, P3] = controlPoints.slice(i, i + 4)

        const yCoeffs = calculateCoefficients(P0.y, P1.y, P2.y, P3.y)
        const validT = solveCubic(yCoeffs, yTarget)

        for (const t of validT) {
            const xCoeffs = calculateCoefficients(P0.x, P1.x, P2.x, P3.x)
            const [a0, a1, a2, a3] = xCoeffs
            const x = a0 + a1 * t + a2 * t ** 2 + a3 * t ** 3
            solutions.push({ x, y: yTarget })
        }
    }

    return solutions
}
