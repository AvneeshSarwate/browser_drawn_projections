import type { TimeContext } from '@/channels/offline_time_context'
import type { LoopHandle } from '@/channels/base_time_context'
import { AbletonClip, type AbletonNote, type PianoRollMpePoint, type PianoRollNoteLike, cloneCurveValue, pianoRollNoteToAbletonNote } from '@/io/abletonClips'
import { clipMap } from '@/io/abletonClips'
import { splitTextToGroups, buildClipFromLine, parseRampLine } from './transformHelpers'

// Minimal type definitions for voice state (only properties actually used)
export type PlaybackVoiceState = {
  isPlaying: boolean
  hotSwapCued: boolean
}

// Minimal type for appState (only properties actually used)
export type PlaybackAppState = {
  sliders: number[]
  voices: PlaybackVoiceState[]
}

// Type definitions for playback functions
export type PlayNoteFunc = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, instInd: number) => void
export type LaunchRampFunc = (paramName: string, startVal: number, endVal: number, duration: number, voiceIdx: number, ctx: TimeContext) => LoopHandle

export const DELAY_SLIDER = 16

// Smart-smooth parameters (tweak here)
export const SMART_SMOOTH_CLOSE_THRESHOLD = 0.25
export const SMART_SMOOTH_JOIN_PROBABILITY = 0.3
const SMART_SMOOTH_MIN_SLIDE = 0.03
const SMART_SMOOTH_MAX_SLIDE = 0.25
const SMART_SMOOTH_FALLBACK_SLIDE = 0.1

const randomInRange = (min: number, max: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  return lo + Math.random() * (hi - lo)
}

const cloneAbletonNote = (note: AbletonNote): AbletonNote => ({
  ...note,
  pitchCurve: note.pitchCurve ? note.pitchCurve.map(cloneCurveValue) : undefined,
  pressureCurve: note.pressureCurve ? note.pressureCurve.map(cloneCurveValue) : undefined,
  timbreCurve: note.timbreCurve ? note.timbreCurve.map(cloneCurveValue) : undefined
})

const buildSlideNoteFromSequence = (
  sequence: AbletonNote[],
  slideDurations: number[],
  fallbackSlideDuration = SMART_SMOOTH_FALLBACK_SLIDE
): AbletonNote => {
  const baseNote = sequence[0]
  const baseStart = baseNote.position
  const basePitch = baseNote.pitch
  const baseVelocity = baseNote.velocity ?? 100
  const endTime = sequence.reduce((maxEnd, note) => {
    const noteEnd = note.position + note.duration
    return Math.max(maxEnd, noteEnd)
  }, baseStart + baseNote.duration)
  const totalDuration = Math.max(endTime - baseStart, baseNote.duration)

  const safeSlideDuration = Math.max(0, fallbackSlideDuration)
  const epsilon = 1e-6
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const toNormalizedTime = (absoluteTime: number) => {
    if (totalDuration <= 0) return 0
    return clamp((absoluteTime - baseStart) / totalDuration, 0, 1)
  }

  const points: PianoRollMpePoint[] = []
  points.push({ time: 0, pitchOffset: 0 })

  for (let i = 0; i < sequence.length - 1; i += 1) {
    const current = sequence[i]
    const next = sequence[i + 1]
    const currentStart = current.position
    const nextStart = next.position
    const currentOffset = current.pitch - basePitch
    const nextOffset = next.pitch - basePitch
    const halfTime = currentStart + (nextStart - currentStart) / 2
    const slideDuration = slideDurations[i] ?? safeSlideDuration
    const slideStartAbsolute = Math.max(nextStart - slideDuration, halfTime)
    const slideStart = toNormalizedTime(slideStartAbsolute)
    const nextTime = toNormalizedTime(nextStart)

    if (slideStart < nextTime - epsilon) {
      points.push({ time: slideStart, pitchOffset: currentOffset })
    }
    points.push({ time: nextTime, pitchOffset: nextOffset })
  }

  const lastOffset = sequence[sequence.length - 1].pitch - basePitch
  const endTimeNormalized = toNormalizedTime(endTime)
  if (endTimeNormalized > 0) {
    const lastPoint = points[points.length - 1]
    if (!lastPoint || Math.abs(lastPoint.time - endTimeNormalized) > epsilon) {
      points.push({ time: endTimeNormalized, pitchOffset: lastOffset })
    } else {
      lastPoint.pitchOffset = lastOffset
    }
  }

  const sortedPoints = points
    .slice()
    .sort((a, b) => a.time - b.time)
    .reduce((acc, point) => {
      const prev = acc[acc.length - 1]
      if (prev && Math.abs(prev.time - point.time) <= epsilon) {
        acc[acc.length - 1] = point
      } else {
        acc.push(point)
      }
      return acc
    }, [] as PianoRollMpePoint[])

  const pianoNote: PianoRollNoteLike = {
    pitch: basePitch,
    position: baseStart,
    duration: totalDuration,
    velocity: baseVelocity,
    mpePitch: { points: sortedPoints },
    metadata: baseNote.metadata
  }

  const slideNote = pianoRollNoteToAbletonNote(pianoNote)
  slideNote.noteId = baseNote.noteId
  slideNote.offVelocity = baseNote.offVelocity ?? baseVelocity
  slideNote.probability = baseNote.probability ?? 1
  slideNote.isEnabled = baseNote.isEnabled ?? true
  slideNote.velocityDeviation = baseNote.velocityDeviation
  slideNote.metadata = baseNote.metadata
  return slideNote
}

