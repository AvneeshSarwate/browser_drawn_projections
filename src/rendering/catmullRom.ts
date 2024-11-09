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


function catmullRomAtY(yTarget: number, controlPoints: Point[]): Point[] {
    const solutions: Point[] = [];

    // Helper function to calculate coefficients
    const calculateCoefficients = (p0: number, p1: number, p2: number, p3: number): [number, number, number, number] => {
        const a0 = 2 * p1;
        const a1 = p2 - p0;
        const a2 = 2 * p0 - 5 * p1 + 4 * p2 - p3;
        const a3 = -p0 + 3 * p1 - 3 * p2 + p3;
        return [a0, a1, a2, a3];
    };

    // Solve cubic equation using Newton's method
    const solveCubic = (coeffs: [number, number, number, number], yTarget: number): number[] => {
        const [b0, b1, b2, b3] = coeffs;

        // Cubic equation: b3 * t^3 + b2 * t^2 + b1 * t + (b0 - yTarget) = 0
        const cubic = (t: number): number => b0 + b1 * t + b2 * t ** 2 + b3 * t ** 3 - yTarget;

        const cubicDerivative = (t: number): number => b1 + 2 * b2 * t + 3 * b3 * t ** 2;

        const roots: number[] = [];
        const maxIterations = 100;
        const tolerance = 1e-6;

        // Initial guesses for t
        const initialGuesses = [0, 0.5, 1];
        for (const guess of initialGuesses) {
            let t = guess;
            let iteration = 0;

            while (iteration < maxIterations) {
                const value = cubic(t);
                const derivative = cubicDerivative(t);

                if (Math.abs(value) < tolerance) break; // Root found
                if (Math.abs(derivative) < tolerance) break; // Avoid divide-by-zero

                t -= value / derivative;
                iteration++;
            }

            if (t >= 0 && t <= 1 && !roots.some(root => Math.abs(root - t) < tolerance)) {
                roots.push(t); // Add unique root within range
            }
        }

        return roots;
    };

    // Iterate through each segment
    for (let i = 0; i < controlPoints.length - 3; i++) {
        const [P0, P1, P2, P3] = controlPoints.slice(i, i + 4);

        // Calculate y coefficients
        const yCoeffs = calculateCoefficients(P0.y, P1.y, P2.y, P3.y);
        const validT = solveCubic(yCoeffs, yTarget);

        // Compute x for each valid t
        for (const t of validT) {
            const xCoeffs = calculateCoefficients(P0.x, P1.x, P2.x, P3.x);
            const [a0, a1, a2, a3] = xCoeffs;
            const x = a0 + a1 * t + a2 * t ** 2 + a3 * t ** 3;

            solutions.push({ x, y: yTarget });
        }
    }

    return solutions;
}

// Example Usage
const controlPoints: Point[] = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 3, y: 5 },
    { x: 5, y: 2 },
    { x: 6, y: 0 },
];

const yTarget = 2;
const pointsAtY = catmullRomAtY(yTarget, controlPoints);
console.log("Points on the spline at y =", yTarget, ":", pointsAtY);
