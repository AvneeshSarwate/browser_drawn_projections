type Point = { x: number; y: number };

export function catmullRomSpline(points: Point[], pos: number): Point {
    if (points.length < 4) {
        throw new Error("Need at least 4 points for Catmull-Rom spline calculation.");
    }

    const n = points.length - 1;
    const segment = Math.min(Math.floor(pos * n), n - 1);
    const t = (pos - segment / n) * n;

    const i0 = Math.max(0, segment - 1);
    const i1 = segment;
    const i2 = Math.min(segment + 1, n);
    const i3 = Math.min(segment + 2, n);

    const P0 = points[i0];
    const P1 = points[i1];
    const P2 = points[i2];
    const P3 = points[i3];

    const a = { x: -P0.x + 3 * P1.x - 3 * P2.x + P3.x, y: -P0.y + 3 * P1.y - 3 * P2.y + P3.y };
    const b = { x: 2 * P0.x - 5 * P1.x + 4 * P2.x - P3.x, y: 2 * P0.y - 5 * P1.y + 4 * P2.y - P3.y };
    const c = { x: -P0.x + P2.x, y: -P0.y + P2.y };
    const d = { x: 2 * P1.x, y: 2 * P1.y };

    const x = 0.5 * (a.x * t**3 + b.x * t**2 + c.x * t + d.x);
    const y = 0.5 * (a.y * t**3 + b.y * t**2 + c.y * t + d.y);

    return { x, y };
}

// Example usage
const points: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 0 },
    { x: 3, y: -1 },
    { x: 4, y: 0 }
];
const posValues: number[] = [0.0, 0.25, 0.5, 0.75, 1.0];

const splinePoints = posValues.map(pos => catmullRomSpline(points, pos));
console.log(splinePoints);
