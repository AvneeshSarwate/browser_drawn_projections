type simpleVec2 = { x: number; y: number };

export function pathPosConstLen(path: simpleVec2[], t: number, returnToStart = false): simpleVec2 {
  // Validate input
  if (path.length === 0) {
    throw new Error('Path cannot be empty')
  }
  if (t < 0 || t > 1) {
    throw new Error('Parameter t must be between 0 and 1')
  }

  // Handle special case when path has only one point
  if (path.length === 1) {
    return path[0]
  }

  // Calculate the total length of the path and segment lengths
  let totalLength = 0
  const segmentLengths: number[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const length = Math.sqrt((path[i + 1].x - path[i].x) ** 2 + (path[i + 1].y - path[i].y) ** 2)
    segmentLengths.push(length)
    totalLength += length
  }

  // If returnToStart is true, close the path by adding the segment from the last point to the first
  if (returnToStart) {
    const closingLength = Math.sqrt((path[0].x - path[path.length - 1].x) ** 2 + (path[0].y - path[path.length - 1].y) ** 2)
    segmentLengths.push(closingLength)
    totalLength += closingLength
  }

  // Calculate the target length
  let targetLength = t * totalLength

  // Adjust targetLength for wrapping around
  if (returnToStart) {
    targetLength = targetLength % totalLength
  }

  // Binary search for the target segment
  let low = 0
  let high = segmentLengths.length - 1
  let currentLength = 0
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const nextLength = currentLength + segmentLengths[mid]
    if (nextLength <= targetLength) {
      currentLength = nextLength
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  // Adjust for the case when the loop exits with low > segmentLengths.length
  const segmentIndex = (low - 1) >= segmentLengths.length ? 0 : low - 1
  const segmentT = (targetLength - currentLength) / segmentLengths[segmentIndex]

  // Calculate the start and end points of the target segment
  const startPoint = path[segmentIndex]
  const endPoint = path[(segmentIndex + 1) % path.length]

  // Interpolate between the start and end points
  const interpolatedPoint: simpleVec2 = {
    x: startPoint.x + (endPoint.x - startPoint.x) * segmentT,
    y: startPoint.y + (endPoint.y - startPoint.y) * segmentT
  }

  return interpolatedPoint
}

export function pathPos(path: simpleVec2[], t: number, returnToStart = false): simpleVec2 {
  // Validate input
  if (path.length === 0) {
    throw new Error('Path cannot be empty')
  }
  if (t < 0 || t > 1) {
    throw new Error('Parameter t must be between 0 and 1')
  }

  // Handle special case when path has only one point
  if (path.length === 1) {
    return path[0]
  }

  // Calculate the total number of segments and the target segment
  const totalSegments = returnToStart ? path.length : path.length - 1
  const targetSegmentIndex = Math.floor(t * totalSegments)
  const segmentT = t * totalSegments - targetSegmentIndex

  // Calculate the start and end points of the target segment
  const startPoint = path[targetSegmentIndex % path.length]
  const endPoint = path[(targetSegmentIndex + 1) % path.length]

  // Interpolate between the start and end points
  const interpolatedPoint: simpleVec2 = {
    x: startPoint.x + (endPoint.x - startPoint.x) * segmentT,
    y: startPoint.y + (endPoint.y - startPoint.y) * segmentT
  }

  return interpolatedPoint
}

export function centroid(points: { x: number; y: number }[]) {
  const numPoints = points.length
  const sum = points.reduce(
    (acc, p) => {
      acc.x += p.x
      acc.y += p.y
      return acc
    },
    { x: 0, y: 0 }
  )
  return { x: sum.x / numPoints, y: sum.y / numPoints }
}

export function lerpToCentroid(points: { x: number; y: number }[], t: number) {
  const numPoints = points.length
  const c = centroid(points)
  const sum = points.reduce(
    (acc, p) => {
      acc.x += p.x
      acc.y += p.y
      return acc
    },
    { x: 0, y: 0 }
  )
  const p = { x: sum.x / numPoints, y: sum.y / numPoints }
  return { x: p.x + (c.x - p.x) * t, y: p.y + (c.y - p.y) * t }
}
