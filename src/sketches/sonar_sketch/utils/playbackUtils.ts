import type { TimeContext } from '@/channels/offline_time_context'
import type { LoopHandle } from '@/channels/base_time_context'
import type { AbletonClip } from '@/io/abletonClips'
import { clipMap } from '@/io/abletonClips'
import { splitTextToGroups, buildClipFromLine, parseRampLine } from './transformHelpers'
import type { VoiceState, SonarAppState } from '../appState'

// Type definitions for playback functions
export type PlayNoteFunc = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, instInd: number) => void
export type LaunchRampFunc = (paramName: string, startVal: number, endVal: number, duration: number, voiceIdx: number, ctx: TimeContext) => LoopHandle

export const DELAY_SLIDER = 16

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
  voices: VoiceState[],
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
  appState: SonarAppState,
  playNote: PlayNoteFunc
) => {
  const baseLine = baseClipName + ' : ' + baseTransform
  const delayRootClipName = baseClipName + '-delayRoot-' + crypto.randomUUID()
  const delayLine = delayRootClipName + ' : ' + delayTransform
  console.log('play lines', baseLine, delayLine)

  const groups = splitTextToGroups(baseLine)
  const { clip: delayRootClip } = buildClipFromLine(groups[0].clipLine, appState.sliders)
  clipMap.set(delayRootClipName, delayRootClip!)

  const dummyVoices = appState.voices.map(v => ({...v, isPlaying: true}))

  const handle = ctx.branch(async ctx => {
    playClipSimple(delayRootClip!, ctx, 0, playNote)

    await ctx.wait(appState.sliders[DELAY_SLIDER]**2 * 8)

    runLineClean(delayLine, ctx, 1, appState.sliders, dummyVoices, () => { }, () => { }, playNote, (() => { }) as any)
  })

  return handle
}
