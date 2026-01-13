import { launchBrowser, type CancelablePromiseProxy } from '@/channels/offline_time_context'
import type { MPEAnimBundle } from './mpeState'
import type { RenderState, Point } from './textRegionUtils'
import { FRAME_WAIT } from './textRegionUtils'
import { createNoise2D } from 'simplex-noise'

// Module-level noise instance for consistent animation across all bundles
const noise2D = createNoise2D()

// Noise animation parameters
const NOISE_SPEED_FACTOR = 0.05      // How fast time advances per unit timbre (0-1 range)
const NOISE_MAGNITUDE_MAX = 85       // Maximum pixel deviation at full timbre
const NOISE_SPATIAL_SCALE = 10      // Scale factor for point index in noise space

// Enable/disable logging
const LOG_ENABLED = true
const log = (...args: any[]) => LOG_ENABLED && console.log('[MPE-ADSR]', ...args)

/**
 * Start the attack (fill-in) animation for an MPE note.
 * Ramps fillProgress from current value to 1 over attackTime,
 * then holds during sustain while voice is active.
 *
 * @param bundle - The MPE animation bundle for this polygon
 * @param attackTime - Attack time in seconds
 * @param renderStates - Map of render states to update
 * @returns Cancelable promise proxy for the animation loop
 */
export function startFillAnimation(
  bundle: MPEAnimBundle,
  attackTime: number,
  renderStates: Map<string, RenderState>
): CancelablePromiseProxy<void> {
  log(`ATTACK START - polygon: ${bundle.polygonId}, attackTime: ${attackTime}s, currentProgress: ${bundle.fillProgress}, spots: ${bundle.spots.length}`)

  // Cancel any existing animation on this bundle (silently - this is expected)
  if (bundle.animLoop) {
    log(`  -> Canceling previous animation loop`)
    bundle.animLoop.cancel()
  }

  const loop = launchBrowser(async (ctx) => {
    // Attack phase: ramp fillProgress from current to 1
    const startProgress = bundle.fillProgress
    const attackStart = ctx.time
    log(`ATTACK PHASE BEGIN - polygon: ${bundle.polygonId}, startProgress: ${startProgress}`)

    while (!ctx.isCanceled && bundle.fillProgress < 1) {
      const elapsed = ctx.time - attackStart
      const t = attackTime > 0 ? elapsed / attackTime : 1
      bundle.fillProgress = Math.min(1, startProgress + (1 - startProgress) * t)
      updateRenderState(bundle, renderStates)
      await ctx.waitSec(FRAME_WAIT)
    }

    if (ctx.isCanceled) {
      log(`ATTACK CANCELED - polygon: ${bundle.polygonId}, progress: ${bundle.fillProgress}`)
      return
    }

    // Ensure we hit exactly 1
    bundle.fillProgress = 1
    updateRenderState(bundle, renderStates)
    log(`SUSTAIN BEGIN - polygon: ${bundle.polygonId}`)

    // Sustain phase: hold at 1, keep updating render state for MPE modulation
    // The loop keeps running so pressure/timbre/bend changes are reflected
    let sustainFrames = 0
    while (!ctx.isCanceled && bundle.voice) {
      updateRenderState(bundle, renderStates)
      sustainFrames++
      if (sustainFrames % 60 === 0) { // Log every ~1 second
        log(`SUSTAIN - polygon: ${bundle.polygonId}, frames: ${sustainFrames}, voice: ${bundle.voice?.noteNum}`)
      }
      await ctx.waitSec(FRAME_WAIT)
    }

    if (ctx.isCanceled) {
      log(`SUSTAIN CANCELED - polygon: ${bundle.polygonId}`)
    } else {
      log(`SUSTAIN END (voice released) - polygon: ${bundle.polygonId}`)
    }
  })

  bundle.animLoop = loop

  // Suppress the "aborted" error which is expected on cancellation
  loop.catch?.((err: Error) => {
    if (err?.message !== 'aborted') {
      console.error('[MPE-ADSR] Unexpected error in attack animation:', err)
    }
  })

  return loop
}

/**
 * Start the release animation for an MPE note.
 * Ramps fillProgress from current value to 0 over releaseTime.
 *
 * @param bundle - The MPE animation bundle for this polygon
 * @param releaseTime - Release time in seconds
 * @param renderStates - Map of render states to update
 * @returns Cancelable promise proxy for the animation loop
 */
