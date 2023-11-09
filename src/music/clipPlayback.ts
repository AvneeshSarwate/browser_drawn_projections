import { launch } from "@/channels/channels";

//needed because Tone Instrument type is not public 
type Instrument = {
  triggerAttackRelease: (pitch: number, duration: number, time?: number, velocity?: number) => void;
}

export function note( synth: Instrument, pitch: number, duration: number, velocity: number = 60) {
  synth.triggerAttackRelease(pitch, duration, undefined, velocity);
}

export type Clip = {
  time: number;
  pitch: number;
  duration: number;
  velocity: number;
}[]

export function clipToDeltas(clip: Clip) {
  const interNoteTimeDeltas: number[] = [];
  clip.forEach((note, i) => {
    const delta = i === 0 ? note.time : note.time - clip[i - 1].time
    interNoteTimeDeltas.push(delta);
  });
  return interNoteTimeDeltas;
}

export const listToClip = (pitches: number[], stepTime: number = 0.5, dur: number = 0.5, vel: number = 0.5): Clip => {
  return pitches.map((v, i) => {
    return {
      pitch: v,
      velocity: vel,
      duration: dur,
      time: i * stepTime,
    }
  })
}

export function playClip(clip: Clip, synth: Instrument) {
  const deltas = clipToDeltas(clip);
  launch(async ctx => {
    clip.forEach((note, i) => {
      ctx.wait(deltas[i]);
      synth.triggerAttackRelease(note.pitch, note.duration, undefined, note.velocity);
    });
  })
 
}