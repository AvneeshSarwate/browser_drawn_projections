import type { TimeContext } from '@/channels/base_time_context'
import type { AbletonClip, AbletonNote, CurveValue } from '@/io/abletonClips'
import { curve2val } from '@/io/curveInterpolation'
import type { MPEDevice, MPENoteRef } from '@/io/mpe'

export type MPEPlaybackConfig = {
  pitchBendRange?: number
  curveStepMs?: number
  noteGap?: number
}

export type CurveType = 'pressure' | 'pitchBend' | 'timbre'

export type NotePlaybackResult = {
  cancel: () => void
  noteRef: MPENoteRef | null
}

export type ClipPlaybackOptions = {
  pitchBendRange?: number
  curveStepMs?: number
  noteGap?: number
  onNoteStart?: (note: AbletonNote, index: number) => AbletonNote | null
  waitForCompletion?: boolean
}

export type ClipPlaybackHandle = {
  cancel: () => void
  promise: Promise<void>
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeConfig(config?: MPEPlaybackConfig): Required<MPEPlaybackConfig> {
  return {
    pitchBendRange: config?.pitchBendRange ?? 48,
    curveStepMs: config?.curveStepMs ?? 10,
    noteGap: config?.noteGap ?? 0.975
  }
}

const ABLETON_PB_RANGE = 48

// Converts Ableton pitch curve values to MIDIVal pitch bend range (-1..1).
export function abletonBendToMidi(abletonValue: number, targetPbRange: number): number {
  if (!Number.isFinite(targetPbRange) || targetPbRange <= 0) return 0
  const scale = targetPbRange / ABLETON_PB_RANGE
  const delta = abletonValue * scale
  const normalized = delta / targetPbRange
  return clamp(normalized, -1, 1)
}

function curveInitialValue(curveVals: CurveValue[] | undefined, fallback = 0): number | undefined {
  if (!curveVals || curveVals.length === 0) return undefined
  return curve2val(0, curveVals) ?? fallback
}

function sendCurveValue(
  noteRef: MPENoteRef | null,
  curveType: CurveType,
  value: number,
  config: Required<MPEPlaybackConfig>
) {
  if (!noteRef) return
  if (curveType === 'pitchBend') {
    noteRef.pitchBend(abletonBendToMidi(value, config.pitchBendRange))
    return
  }
  const midiVal = Math.round(clamp(value, 0, 127))
  if (curveType === 'pressure') {
    noteRef.pressure(midiVal)
    return
  }
  noteRef.timbre(midiVal)
}

export function launchCurve(
  ctx: TimeContext,
  noteRef: MPENoteRef | null,
  curveVals: CurveValue[],
  duration: number,
  curveType: CurveType,
  config: MPEPlaybackConfig = {}
): { cancel: () => void } {
  if (!curveVals || curveVals.length === 0) {
    return { cancel: () => {} }
  }
  const resolved = normalizeConfig(config)
  const stepSec = resolved.curveStepMs / 1000
  const gap = resolved.noteGap
  const gappedVals = curveVals.map((cv) => ({ ...cv, timeOffset: cv.timeOffset * gap }))
  const durationBeats = duration * gap

  const task = ctx.branch(async (branchCtx) => {
    if (gappedVals.length === 1) {
      sendCurveValue(noteRef, curveType, gappedVals[0].value, resolved)
      return
    }

    while (true) {
      const elapsedBeats = branchCtx.progBeats
      if (elapsedBeats >= durationBeats) break
      const curveVal = curve2val(elapsedBeats, gappedVals)
      sendCurveValue(noteRef, curveType, curveVal, resolved)
      await branchCtx.waitSec(stepSec)
    }
  }, `curve-${curveType}`)

  return { cancel: task.cancel }
}

export async function playMPENote(
  ctx: TimeContext,
  note: AbletonNote,
  mpeDevice: MPEDevice,
  config: MPEPlaybackConfig = {}
): Promise<NotePlaybackResult> {
  const resolved = normalizeConfig(config)
  const initialPitch = curveInitialValue(note.pitchCurve)
  const initialPressure = curveInitialValue(note.pressureCurve)
  const initialTimbre = curveInitialValue(note.timbreCurve)

  const noteRef = mpeDevice.noteOn(
    note.pitch,
    note.velocity,
    initialPitch !== undefined ? abletonBendToMidi(initialPitch, resolved.pitchBendRange) : undefined,
    initialPressure !== undefined ? Math.round(clamp(initialPressure, 0, 127)) : undefined,
    initialTimbre !== undefined ? Math.round(clamp(initialTimbre, 0, 127)) : undefined
  )

  if (!noteRef) {
    return { cancel: () => {}, noteRef: null }
  }

  const curveTasks = [
    note.pressureCurve?.length
      ? launchCurve(ctx, noteRef, note.pressureCurve, note.duration, 'pressure', resolved)
      : null,
    note.pitchCurve?.length
      ? launchCurve(ctx, noteRef, note.pitchCurve, note.duration, 'pitchBend', resolved)
      : null,
    note.timbreCurve?.length
      ? launchCurve(ctx, noteRef, note.timbreCurve, note.duration, 'timbre', resolved)
      : null
  ].filter(Boolean) as { cancel: () => void }[]

  const noteOffTask = ctx.branch(async (branchCtx) => {
    await branchCtx.wait(note.duration * resolved.noteGap)
    noteRef.noteOff(note.offVelocity ?? note.velocity)
  }, 'note-off')

  return {
    noteRef,
    cancel: () => {
      noteOffTask.cancel()
      curveTasks.forEach((task) => task.cancel())
      noteRef.noteOff(note.offVelocity ?? note.velocity)
    }
  }
}

export function playMPEClip(
  clip: AbletonClip,
  ctx: TimeContext,
  mpeDevice: MPEDevice,
  options: ClipPlaybackOptions = {}
): ClipPlaybackHandle {
  const resolved = normalizeConfig(options)
  const noteHandles: NotePlaybackResult[] = []

  const mainTask = ctx.branchWait(async (branchCtx) => {
    const notes = clip.notes
      .filter((n) => n.isEnabled)
      .slice()
      .sort((a, b) => a.position - b.position)

    for (let i = 0; i < notes.length; i += 1) {
      let note = notes[i]
      if (options.onNoteStart) {
        const modified = options.onNoteStart(note, i)
        if (modified === null) continue
        note = modified
      }

      const currentBeats = branchCtx.progBeats
      const noteStart = note.position
      if (noteStart > currentBeats) {
        await branchCtx.wait(noteStart - currentBeats)
      }

      const handle = await playMPENote(branchCtx, note, mpeDevice, resolved)
      noteHandles.push(handle)
    }

    if (options.waitForCompletion !== false) {
      const remaining = clip.duration - branchCtx.progBeats
      if (remaining > 0) {
        await branchCtx.wait(remaining)
      }
    }
  }, 'mpe-clip')

  return {
    cancel: () => {
      mainTask.cancel()
      noteHandles.forEach((h) => h.cancel())
    },
    promise: mainTask
  }
}
