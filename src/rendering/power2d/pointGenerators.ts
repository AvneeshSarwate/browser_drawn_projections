import type { Point2D } from './types';

export interface RectOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleOptions {
  cx: number;
  cy: number;
  radius: number;
  segments?: number;
}

export interface EllipseOptions {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
  segments?: number;
}

export interface RegularPolygonOptions {
  cx: number;
  cy: number;
  radius: number;
  sides: number;
  rotation?: number;
}

export function RectPts(opts: RectOptions): Point2D[] {
  const { x, y, width, height } = opts;
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

export function CirclePts(opts: CircleOptions): Point2D[] {
  const { cx, cy, radius, segments = 32 } = opts;
  const points: Point2D[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

export function EllipsePts(opts: EllipseOptions): Point2D[] {
  const { cx, cy, radiusX, radiusY, segments = 32 } = opts;
  const points: Point2D[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY]);
  }
  return points;
}

export function RegularPolygonPts(opts: RegularPolygonOptions): Point2D[] {
  const { cx, cy, radius, sides, rotation = 0 } = opts;
  const points: Point2D[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i / sides) * Math.PI * 2;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return points;
}

export function PolygonPts(points: Array<{ x: number; y: number }>): Point2D[] {
  return points.map((p) => [p.x, p.y]);
}
