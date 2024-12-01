import { AbletonClip } from "@/io/abletonClips"
import { repeat } from "./pattern";
import { Scale } from "@/music/scale";

export const randomChoice = (a, b) => Math.random() > 0.5 ? a : b;

export const randomChoiceBy = (a: any, b: any, p: number) => Math.random() > p ? a : b;

const slapback = (pattern, length) => ([
  length * 1,
  repeat(pattern, 2)
  // .map(n => ({...n, duration: n.duration * 0.5})),
]);

const scale = new Scale([0,2,3,5,7,8,9,11], 81);

// livecoding

const motif1 = () => ([
  { pitch: 80, velocity: 100, duration: 1, position: 0 },
  { pitch: 81, velocity: 100, duration: 1, position: 1 },
  { pitch: 84, velocity: 100, duration: 1, position: 2 },
  { pitch: 83, velocity: 100, duration: 1, position: 3 },
  { pitch: 81, velocity: 100, duration: 1, position: 4 },
]);

// const motif1 = () => ([
//   { pitch: 80 - 24, velocity: 100, duration: 1, position: 0 },
//   { pitch: 81 - 24, velocity: 100, duration: 1, position: 1 },
//   { pitch: 83 - 24, velocity: 100, duration: 1, position: 2 },
//   { pitch: 84 - 24, velocity: 100, duration: 1, position: 3 },
// ]);

const altMotif1 = () => 
  scale
  .getMultiple(Array.from({ length: 5 }, () => Math.floor(Math.random() * 8)))
  .map((p, i) => ({ pitch: randomChoice(p, p - 12), duration: 1, position: i, velocity: 100 }));

const motif2 = () => ([
  { pitch: 33, velocity: 100, duration: 1, position: 0 },
  { pitch: 30, velocity: 100, duration: 1, position: 1 },
  { pitch: 29, velocity: 100, duration: 1, position: 2 },
  { pitch: 28, velocity: 100, duration: 1, position: 3 },
])

const motif3 = () => ([
  { pitch: 21, velocity: 100, duration: Math.random()*0.5, position: 0 },
  { pitch: randomChoice(24, 16), velocity: 100, duration: Math.random(), position: 2 }
])


const notes1 = (): Array<any> => {
  return randomChoice(
      [6, randomChoiceBy(motif1(), altMotif1(), 0.25)],
      slapback(randomChoiceBy(motif1(), altMotif1(), 0.25), 6) as [number, any]
  );
}

const notes2 = () => repeat(motif2(),8).map(n => ({...n, pitch: n.pitch + 12}));
const notes3 = () => motif3().map(n => ({...n, pitch: n.pitch + 12}));


const clip1 = () => new AbletonClip("clip1", ...notes1() as [number, any]).scale(1)
// const clip1 = () => new AbletonClip("clip1", 6, randomChoiceBy(motif1(), altMotif1(), 0.25));
const clip2 = () => new AbletonClip("clip2", 32, notes2()).scale(1)
const clip3 = () => new AbletonClip("clip3", 5, notes3()).scale(1)


const clipGetter1 = (noteLength: number, melodySpeed: number) => {
  const clip = clip1()
  clip.notes = clip.notes.map(n => ({...n, duration: n.duration * noteLength}))
  const clipScaled = clip.scale(clip.notes.length < 8 ? melodySpeed: melodySpeed * 0.5)
  // console.log('### SCALE', scale.getMultiple(Array.from({ length: 5 }, () => Math.floor(Math.random() * 8))));
  // console.log()
  return clipScaled
}
const clipGetter2 = (noteLength: number, melodySpeed: number) => {
  const clip = clip2();
  clip.notes = clip.notes.map(n => ({...n, duration: n.duration * noteLength}))
  const clipScaled = clip.scale(melodySpeed)
  return clipScaled
}
const clipGetter3 = (noteLength: number, melodySpeed: number) => {
  const clip = clip3();
  clip.notes = clip.notes.map(n => ({...n, duration: n.duration * noteLength}))
  const clipScaled = clip.scale(melodySpeed)
  return clipScaled
}
export const clipVersions = "b"
export const getTestClips = () => [clipGetter1, clipGetter2, clipGetter3]