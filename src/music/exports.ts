import { clipToDeltas, listToClip, note, playClip } from "./clipPlayback"
import { PianoRoll } from "./pianoRoll"
import { Scale } from "./scale"
import { sampler } from "./synths"


export const musicExports = {
  note,
  clipToDeltas,
  listToClip,
  playClip,
  PianoRoll,
  Scale,
  sampler
}

export const musicExportString = `const { ${Object.keys(musicExports).join(', ')} } = musicExports;`