export const buildSmartSmoothClip = (
  clip: AbletonClip,
  closeThreshold = SMART_SMOOTH_CLOSE_THRESHOLD,
  joinProbability = SMART_SMOOTH_JOIN_PROBABILITY
): AbletonClip => {
  const sortedNotes = clip.notes
    .slice()
    .sort((a, b) => {
      const posDelta = a.position - b.position
      if (posDelta !== 0) return posDelta
      return a.pitch - b.pitch
    })

  if (sortedNotes.length === 0) {
    return new AbletonClip(`${clip.name}-smooth`, 0, [])
  }

  const safeThreshold = Math.max(0, closeThreshold)
  const safeProbability = Math.max(0, Math.min(1, joinProbability))
  const closeSlideDuration = randomInRange(
    SMART_SMOOTH_MIN_SLIDE,
    Math.max(SMART_SMOOTH_MIN_SLIDE, Math.min(SMART_SMOOTH_MAX_SLIDE, safeThreshold * 0.9))
  )
  const randomSlideDuration = () => randomInRange(SMART_SMOOTH_MIN_SLIDE, SMART_SMOOTH_MAX_SLIDE)

  const groups: Array<{ notes: AbletonNote[]; slideDurations: number[] }> = []
  let currentGroup = { notes: [sortedNotes[0]], slideDurations: [] as number[] }

  for (let i = 0; i < sortedNotes.length - 1; i += 1) {
    const current = sortedNotes[i]
    const next = sortedNotes[i + 1]
    const gap = next.position - current.position

    let join = false
    let slideDuration = SMART_SMOOTH_FALLBACK_SLIDE
    if (gap <= safeThreshold) {
      join = true
      slideDuration = closeSlideDuration
    } else if (Math.random() < safeProbability) {
      join = true
      slideDuration = randomSlideDuration()
    }

    if (join) {
      currentGroup.notes.push(next)
      currentGroup.slideDurations.push(slideDuration)
    } else {
      groups.push(currentGroup)
      currentGroup = { notes: [next], slideDurations: [] }
    }
  }
  groups.push(currentGroup)

  const newNotes = groups.flatMap(group => {
    if (group.notes.length === 1) {
      return [cloneAbletonNote(group.notes[0])]
    }
    return [buildSlideNoteFromSequence(group.notes, group.slideDurations, SMART_SMOOTH_FALLBACK_SLIDE)]
  })

  const duration = newNotes.reduce((maxEnd, note) => {
    const end = note.position + note.duration
    return Math.max(maxEnd, end)
  }, 0)

  return new AbletonClip(`${clip.name}-smooth`, duration, newNotes)
}

/**
 * Options for melody-to-polygon mapping in runLineWithDelay.
 * The wrapPlayNote callback is called right before each melody plays,
 * allowing for just-in-time polygon allocation and counter incrementing.
 */
export type MelodyMapOptions = {
  /**
   * Called right before a melody starts playing.
   * Should allocate a polygon and return a wrapped playNote that includes visual effects.
   * This is called once for the base melody and once for the delay melody (if not cancelled).
   */
  wrapPlayNote: (basePlayNote: PlayNoteFunc) => PlayNoteFunc
  /**
   * Called with a smoothed monophonic clip derived from delayRootClip.
   * Use this to drive MPE visuals/synth.
   */
  playSmoothedClip?: (clip: AbletonClip, ctx: TimeContext) => void
}

