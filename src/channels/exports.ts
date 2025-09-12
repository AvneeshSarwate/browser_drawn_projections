//todo monaco livecoding - generate these files from the type-definition build script

import { EventChop, Ramp, cos, cosN, launch, now, saw, sin, sinN, steps, tri, xyZip } from "./channels"
import { CancelablePromiseProxy, TimeContext } from "./base_time_context"

export const channelExports = {
  CancelablePromiseProxy: CancelablePromisePoxy,
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