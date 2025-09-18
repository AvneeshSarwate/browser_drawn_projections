export type Point = { x: number; y: number }

export type Polygon = {
  points: Point[]
}

const lineToPointDistance = (p1: Point, p2: Point, point: Point): number => {
  const vx = p2.x - p1.x
  const vy = p2.y - p1.y
  const wx = point.x - p1.x
  const wy = point.y - p1.y

  const c1 = vx * wx + vy * wy
  if (c1 <= 0) return Math.hypot(wx, wy) // point is before p1

  const c2 = vx * vx + vy * vy
  if (c2 <= c1) return Math.hypot(point.x - p2.x, point.y - p2.y) // point is after p2

  const b = c1 / c2 // projection falls on segment
  const pbx = p1.x + b * vx
  const pby = p1.y + b * vy
  return Math.hypot(point.x - pbx, point.y - pby)
}

export function findClosestPolygonLineAtPoint(
  polygons: Polygon[],
  point: Point
): { polygonIndex: number; lineIndex: number; distance: number } {
  let closestPolygonIndex = -1
  let closestLineIndex = -1
  let closestDistance = Infinity
  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i]
    for (let j = 0; j < polygon.points.length; j++) {
      const p1 = polygon.points[j]
      const p2 = polygon.points[(j + 1) % polygon.points.length]
      const distance = lineToPointDistance(p1, p2, point)
      if (distance < closestDistance) {
        closestDistance = distance
        closestPolygonIndex = i
        closestLineIndex = j
      }
    }
  }
  return { polygonIndex: closestPolygonIndex, lineIndex: closestLineIndex, distance: closestDistance }
}
