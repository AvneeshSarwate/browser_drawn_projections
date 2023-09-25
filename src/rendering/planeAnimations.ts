
import type { Region } from '@/stores/stores'
import p5 from 'p5'


function toLR(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points
  return [[tl, tr], [bl, br]]
}

function toRL(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points
  return [[tr, tl], [br, bl]]
}

function toTB(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points
  return [[tl, bl], [tr, br]]
}

function toBT(points: p5.Vector[]): p5.Vector[][] {
  const [tl, bl, br, tr] = points
  return [[bl, tl], [br, tr]]
}

function linePhaseDraw(p5Instance: p5, region: Region, phase: number, points: p5.Vector[][]) {
  p5Instance.push()
  region.setStyle(p5Instance)

  const l0 = p5.Vector.lerp(points[0][0], points[0][1], phase)
  const l1 = p5.Vector.lerp(points[1][0], points[1][1], phase)
  
  p5Instance.line(l0.x, l0.y, l1.x, l1.y)

  p5Instance.pop()
}

export function lrLine(duration: number) {
  return new AnimationSegment((p5i: p5, r: Region, p: number) => linePhaseDraw(p5i, r, p, toLR(r.points.list)), duration)
}

export function rlLine(duration: number) {
  return new AnimationSegment((p5i: p5, r: Region, p: number) => linePhaseDraw(p5i, r, p, toRL(r.points.list)), duration)
}

export function tbLine(duration: number) {
  return new AnimationSegment((p5i: p5, r: Region, p: number) => linePhaseDraw(p5i, r, p, toTB(r.points.list)), duration)
}

export function btLine(duration: number) {
  return new AnimationSegment((p5i: p5, r: Region, p: number) => linePhaseDraw(p5i, r, p, toBT(r.points.list)), duration)
}

function zoom(p5Instance: p5, region: Region, phase: number, out = false) {
  p5Instance.push()
  region.setStyle(p5Instance)

  const center = region.points.list.reduce((acc, v) => acc.add(v), p5Instance.createVector(0, 0)).div(region.points.list.length)
  const lerpPoints = region.points.list.map(v => p5.Vector.lerp(v, center, out ? 1 - phase : phase))
  
  p5Instance.beginShape()
  lerpPoints.forEach(v => p5Instance.vertex(v.x, v.y))
  p5Instance.endShape(p5Instance.CLOSE)

  p5Instance.pop()
}

export function zoomIn(duration: number) {
  return new AnimationSegment((p5Instance: p5, region: Region, phase: number) => zoom(p5Instance, region, phase, false), duration)
}

export function zoomOut(duration: number) {
  return new AnimationSegment((p5Instance: p5, region: Region, phase: number) => zoom(p5Instance, region, phase, true), duration)
}

export class PerimiterDots {
  public region: Region
  public numDots: number
  private sideLengthsRunningSum: number[] = [] 
  private sideLengths: number[] = []
  constructor(region: Region, numDots: number) {
    this.region = region
    this.numDots = numDots
    this.initMetadata()
  }

  initMetadata() {
    const points = this.region.points.list
    const pointsLen = points.length
    this.sideLengths = points.map((v, i) => v.dist(points[(i + 1) % pointsLen]))
    let runningSum = 0
    this.sideLengthsRunningSum = this.sideLengths.map(v => runningSum += v)
  }

  getDot(phase: number): p5.Vector {
    const points = this.region.points.list
    const pointsLen = points.length
    const totalPerimiter = this.sideLengthsRunningSum[this.sideLengthsRunningSum.length - 1]
    const perimiterPhase = phase * totalPerimiter
    const sideInd = this.sideLengthsRunningSum.findIndex(v => perimiterPhase < v)
    const lastSideSum = this.sideLengthsRunningSum[sideInd - 1] || 0
    const sidePhase = (perimiterPhase - lastSideSum) / this.sideLengths[sideInd]
    const dot = p5.Vector.lerp(points[sideInd], points[(sideInd + 1) % pointsLen], sidePhase)
    return dot
  }

  draw(p5Instance: p5, phase: number) {
    p5Instance.push()
    for (let i = 0; i < this.numDots; i++) {
      const dot = this.getDot((phase + i / this.numDots) % 1)
      p5Instance.ellipse(dot.x, dot.y, 15, 15)
    }
    p5Instance.pop()
  }

  public anim(duration: number) {
    return new AnimationSegment((p5Instance: p5, region: Region, phase: number) => this.draw(p5Instance, phase), duration)
  }
}

//negative mod
function mod(n: number, m: number) {
  return ((n % m) + m) % m
}

export class AnimationSegment {
  duration: number
  phaseDraw: (p5i: p5, region: Region, phase: number) => void
  constructor(phaseDraw: (p5i: p5, region: Region, phase: number) => void, duration: number) {
    this.duration = duration
    this.phaseDraw = phaseDraw
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