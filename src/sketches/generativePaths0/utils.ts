type simpleVec2 = { x: number, y: number };

export function pathPos(path: simpleVec2[], t: number, returnToStart = false): simpleVec2[] {
    // Validate input
    if (path.length === 0) {
        throw new Error("Path cannot be empty");
    }
    if (t < 0 || t > 1) {
        throw new Error("Parameter t must be between 0 and 1");
    }

    // Handle special case when path has only one point
    if (path.length === 1) {
        return [path[0]];
    }

    // Calculate the total number of segments and the target segment
    const totalSegments = returnToStart ? path.length : path.length - 1;
    const targetSegmentIndex = Math.floor(t * totalSegments);
    const segmentT = (t * totalSegments) - targetSegmentIndex;

    // Calculate the start and end points of the target segment
    const startPoint = path[targetSegmentIndex % path.length];
    const endPoint = path[(targetSegmentIndex + 1) % path.length];

    // Interpolate between the start and end points
    const interpolatedPoint: simpleVec2 = {
        x: startPoint.x + (endPoint.x - startPoint.x) * segmentT,
        y: startPoint.y + (endPoint.y - startPoint.y) * segmentT
    };

    return [interpolatedPoint];
}


export function centroid(points: ({x: number, y: number})[]) {
  const numPoints = points.length
  const sum = points.reduce((acc, p) => {
    acc.x += p.x
    acc.y += p.y
    return acc
  }, {x: 0, y: 0})
  return {x: sum.x / numPoints, y: sum.y / numPoints}
}

export function lerpToCentroid(points: ({ x: number, y: number })[], t: number) {
  const numPoints = points.length
  const c = centroid(points)
  const sum = points.reduce((acc, p) => {
    acc.x += p.x
    acc.y += p.y
    return acc
  }, {x: 0, y: 0})
  const p = {x: sum.x / numPoints, y: sum.y / numPoints}
  return {x: p.x + (c.x - p.x) * t, y: p.y + (c.y - p.y) * t}
}