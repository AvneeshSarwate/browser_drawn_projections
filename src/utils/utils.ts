type simpleVec2 = { x: number; y: number }

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
  const cumulativeLengths: number[] = [0]
  for (let i = 0; i < path.length - 1; i++) {
    const length = Math.sqrt((path[i + 1].x - path[i].x) ** 2 + (path[i + 1].y - path[i].y) ** 2)
    totalLength += length
    cumulativeLengths.push(totalLength)
  }

  // If returnToStart is true, close the path by adding the segment from the last point to the first
  if (returnToStart) {
    const closingLength = Math.sqrt((path[0].x - path[path.length - 1].x) ** 2 + (path[0].y - path[path.length - 1].y) ** 2)
    totalLength += closingLength
    cumulativeLengths.push(totalLength)
  }

  // Calculate the target length
  let targetLength = t * totalLength

  // Adjust targetLength for wrapping around
  if (returnToStart) {
    targetLength = targetLength % totalLength
  }

  // Binary search for the target segment
  let low = 0
  let high = cumulativeLengths.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const midLength = cumulativeLengths[mid]
    if (midLength <= targetLength) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  // Determine the segment index
  const segmentIndex = (low > 0) ? low - 1 : 0;

  // Calculate the interpolation factor (segmentT)
  const segmentStartLength = cumulativeLengths[segmentIndex]
  const segmentEndLength = cumulativeLengths[segmentIndex + 1]
  const segmentT = (targetLength - segmentStartLength) / (segmentEndLength - segmentStartLength)

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




const testPts = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 4, y: 0 },
  { x: 5, y: 0 },
  { x: 6, y: 0 },
  { x: 7, y: 0 },
  { x: 8, y: 0 },
  { x: 9, y: 0 },
  { x: 10, y: 0 }
]
pathPosConstLen(testPts, 0.35, false)
const outTest = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => pathPosConstLen(testPts, n/10+0.05, false))
console.log("conPathTest", outTest)

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

export function weightedChoice<T>(choices: [T, number][]): T {
  const totalWeight = choices.reduce((acc, [_, weight]) => acc + weight, 0)
  const targetWeight = Math.random() * totalWeight
  let currentWeight = 0
  for (const [choice, weight] of choices) {
    currentWeight += weight
    if (currentWeight >= targetWeight) {
      return choice
    }
  }
  throw new Error('weightedChoice: unreachable code')
}

export function choice<T>(choices: T[]): T {
  return choices[Math.floor(Math.random() * choices.length)]
}

export function choiceN<T>(choices: T[], n: number): T[] {
  const outputs: T[] = []
  for (let i = 0; i < n; i++) {
    outputs.push(choice(choices))
  }
  return outputs
}

export function choiceNoReplaceN<T>(choices: T[], n: number): T[] {
  const choiceCopy = [...choices]
  choiceCopy.sort(() => Math.random() - 0.5)
  return choiceCopy.slice(0, n)
}

export const brd = (n: number) => Math.random() < n