export function startReleaseAnimation(
  bundle: MPEAnimBundle,
  releaseTime: number,
  renderStates: Map<string, RenderState>
): CancelablePromiseProxy<void> {
  log(`RELEASE START - polygon: ${bundle.polygonId}, releaseTime: ${releaseTime}s, currentProgress: ${bundle.fillProgress}`)

  // Cancel any existing animation on this bundle (silently - this is expected)
  if (bundle.animLoop) {
    log(`  -> Canceling previous animation loop`)
    bundle.animLoop.cancel()
  }

  const loop = launchBrowser(async (ctx) => {
    const startProgress = bundle.fillProgress
    const releaseStart = ctx.time
    log(`RELEASE PHASE BEGIN - polygon: ${bundle.polygonId}, startProgress: ${startProgress}`)

    while (!ctx.isCanceled && bundle.fillProgress > 0) {
      const elapsed = ctx.time - releaseStart
      const t = releaseTime > 0 ? elapsed / releaseTime : 1
      bundle.fillProgress = Math.max(0, startProgress * (1 - t))
      updateRenderState(bundle, renderStates)
      await ctx.waitSec(FRAME_WAIT)
    }

    if (ctx.isCanceled) {
      log(`RELEASE CANCELED - polygon: ${bundle.polygonId}, progress: ${bundle.fillProgress}`)
      return
    }

    // Ensure we hit exactly 0
    bundle.fillProgress = 0
    updateRenderState(bundle, renderStates)
    log(`RELEASE END - polygon: ${bundle.polygonId}`)
  })

  bundle.animLoop = loop

  // Suppress the "aborted" error which is expected on cancellation
  loop.catch?.((err: Error) => {
    if (err?.message !== 'aborted') {
      console.error('[MPE-ADSR] Unexpected error in release animation:', err)
    }
  })

  return loop
}

/**
 * Update the render state for a bundle based on current fill progress.
 * The number of visible spots is proportional to fillProgress.
 * Also includes MPE voice data for color/size modulation.
 * Applies simplex noise deviation to positions based on timbre.
 */
function updateRenderState(
  bundle: MPEAnimBundle,
  renderStates: Map<string, RenderState>
) {
  const numSpots = Math.floor(bundle.spots.length * bundle.fillProgress)

  // Get timbre value (0-1 range) for noise animation
  // Use lastNoteInfo during release to maintain noise animation
  const timbreNorm = bundle.voice
    ? bundle.voice.timbre / 127
    : bundle.lastNoteInfo
      ? bundle.lastNoteInfo.timbre / 127
      : 0

  // Increment simplex time based on timbre (higher timbre = faster animation)
  bundle.simplexTime += timbreNorm * NOISE_SPEED_FACTOR

  // Calculate noise magnitude based on timbre (higher timbre = larger deviation)
  const noiseMagnitude = timbreNorm * NOISE_MAGNITUDE_MAX

  // Apply noise deviation to each visible spot position
  const letters = bundle.spots.slice(0, numSpots).map((pos, idx) => {
    // Use different noise offsets for x and y (offset y by 1000 in noise space)
    const noiseX = noise2D(idx * NOISE_SPATIAL_SCALE, bundle.simplexTime)
    const noiseY = noise2D(idx * NOISE_SPATIAL_SCALE, bundle.simplexTime + 1000)

    const deviatedPos: Point = {
      x: pos.x + noiseX * noiseMagnitude,
      y: pos.y + noiseY * noiseMagnitude
    }

    return { pos: deviatedPos, idx }
  })

  // Include MPE voice data for rendering (color, size modulation)
  // Use lastNoteInfo during release phase to maintain continuity
  const mpeVoice = bundle.voice ? {
    noteNum: bundle.voice.noteNum,
    pressure: bundle.voice.pressure,
    timbre: bundle.voice.timbre,
    bend: bundle.voice.bend
  } : bundle.lastNoteInfo ? {
    noteNum: bundle.lastNoteInfo.noteNum,
    pressure: bundle.lastNoteInfo.pressure,
    timbre: bundle.lastNoteInfo.timbre,
    bend: bundle.lastNoteInfo.bend
  } : null

  renderStates.set(bundle.polygonId, {
    letters,
    textOffset: 0,
    text: '',  // Not using text for MPE mode - we draw circles instead
    mpeVoice,
    mpeFillProgress: bundle.fillProgress
  })
}
