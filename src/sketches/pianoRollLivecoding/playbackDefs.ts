export const playbackDefs = `
type Instrument = {
  triggerAttackRelease: (pitch: number, duration: number, time?: number, velocity?: number) => void;
};
declare function note(synth: Instrument, pitch: number, duration: number, velocity?: number): void;
type Clip = {
  time: number;
  pitch: number;
  duration: number;
  velocity: number;
}[];
declare function clipToDeltas(clip: Clip, totalTime?: number): number[];
declare const listToClip: (pitches: number[], stepTime?: number, dur?: number, vel?: number) => Clip;
declare function playClip(clip: Clip, synth: Instrument): void;
`