import { AbletonClip } from "@/io/abletonClips"

export const randomChoice = (a, b) => Math.random() > 0.5 ? a : b;

const notes = () => [
    { pitch: 60, velocity: 100, duration: 1, position: 0 },
    { pitch: 62, velocity: 100, duration: 1, position: 1 },
    { pitch: 64, velocity: 100, duration: 1, position: 2 },
    { pitch: 65, velocity: 100, duration: 1, position: 3 },
    { pitch: 67, velocity: 100, duration: 1, position: 4 },
    { pitch: randomChoice(69, 65), velocity: 100, duration: 1, position: 5 },
    { pitch: 71, velocity: 100, duration: 1, position: 6 },
  ]

const dotted = (notes, mod) => notes.map((n, i) => ({...n, duration: i % mod ? 0.2 : n.duration}))

const getNotes = () => dotted(notes(), 3);
  
const notes1 = () => getNotes().slice(0, 4)
const notes2 = () => getNotes().slice(0, 5).map(n => ({...n, pitch: n.pitch + 12}))
const notes3 = () => getNotes().slice(0, 6).map(n => ({...n, pitch: n.pitch - 12}))

const clip1 = () => {
  console.log("clip1-b")
  return new AbletonClip("clip1", 4, notes1()).scale(1)
}
const clip2 = () => new AbletonClip("clip2", 5, notes2()).scale(1)
const clip3 = () => new AbletonClip("clip3", 6, notes3()).scale(1)


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

export const getTestClips = () => [clipGetter1, clipGetter2, clipGetter3]