export const playClipSimple = async (
  clip: AbletonClip,
  ctx: TimeContext,
  voiceIndex: number,
  playNoteF: (pitch: number, velocity: number, ctx: TimeContext, duration: number, voiceIndex: number) => void
) => {
  const notes = clip.noteBuffer()
  ctx.branch(async ctx => {
    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta)
      playNoteF(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, voiceIndex)
      if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
    }
  })
}

// runLine function - executes livecoding lines (clean version without highlighting)
export const runLineClean = async (
  lineText: string,
  ctx: TimeContext,
  voiceIndex: number,
  sliders: number[],
  voices: PlaybackVoiceState[],
  onVoiceStart: () => void,
  onVoiceEnd: () => void,
  playNoteF: PlayNoteFunc,
  launchParamRampF: LaunchRampFunc
) => {
  onVoiceStart()

  const voice = voices[voiceIndex]

  try {
    const groups = splitTextToGroups(lineText)
    if (!groups.length) return

    const group = groups[0]
    const { clip } = buildClipFromLine(group.clipLine, sliders)
    console.log("logged clip", clip)
    if (!clip) return

    console.log("running line", lineText, clip.notes.map(n => [n.position, n.pitch]), playNoteF)

    const notes = clip.noteBuffer()
    const ramps = group.rampLines.map(parseRampLine).map(r =>
      launchParamRampF(r.paramName, r.startVal, r.endVal, clip.duration, voiceIndex, ctx)
    )

    if (notes.length === 0 && clip.duration > 0) {
      await ctx.wait(clip.duration)
    }

    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta)

      if (!voice.isPlaying) {
        ramps.forEach(r => r.cancel())
        break
      }

      playNoteF(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, voiceIndex)
      if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
    }

    if (voices[voiceIndex].isPlaying) {
      // Let ramps complete naturally
    } else {
      ramps.forEach(r => r.cancel())
    }

  } catch (error) {
    console.error('Error in runLine:', error)
  } finally {
    onVoiceEnd()
  }

  return voice.hotSwapCued
}

export const runLineWithDelay = (
  baseClipName: string,
  baseTransform: string,
  delayTransform: string,
  ctx: TimeContext,
  appState: PlaybackAppState,
  playNote: PlayNoteFunc,
  melodyMapOpts?: MelodyMapOptions
) => {
  const baseLine = baseClipName + ' : ' + baseTransform
  const delayRootClipName = baseClipName + '-delayRoot-' + crypto.randomUUID()
  const delayLine = delayRootClipName + ' : ' + delayTransform
  console.log('play lines', baseLine, delayLine)

  const groups = splitTextToGroups(baseLine)
  const { clip: delayRootClip } = buildClipFromLine(groups[0].clipLine, appState.sliders)
  clipMap.set(delayRootClipName, delayRootClip!)

  const dummyVoices = appState.voices.map((v): PlaybackVoiceState => ({...v, isPlaying: true}))
  const delayBeats = appState.sliders[DELAY_SLIDER]**2 * 8
  const smoothedClip = melodyMapOpts?.playSmoothedClip
    ? buildSmartSmoothClip(delayRootClip!, SMART_SMOOTH_CLOSE_THRESHOLD, SMART_SMOOTH_JOIN_PROBABILITY)
    : null

  const handle = ctx.branch(async ctx => {
    // Wrap playNote for base melody right before it plays
    // This is when polygon allocation should happen (increments left/right counter)
    const basePlayNote = melodyMapOpts?.wrapPlayNote(playNote) ?? playNote
    playClipSimple(delayRootClip!, ctx, 0, basePlayNote)

    if (melodyMapOpts?.playSmoothedClip && smoothedClip) {
      ctx.branch(async branchCtx => {
        await branchCtx.wait(delayBeats * 0.5)
        melodyMapOpts.playSmoothedClip?.(smoothedClip, branchCtx)
      }, 'mpe-smooth')
    }

    await ctx.wait(delayBeats)

    // Wrap playNote for delay melody right before it plays (only if we reach here, i.e., not cancelled)
    // This is when polygon allocation should happen for the delay melody
    const delayPlayNote = melodyMapOpts?.wrapPlayNote(playNote) ?? playNote
    runLineClean(delayLine, ctx, 1, appState.sliders, dummyVoices, () => { }, () => { }, delayPlayNote, (() => { }) as any)
  })

  return handle
}
