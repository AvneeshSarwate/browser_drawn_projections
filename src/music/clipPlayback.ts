import { launch } from "@/channels/channels";
import type { Synth } from "tone";


function note(pitch: number, duration: number, synth: Synth) {
  synth.triggerAttackRelease(pitch, duration);
}

type clip = {
  time: number;
  pitch: number;
  duration: number;
  velocity: number;
}[]

function clipToInterNoteTimeDeltas(clip: clip) {
  const interNoteTimeDeltas: number[] = [];
  clip.forEach((note, i) => {
    const delta = i === 0 ? note.time : note.time - clip[i - 1].time
    interNoteTimeDeltas.push(delta);
  });
  return interNoteTimeDeltas;
}


export function playClip(clip: clip, synth: Synth) {
  const deltas = clipToInterNoteTimeDeltas(clip);
  launch(async ctx => {
    clip.forEach((note, i) => {
      ctx.wait(deltas[i]);
      synth.triggerAttackRelease(note.pitch, note.duration, undefined, note.velocity);
    });
  })
 
}