//todo monaco livecoding - generate these files from the type-definition build script

import { CancelablePromisePoxy, EventChop, Ramp, TimeContext, cos, cosN, launch, now, saw, sin, sinN, steps, tri, xyZip } from "./channels"

export const channelExports = {
  CancelablePromisePoxy,
  launch, 
  TimeContext,
  Ramp,
  EventChop,
  now,
  sinN,
  cosN,
  sin,
  cos,
  tri,
  saw,
  xyZip,
  steps,
}

export const channelExportString = `const { ${Object.keys(channelExports).join(', ')} } = chanExports`