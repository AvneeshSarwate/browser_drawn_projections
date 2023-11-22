export type BezierPoint = {
  id: string;
  position: number;
  connectedRight: boolean;
  handles: number[];
  type: string;
  value: number;
}

export type TrackData = {
  __debugName: string;
  keyframes: BezierPoint[];
}

export type AnimatedObject = {
  trackData: {
    [key: string]: TrackData;
  }
  trackIdByPropPath: {[key: string]: string};
}

export type TheatreSequence = {
  length: number;
  tracksByObject: {
    [key: string]: AnimatedObject;
  }
}


export class UnitBezier {
  private cx: number;
  private bx: number;
  private ax: number;
  private cy: number;
  private by: number;
  private ay: number;

  constructor(p1x: number, p1y: number, p2x: number, p2y: number) {
      this.cx = 3.0 * p1x;
      this.bx = 3.0 * (p2x - p1x) - this.cx;
      this.ax = 1.0 - this.cx - this.bx;
      this.cy = 3.0 * p1y;
      this.by = 3.0 * (p2y - p1y) - this.cy;
      this.ay = 1.0 - this.cy - this.by;
  }

  private sampleCurveX(t: number): number {
      return ((this.ax * t + this.bx) * t + this.cx) * t;
  }

  private sampleCurveY(t: number): number {
      return ((this.ay * t + this.by) * t + this.cy) * t;
  }

  private sampleCurveDerivativeX(t: number): number {
      return (3.0 * this.ax * t + 2.0 * this.bx) * t + this.cx;
  }

  private solveCurveX(x: number, epsilon: number): number {
      let t0: number;
      let t1: number;
      let t2 = x;
      let x2: number;
      let d2: number;

      for (let i = 0; i < 8; i++) {
          x2 = this.sampleCurveX(t2) - x;
          if (Math.abs(x2) < epsilon) return t2;
          d2 = this.sampleCurveDerivativeX(t2);
          if (Math.abs(d2) < 1e-6) break;
          t2 -= x2 / d2;
      }

      t0 = 0.0;
      t1 = 1.0;
      if (t2 < t0) return t0;
      if (t2 > t1) return t1;
      while (t0 < t1) {
          x2 = this.sampleCurveX(t2);
          if (Math.abs(x2 - x) < epsilon) return t2;
          if (x > x2) t0 = t2; else t1 = t2;
          t2 = (t1 - t0) * 0.5 + t0;
      }

      return t2;
  }

  public solve(x: number, epsilon = 1e-6): number {
      return this.sampleCurveY(this.solveCurveX(x, epsilon));
  }
}

export class LerpDef {
  public startInd: number;
  public endInd: number;
  public lerpVal: number;

  constructor(startInd: number, endInd: number, lerpVal: number) {
      this.startInd = startInd;
      this.endInd = endInd;
      this.lerpVal = lerpVal;
  }
}

export function pos2lerp(pos: number, positions: number[]): LerpDef {
  let ind = 0;
  while (ind < positions.length - 1 && pos > positions[ind + 1]) ind++;
  if (ind === positions.length - 1) {
      return new LerpDef(ind, ind, 1.0);
  } else {
      return new LerpDef(ind, ind + 1, (pos - positions[ind]) / (positions[ind + 1] - positions[ind]));
  }
}

export function pos2val(pos: number, positions: number[], values: number[], handles: number[][]): number {
  const lerpDef = pos2lerp(pos, positions);
  const leftHandles = handles[lerpDef.startInd];
  const rightHandles = handles[lerpDef.endInd];
  const bez = new UnitBezier(leftHandles[2], leftHandles[3], rightHandles[0], rightHandles[1]);
  const bezVal = bez.solve(lerpDef.lerpVal);
  const startVal = values[lerpDef.startInd];
  const endVal = values[lerpDef.endInd];
  return bezVal * endVal + (1.0 - bezVal) * startVal;
}


export function getAnimPos(debugName: string, normTime: number, seq: TheatreSequence) {
  for(const objKey in seq.tracksByObject) {
    const obj = seq.tracksByObject[objKey];
    for(const trackKey in obj.trackData) {
      const track = obj.trackData[trackKey];
      if(track.__debugName === debugName) {
        const positions = track.keyframes.map(kf => kf.position);
        const values = track.keyframes.map(kf => kf.value);
        const handles = track.keyframes.map(kf => kf.handles);
        return pos2val(normTime * seq.length, positions, values, handles);
      }
    }
  }
  return 0;
}

