import type { TimeContext } from "@/channels/base_time_context";
import type { AbletonNote } from "@/io/abletonClips";
import type { MIDIValOutput } from "@midival/core";

export const playNote = (ctx: TimeContext, noteData: AbletonNote, channel: number, inst: MIDIValOutput) => {
    const {pitch, velocity, duration: noteDur} = noteData;
    const chan = channel + 1
    inst.sendNoteOn(pitch, velocity, chan)
    let noteIsOn = true
    ctx.branch(async ctx => {
      await ctx.wait((noteDur ?? 0.1) * 0.98)
      inst.sendNoteOff(pitch, chan)
      noteIsOn = false
    }).finally(() => {
      inst.sendNoteOff(pitch, chan)
    })
  }