
import type { Region } from '@/stores/stores';
import p5 from 'p5';


function toLR(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points;
  return [[tl, tr], [bl, br]];
}

function toRL(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points;
  return [[tr, tl], [br, bl]];
}

function toTB(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points;
  return [[tl, bl], [tr, br]];
}

function toBT(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points;
  return [[bl, tl], [br, tr]];
}

function linePhaseDraw(p5Instance: p5, region: Region, phase: number, points: p5.Vector[][]) {
  p5Instance.push();
  region.setStyle(p5Instance);

  const l0 = p5.Vector.lerp(points[0][0], points[0][1], phase);
  const l1 = p5.Vector.lerp(points[1][0], points[1][1], phase);
  
  p5Instance.line(l0.x, l0.y, l1.x, l1.y);

  p5Instance.pop();
}

export function lrLine() {
  return (p5i: p5, r: Region, p: number) => linePhaseDraw(p5i, r, p, toLR(r.points.list))
}


export class AnimationSegment {
  duration: number;
  phaseDraw: (p5i: p5, region: Region, phase: number) => void;
  constructor(phaseDraw: (p5i: p5, region: Region, phase: number) => void, duration: number) {
    this.duration = duration;
    this.phaseDraw = phaseDraw;
  }
}

export class AnimationSeq {
  public segments: AnimationSegment[]
  constructor(segDefs: AnimationSegment[]) {
    this.segments = segDefs
  }

  public draw(p5i: p5, r: Region, animStart: number, time: number) {
    const durations = this.segments.map(s => s.duration)
    let durSum = 0
    const durationSums = durations.map((dur) => durSum += dur)
    const durationStarts = [0, ...durationSums]
    durationStarts.pop()
    const seqDurSum = durationSums[durationSums.length-1]
    const seqModTime = (time - animStart) % seqDurSum
    const segInd = durationSums.findIndex(v => seqModTime < v)
    const segmentPhase = (seqModTime - durationStarts[segInd]) / this.segments[segInd].duration
    this.segments[segInd].phaseDraw(p5i, r, segmentPhase)
  }
}

/*
Region will have the following properties 
- animationStartTime
- animationSeq
- drawAnimation() {this.animationSeq.draw(Date.now()-this.animationStartTime}

*/