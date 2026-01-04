import { type Point, isPointInsidePolygon, bboxOfPoints } from './textRegionUtils'

export type BBox = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Generate a sparse grid of fill positions inside a polygon.
 * Uses a staggered pattern: elements on every 2nd column, skipping every 2nd row.
 * This creates a visually interesting sparse arrangement.
 *
 * @param polygon - The polygon vertices
 * @param step - Grid step size in pixels
 * @returns Array of points inside the polygon
 */
export function generateSparseGrid(
  polygon: Point[],
  step: number
): Point[] {
  if (polygon.length < 3) return []

  const bbox = bboxOfPoints(polygon)
  const spots: Point[] = []
  let rowNum = 0

  for (let y = bbox.minY; y <= bbox.maxY; y += step) {
    // Skip alternate rows for sparseness
    if (rowNum % 2 === 0) {
      rowNum++
      continue
    }

    // Offset x by half step on every other included row for staggered pattern
    const xOffset = (rowNum % 4 === 1) ? 0 : step / 2

    for (let x = bbox.minX + xOffset; x <= bbox.maxX; x += step * 2) {
      const pt = { x, y }
      if (isPointInsidePolygon(pt, polygon, bbox)) {
        spots.push(pt)
      }
    }
    rowNum++
  }

  return spots
}

/**
 * Generate a denser grid of fill positions inside a polygon.
 * Every position in a regular grid that falls inside the polygon.
 *
 * @param polygon - The polygon vertices
 * @param step - Grid step size in pixels
 * @returns Array of points inside the polygon
 */
export function generateDenseGrid(
  polygon: Point[],
  step: number
): Point[] {
  if (polygon.length < 3) return []

  const bbox = bboxOfPoints(polygon)
  const spots: Point[] = []

  for (let y = bbox.minY; y <= bbox.maxY; y += step) {
    for (let x = bbox.minX; x <= bbox.maxX; x += step) {
      const pt = { x, y }
      if (isPointInsidePolygon(pt, polygon, bbox)) {
        spots.push(pt)
      }
    }
  }

  return spots
}
