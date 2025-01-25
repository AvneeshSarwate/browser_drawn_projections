import type { BrowserTimeContext } from "@/channels/channels";
import type { Dancer } from "./dancerInitializer";
import type { MPEPolySynth, MPEVoiceGraph } from "@/music/mpeSynth";
import type { AbletonClip, AbletonNote } from "@/io/abletonClips";


const pulseChord = <T extends MPEVoiceGraph>(chord: number[], synth: MPEPolySynth<T>, duration: number, ctx: BrowserTimeContext) => {
  ctx.branch(async ctx => {
    const voices: MPEVoiceGraph[] = []
    for(let i = 0; i < chord.length; i++) {
      voices.push(synth.noteOn(chord[i], 100, 0, 0))
    }
    await ctx.wait(duration)
    for(let i = 0; i < chord.length; i++) {
      synth.noteOff(voices[i])
    }
  })
}

/**
 * parameters to vary 
 * - velocity - add brigtness pulse to the dancers texture?
 * - duration - length of brightness pulse
 */

export const notePulse = <T extends MPEVoiceGraph>(dancersAndChords: {dcMap: {dancer: Dancer, chord: number[]}[], activeChord: number, speed: number, stop: boolean}, synth: MPEPolySynth<T>, ctx: BrowserTimeContext) => {
  let frame = 0
  ctx.branch(async ctx => {
    while(!dancersAndChords.stop) {
      dancersAndChords.dcMap.forEach((dc, index) => {
        if(index === dancersAndChords.activeChord) {
          dc.dancer.quadVisible(true)
          dc.dancer.setFrame(frame)
        } else {
          dc.dancer.quadVisible(false)
        }
      })
      frame++
      const chord = dancersAndChords.dcMap[dancersAndChords.activeChord].chord
      pulseChord(chord, synth, dancersAndChords.speed * 0.05, ctx)
      await ctx.wait(dancersAndChords.speed)
    }
  })
}

const playNote = <T extends MPEVoiceGraph>(ctx: BrowserTimeContext, noteData: AbletonNote, inst: MPEPolySynth<T>) => {
  const {pitch, velocity, duration: noteDur} = noteData;
  const voice = inst.noteOn(pitch, velocity, 0, 0)
  ctx.branch(async ctx => {
    await ctx.wait((noteDur ?? 0.1) * 0.98)
    inst.noteOff(voice)
  })
}

const dancePhrase = <T extends MPEVoiceGraph>(dancer: Dancer, clip: AbletonClip, synth: MPEPolySynth<T>, ctx: BrowserTimeContext) => {
  const phraseDuration = clip.duration
  ctx.branch(async ctx => {
    for (const [i, note] of clip.noteBuffer().entries()) {
      await ctx.wait(note.preDelta)
      playNote(ctx, note.note, synth)
      await ctx.wait(note.postDelta ?? 0)
    }
  })
  ctx.branch(async ctx => {
    const startTime = ctx.time
    while(ctx.time - startTime < phraseDuration) {
      const frame = Math.floor((ctx.time - startTime) / phraseDuration * dancer.params.frameCount)
      dancer.setFrame(frame)
      await ctx.waitSec(0.016)
    }
  })
}