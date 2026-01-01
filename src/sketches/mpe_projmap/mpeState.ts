import type { CancelablePromiseProxy } from '@/channels/offline_time_context'
import type { Point } from './textRegionUtils'

/**
 * MPE voice state - what we get from MPEInput events.
 * Updated live as the note is held.
 */
export type MPEVoiceState = {
  channel: number
  noteNum: number
  velocity: number
  pressure: number  // 0-127, updated live via channel aftertouch
  timbre: number    // 0-127, updated live via CC74
  bend: number      // pitch bend value (-8192 to +8191, 0 = center)
}

/**
 * Bundle of state for an MPE-animated polygon.
 * Each polygon gets one bundle; voice allocation assigns notes to bundles.
 */
export type MPEAnimBundle = {
  polygonId: string
  voice: MPEVoiceState | null  // null = no active note on this polygon
  fillProgress: number         // 0-1, driven by attack/release animation
  spots: Point[]               // pre-computed fill positions (sparse grid)
  animLoop: CancelablePromiseProxy<void> | null
}
