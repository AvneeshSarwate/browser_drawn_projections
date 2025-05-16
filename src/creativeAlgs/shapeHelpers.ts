type Point = { x: number; y: number };

export function getBBox(region: Point[]): {minX: number, maxX: number, minY: number, maxY: number} {
  let maxX = -Infinity, maxY = -Infinity, minX = Infinity, minY = Infinity;
  region.forEach(p => {
      if(p.x > maxX) maxX = p.x;
      if(p.x < minX) minX = p.x;
      if(p.y > maxY) maxY = p.y;
      if(p.y < minY) minY = p.y;
  });
  return {minX, maxX, minY, maxY};
}

const mixn = (n1: number, n2: number, a: number) => n1*(1-a) + n2*a;

export function segment_intersection(ray1: Point[], ray2: Point[]) {
  const x1 = ray1[0].x,
      y1 = ray1[0].y,
      x2 = ray1[1].x,
      y2 = ray1[1].y, 
      x3 = ray2[0].x,
      y3 = ray2[0].y,
      x4 = ray2[1].x,
      y4 = ray2[1].y;
  const eps = 0.0000001;
  function between(a: number, b: number, c: number) {
      return a-eps <= b && b <= c+eps;
  }
  const x=((x1*y2-y1*x2)*(x3-x4)-(x1-x2)*(x3*y4-y3*x4)) /
          ((x1-x2)*(y3-y4)-(y1-y2)*(x3-x4));
  const y=((x1*y2-y1*x2)*(y3-y4)-(y1-y2)*(x3*y4-y3*x4)) /
          ((x1-x2)*(y3-y4)-(y1-y2)*(x3-x4));
  if (isNaN(x)||isNaN(y)) {
      return {x: -1, y: -1, valid: false};
  } else {
      if (x1>=x2) {
          if (!between(x2, x, x1)) {return {x: -1, y: -1, valid: false};}
      } else {
          if (!between(x1, x, x2)) {return {x: -1, y: -1, valid: false};}
      }
      if (y1>=y2) {
          if (!between(y2, y, y1)) {return {x: -1, y: -1, valid: false};}
      } else {
          if (!between(y1, y, y2)) {return {x: -1, y: -1, valid: false};}
      }
      if (x3>=x4) {
          if (!between(x4, x, x3)) {return {x: -1, y: -1, valid: false};}
      } else {
          if (!between(x3, x, x4)) {return {x: -1, y: -1, valid: false};}
      }
      if (y3>=y4) {
          if (!between(y4, y, y3)) {return {x: -1, y: -1, valid: false};}
      } else {
          if (!between(y3, y, y4)) {return {x: -1, y: -1, valid: false};}
      }
  }
  return {x: x, y: y, valid: true};
}

export function directionSweep(cellPoints:Point[], frac: number, direction: 'top' | 'bottom' | 'left' | 'right'){
  const cellBbox = getBBox(cellPoints);
  const isHorizontal = ['left', 'right'].includes(direction);
  if(['bottom', 'right'].includes(direction)) frac = 1 - frac;

  const fracVal = isHorizontal ? mixn(cellBbox.minX, cellBbox.maxX, frac) : mixn(cellBbox.minY, cellBbox.maxY, frac);
  const fracLine = isHorizontal ? [{x: fracVal, y: cellBbox.maxY}, {x: fracVal, y: cellBbox.minY}] : [{x: cellBbox.maxX, y: fracVal}, {x: cellBbox.minX, y: fracVal}];
  
  const lineSegments = cellPoints.map((p, i, a) => {
      const p2 = a[(i+1)%a.length];
      return [{x: p.x, y: p.y}, {x: p2.x, y: p2.y}];
  });
  const intersections = lineSegments.map(s => segment_intersection(s, fracLine)).filter(i => i.valid);

  let allPoints:Point[] = []; 
  if     (direction === 'top') allPoints = cellPoints.filter(p => p.y <= fracVal);
  else if(direction === 'bottom') allPoints = cellPoints.filter(p => p.y >= fracVal);
  else if(direction === 'left') allPoints = cellPoints.filter(p => p.x <= fracVal);
  else if(direction === 'right') allPoints = cellPoints.filter(p => p.x >= fracVal);
  intersections.forEach(p => allPoints.push({x: p.x, y: p.y}));

  const centerX = cellPoints.map(p => p.x).reduce((a,b) => a+b/cellPoints.length, 0);
  const centerY = cellPoints.map(p => p.y).reduce((a,b) => a+b/cellPoints.length, 0);
  const pointsTheta = allPoints.map(p => {
      return{
          x: p.x,
          y: p.y,
          theta: Math.atan2(p.y-centerY, p.x-centerX)
      }
  });

  const polygon = pointsTheta.sort((p1, p2) => p2.theta - p1.theta);
  return {polygon, line: fracLine};
}


export const lineToPointDistance = (p1: Point, p2: Point, point: Point): number => {
  const a = p2.y - p1.y
  const b = p1.x - p2.x
  const c = p1.y * p2.x - p1.x * p2.y
  const distance = (a * point.x + b * point.y + c) / Math.sqrt(a * a + b * b)
  return Math.abs(distance)
}


type Polygon = {
  points: Point[]
}
//assumes polygons are closed, have at least 3 points
export function findClosestPolygonLineAtPoint(polygons: Polygon[], point: Point): ({polygonIndex: number, lineIndex: number, distance: number}) {
  let closestPolygonIndex = -1
  let closestLineIndex = -1
  let closestDistance = Infinity
  for(let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i]
    for(let j = 0; j < polygon.points.length; j++) {
      const p1 = polygon.points[j]
      const p2 = polygon.points[(j+1)%polygon.points.length]
      const distance = lineToPointDistance(p1, p2, point)
      if(distance < closestDistance) {
        closestDistance = distance
        closestPolygonIndex = i
        closestLineIndex = j
      }
    }
  }
  return {polygonIndex: closestPolygonIndex, lineIndex: closestLineIndex, distance: closestDistance}
}

export function isPointInPolygon(polygon: Polygon, point: Point): boolean {
  let inside = false;
  const { points } = polygon;
  const n = points.length;
  // Iterate over each edge (points[j] -> points[i])
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    // Check if the horizontal ray intersects this edge
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}
