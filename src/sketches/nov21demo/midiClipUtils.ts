import { AbletonClip } from "@/io/abletonClips"
import { repeat } from "./pattern";

export const randomChoice = (a, b) => Math.random() > 0.5 ? a : b;

const motif1 = () => ([
  { pitch: 80, velocity: 100, duration: 1, position: 0 },
  { pitch: 81, velocity: 100, duration: 1, position: 1 },
  { pitch: 84, velocity: 100, duration: 1, position: 2 },
  { pitch: 83, velocity: 100, duration: 1, position: 3 },
  { pitch: 81, velocity: 100, duration: 1, position: 4 },
])

const motif2 = () => ([
  { pitch: 33, velocity: 100, duration: 1, position: 0 },
  { pitch: 30, velocity: 100, duration: 1, position: 1 },
  { pitch: 29, velocity: 100, duration: 1, position: 2 },
  { pitch: 28, velocity: 100, duration: 1, position: 3 },
])

const motif3 = () => ([
  { pitch: 33, velocity: 100, duration: Math.random()*0.5, position: 0 },
  { pitch: randomChoice(36, 28), velocity: 100, duration: Math.random(), position: 2 }
])


const notes1 = () => motif1();
const notes2 = () => repeat(motif2(),8);
const notes3 = () => motif3();

const clip1 = () => new AbletonClip("clip1", 6, notes1()).scale(1)
const clip2 = () => new AbletonClip("clip2", 32, notes2()).scale(1)
const clip3 = () => new AbletonClip("clip3", 5, notes3()).scale(1)


const clipGetter1 = (noteLength: number, melodySpeed: number) => {
  const clip = clip1()
  clip.notes = clip.notes.map(n => ({...n, duration: n.duration * noteLength}))
  const clipScaled = clip.scale(melodySpeed)
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