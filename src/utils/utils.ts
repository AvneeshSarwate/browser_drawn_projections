export function pathPos(path: ({x: number, y: number})[], t: number): ({x: number, y: number}) {
  //for t in [0, 1], interpolate between the points in path
  //return the point at t
  const numPoints = path.length
  const i = Math.floor(t * numPoints)
  const j = i + 1
  const t0 = i / numPoints
  const t1 = j / numPoints
  const p0 = path[i % numPoints]
  const p1 = path[j % numPoints]
  const tInSegment = (t - t0) / (t1 - t0)
  const x = p0.x + (p1.x - p0.x) * tInSegment
  const y = p0.y + (p1.y - p0.y) * tInSegment
  return {x, y}
}