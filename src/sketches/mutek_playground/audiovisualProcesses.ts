import { biasedTri, type BrowserTimeContext } from "@/channels/channels";
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


const arrayRandChoice = <T>(arr: T[]) => {
  return arr[Math.floor(Math.random() * arr.length)]
}

const dancePhrase = <T extends MPEVoiceGraph>(dancer: Dancer, clip: AbletonClip, synth: MPEPolySynth<T>, ctx: BrowserTimeContext) => {
  const phraseDuration = clip.duration
  const startColors = {
    color1: dancer.dancerShapeUniforms.color1.value.clone(),
    color2: dancer.dancerShapeUniforms.color2.value.clone(),
    color3: dancer.dancerShapeUniforms.color3.value.clone(),
    color4: dancer.dancerShapeUniforms.color4.value.clone(),
    color5: dancer.dancerShapeUniforms.color5.value.clone(),
    color6: dancer.dancerShapeUniforms.color6.value.clone(),
  }
  const colorKeys = Object.keys(startColors)
  ctx.branch(async ctx => {
    for (const [i, note] of clip.noteBuffer().entries()) {
      await ctx.wait(note.preDelta)
      playNote(ctx, note.note, synth)

      ctx.branch(async ctx => {
        const duration = 0.3
        const startTime = ctx.time
        while(ctx.time - startTime < duration) {
          const rampVal = biasedTri((ctx.time - startTime) / duration, 0.25)
          const colorKey = arrayRandChoice(colorKeys)
          const newColor = startColors[colorKey].clone().multiplyScalar(rampVal)
          dancer.dancerShapeUniforms[colorKey].value = newColor
          await ctx.waitSec(0.016)
        }
      })

      await ctx.wait(note.postDelta ?? 0)
    }
  })
}

/*
music algorithm
pick root note - either same as last, or move some random amount
pick melodic contour - either same as last, 1 note diff, new (only if cache not full), or from cache
  melodic contour is deltas from root note - 2-6 notes, all same duration
  when fully new melodic contour is made, cache it if cache size < 5
wait 2-6 8th notes before playing next phrase (or with some small prob, no extra wait)
*/