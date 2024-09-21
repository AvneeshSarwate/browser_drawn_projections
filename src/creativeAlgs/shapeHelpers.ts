function getBBox(region: {x: number, y: number}[]): {minX: number, maxX: number, minY: number, maxY: number} {
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

function segment_intersection(ray1: {x: number, y: number}[], ray2: {x: number, y: number}[]) {
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

export function directionSweep(cellPoints: {x: number, y: number}[], frac: number, direction: 'top' | 'bottom' | 'left' | 'right'){
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

  let allPoints: {x: number, y: number}[] = []; 
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