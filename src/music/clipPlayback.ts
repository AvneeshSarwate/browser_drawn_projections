import { launch } from "@/channels/channels";

//needed because Tone Instrument type is not public 
export type Instrument = {
  triggerAttackRelease: (pitch: number, duration: number, time?: number, velocity?: number) => void;
  triggerAttack: (pitch: number, time?: number, velocity?: number) => void;
  triggerRelease: (pitch: number, time?: number) => void;
}

export function m2f(midi: number) {
  return Math.pow(2, (midi - 69) / 12) * 440;
}

export function note( synth: Instrument, pitch: number, duration: number, velocity: number = 60) {
  synth.triggerAttackRelease(m2f(pitch), duration, undefined, velocity);
}

export type Clip = {
  position: number;
  pitch: number;
  duration: number;
  velocity: number;
}[]

export function clipToDeltas(clip: Clip, totalTime?: number) {
  const interNoteTimeDeltas: number[] = [];
  clip.forEach((note, i) => {
    const delta = i === 0 ? note.position : note.position - clip[i - 1].position
    interNoteTimeDeltas.push(delta);
  });
  if (totalTime) { 
    const lastNote = clip[clip.length - 1];
    const lastNoteDelta = totalTime - lastNote.position;
    interNoteTimeDeltas.push(lastNoteDelta);
  }
  return interNoteTimeDeltas;
}

export function positionsToDeltas(positions: number[], totalTime?: number) {
  const deltas: number[] = [];
  positions.forEach((pos, i) => {
    const delta = i === 0 ? pos : pos - positions[i - 1]
    deltas.push(delta);
  });
  if (totalTime) { 
    const lastPos = positions[positions.length - 1];
    const lastDelta = totalTime - lastPos;
    deltas.push(lastDelta);
  }
  return deltas;
}

export const listToClip = (pitches: number[], stepTime: number = 0.5, dur: number = 0.5, vel: number = 0.5): Clip => {
  return pitches.map((v, i) => {
    return {
      pitch: v,
      velocity: vel,
      duration: dur,
      position: i * stepTime,
    }
  })
}

export function playClip(clip: Clip, synth: Instrument) {
  const deltas = clipToDeltas(clip);
  launch(async ctx => {
    clip.forEach((note, i) => {
      ctx.waitSec(deltas[i]);
      synth.triggerAttackRelease(note.pitch, note.duration, undefined, note.velocity);
    });
  })
}