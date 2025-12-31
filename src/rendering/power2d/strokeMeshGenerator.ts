import type { Point2D, StrokeMeshData } from './types';

function vecSub(a: Point2D, b: Point2D): [number, number] {
  return [a[0] - b[0], a[1] - b[1]];
}

function vecLen(v: [number, number]): number {
  return Math.hypot(v[0], v[1]);
}

function vecNormalize(v: [number, number]): [number, number] {
  const len = vecLen(v);
  if (len === 0) return [0, 0];
  return [v[0] / len, v[1] / len];
}

function vecPerp(v: [number, number]): [number, number] {
  return [-v[1], v[0]];
}

function vecAdd(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]];
}

function vecDot(a: [number, number], b: [number, number]): number {
  return a[0] * b[0] + a[1] * b[1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function generateStrokeMesh(points: readonly Point2D[], thickness: number, closed: boolean): StrokeMeshData {
  const count = points.length;
  if (count < 2) {
    return {
      positions: new Float32Array(0),
      uvs: new Float32Array(0),
      normals: new Float32Array(0),
      sides: new Float32Array(0),
      arcLengths: new Float32Array(0),
      normalizedArcs: new Float32Array(0),
      miterFactors: new Float32Array(0),
      indices: new Uint32Array(0),
      totalArcLength: 0,
    };
  }

  const arcLengths: number[] = new Array(count).fill(0);
  let totalLength = 0;
  for (let i = 1; i < count; i++) {
    const segment = vecSub(points[i], points[i - 1]);
    totalLength += vecLen(segment);
    arcLengths[i] = totalLength;
  }
  if (closed) {
    totalLength += vecLen(vecSub(points[0], points[count - 1]));
  }

  const normals: [number, number][] = new Array(count);
  const miterFactors: number[] = new Array(count).fill(1);

  for (let i = 0; i < count; i++) {
    const prevIndex = i === 0 ? (closed ? count - 1 : 0) : i - 1;
    const nextIndex = i === count - 1 ? (closed ? 0 : count - 1) : i + 1;

    const prevPoint = points[prevIndex];
    const currPoint = points[i];
    const nextPoint = points[nextIndex];

    const dirPrev = vecNormalize(vecSub(currPoint, prevPoint));
    const dirNext = vecNormalize(vecSub(nextPoint, currPoint));

    if (!closed && (i === 0 || i === count - 1)) {
      const dir = i === 0 ? dirNext : dirPrev;
      normals[i] = vecPerp(dir);
      miterFactors[i] = 1;
      continue;
    }

    const normalPrev = vecPerp(dirPrev);
    const normalNext = vecPerp(dirNext);
    const tangent = vecNormalize(vecAdd(dirPrev, dirNext));
    const miter = vecPerp(tangent);

    const denom = vecDot(miter, normalNext);
    let miterLen = denom !== 0 ? 1 / denom : 1;
    miterLen = clamp(miterLen, -4, 4);

    normals[i] = miter;
    miterFactors[i] = miterLen;
  }

  // Closed strokes need a duplicated seam vertex (normalizedArc = 1.0) to avoid 0↔1 interpolation across a triangle.
  const useSeamDuplicate = closed && count >= 2;
  const extendedCount = useSeamDuplicate ? count + 1 : count;
  const vertexCount = extendedCount * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const normalData = new Float32Array(vertexCount * 2);
  const sideData = new Float32Array(vertexCount);
  const arcData = new Float32Array(vertexCount);
  const normalizedArcData = new Float32Array(vertexCount);
  const miterData = new Float32Array(vertexCount);

  const totalArc = totalLength || 1;

  for (let i = 0; i < extendedCount; i++) {
    const baseIndex = i < count ? i : 0;
    const [x, y] = points[baseIndex];
    const normal = normals[baseIndex] ?? [0, 0];
    const arc = i < count ? arcLengths[baseIndex] : totalLength;
    const normalized = i < count ? arc / totalArc : 1.0;
    const miterFactor = miterFactors[baseIndex] ?? 1;

    const leftIndex = i * 2;
    const rightIndex = i * 2 + 1;

    positions[leftIndex * 3 + 0] = x;
    positions[leftIndex * 3 + 1] = y;
    positions[leftIndex * 3 + 2] = 0;

    positions[rightIndex * 3 + 0] = x;
    positions[rightIndex * 3 + 1] = y;
    positions[rightIndex * 3 + 2] = 0;

    uvs[leftIndex * 2 + 0] = 0;
    uvs[leftIndex * 2 + 1] = normalized;
    uvs[rightIndex * 2 + 0] = 1;
    uvs[rightIndex * 2 + 1] = normalized;

    normalData[leftIndex * 2 + 0] = normal[0];
    normalData[leftIndex * 2 + 1] = normal[1];
    normalData[rightIndex * 2 + 0] = normal[0];
    normalData[rightIndex * 2 + 1] = normal[1];

    sideData[leftIndex] = -1;
    sideData[rightIndex] = 1;

    arcData[leftIndex] = arc;
    arcData[rightIndex] = arc;

    normalizedArcData[leftIndex] = normalized;
    normalizedArcData[rightIndex] = normalized;

    miterData[leftIndex] = miterFactor;
    miterData[rightIndex] = miterFactor;
  }

  const indices: number[] = [];
  const segmentCount = useSeamDuplicate ? extendedCount - 1 : closed ? count : count - 1;
  for (let i = 0; i < segmentCount; i++) {
    const next = useSeamDuplicate ? i + 1 : closed ? (i + 1) % count : i + 1;
    const v0 = i * 2;
    const v1 = i * 2 + 1;
    const v2 = next * 2;
    const v3 = next * 2 + 1;
    indices.push(v0, v2, v1);
    indices.push(v1, v2, v3);
  }

  void thickness;

  return {
    positions,
    uvs,
    normals: normalData,
    sides: sideData,
    arcLengths: arcData,
    normalizedArcs: normalizedArcData,
    miterFactors: miterData,
    indices: new Uint32Array(indices),
    totalArcLength: totalLength,
  };
}
