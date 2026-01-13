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
  bend: number      // pitch bend value (typically -1.0..1.0 from MIDIVal)
}

/**
 * Bundle of state for an MPE-animated polygon.
 * Each polygon gets one bundle; voice allocation assigns notes to bundles.
 */
export type MPEAnimBundle = {
  polygonId: string
  voice: MPEVoiceState | null  // null = no active note on this polygon
  lastNoteInfo: { noteNum: number; bend: number; pressure: number; timbre: number } | null  // preserved after release for continuity
  fillProgress: number         // 0-1, driven by attack/release animation
  spots: Point[]               // pre-computed fill positions (sparse grid)
  animLoop: CancelablePromiseProxy<void> | null
  simplexTime: number          // accumulated time for noise animation, incremented by timbre each frame
}
