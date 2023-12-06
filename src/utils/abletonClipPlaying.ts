import { type TimeContext } from '@/channels/channels';
import { type AbletonClip, type AbletonNote } from '@/io/abletonClips';
import { midiOutputs } from '@/io/midi';
import  { positionsToDeltas } from '@/music/clipPlayback';

export async function playAbletonClip(clip: AbletonClip, ctx: TimeContext, play: (note: AbletonNote, ctx: TimeContext) => Promise<void>) {
  const deltas = positionsToDeltas(clip.notes.map(note => note.position), clip.duration);
  const notes = clip.notes
  for(let i = 0, note = notes[0] ; i < clip.notes.length; i++, note = notes[i]) {
    await ctx.wait(deltas[i]);
    play(note, ctx);
  };
  await ctx.wait(deltas[deltas.length - 1])
}

export function makeMidiPlayFunc(midiOutputName: string) {
  const midiOutput = midiOutputs.get(midiOutputName)!!
  return async (note: AbletonNote, ctx: TimeContext) => {
    ctx.branch(async ctx => {
      midiOutput.sendNoteOn(note.pitch, note.velocity)
      await ctx.wait(note.duration * 0.95)
      midiOutput.sendNoteOff(note.pitch)
    })
  }
}