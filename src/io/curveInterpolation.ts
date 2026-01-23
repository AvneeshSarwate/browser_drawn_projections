import { UnitBezier } from '@/animation/beziers'
import type { CurveValue } from '@/io/abletonClips'

export type LerpDef = {
  startInd: number
  endInd: number
  lerpVal: number
}

export function pos2lerp(pos: number, positions: number[]): LerpDef {
  let ind = 0
  while (ind < positions.length - 1 && pos > positions[ind + 1]) ind += 1
  if (ind === positions.length - 1) {
    return { startInd: ind, endInd: ind, lerpVal: 1 }
  }
  const denom = positions[ind + 1] - positions[ind]
  const lerpVal = denom === 0 ? 0 : (pos - positions[ind]) / denom
  return { startInd: ind, endInd: ind + 1, lerpVal }
}

export function curve2val(pos: number, curveVals: CurveValue[]): number {
  if (curveVals.length === 0) return 0
  if (curveVals.length === 1) return curveVals[0].value

  const positions = curveVals.map((cv) => cv.timeOffset)
  const values = curveVals.map((cv) => cv.value)

  if (pos < positions[0]) return values[0]
  if (pos > positions[positions.length - 1]) return values[values.length - 1]

  const handles = curveVals.map((cv) => [cv.x1, cv.y1, cv.x2, cv.y2])
  const lerpDef = pos2lerp(pos, positions)
  const leftHandles = handles[lerpDef.startInd]
  const bez = new UnitBezier(leftHandles[0], leftHandles[1], leftHandles[2], leftHandles[3])
  const bezVal = bez.solve(lerpDef.lerpVal)
  const startVal = values[lerpDef.startInd]
  const endVal = values[lerpDef.endInd]
  return bezVal * endVal + (1 - bezVal) * startVal
}
