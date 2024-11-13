import { AbletonClip } from "@/io/abletonClips"

export const randomChoice = (a, b) => Math.random() > 0.5 ? a : b;

const notes = [
    { pitch: 60, velocity: 100, duration: 1, position: 0 },
    { pitch: 62, velocity: 100, duration: 1, position: 1 },
    { pitch: 64, velocity: 100, duration: 1, position: 2 },
    { pitch: 65, velocity: 100, duration: 1, position: 3 },
    { pitch: 67, velocity: 100, duration: 1, position: 4 },
    { pitch: 69, velocity: 100, duration: 1, position: 5 },
    { pitch: 71, velocity: 100, duration: 1, position: 6 },
  ]

const getNotes = () => notes;
  
const notes1 = getNotes().slice(0, 4)
const clip1 = new AbletonClip("clip1", 4, notes1)
const clipGetter1 = () => {
return clip1
}

const notes2 = getNotes().slice(0, 5).map(n => ({...n, pitch: n.pitch + 12}))
const clip2 = new AbletonClip("clip2", 5, notes2)
const clipGetter2 = () => {
return clip2
}

const notes3 = getNotes().slice(0, 6).map(n => ({...n, pitch: n.pitch - 12}))
const clip3 = new AbletonClip("clip3", 6, notes3)
const clipGetter3 = () => {
return clip3
}

export const getTestClips = () => [clipGetter1, clipGetter2, clipGetter3]