import { biasedTri, type BrowserTimeContext } from '@/channels/channels'
import type { Dancer } from './dancerInitializer'
import type { MPEPolySynth, MPEVoiceGraph } from '@/music/mpeSynth'
import { AbletonClip, type AbletonNote } from '@/io/abletonClips'
import { Scale } from '@/music/scale'

const pulseChord = <T extends MPEVoiceGraph>(
  initialChord: number[],
  synth: MPEPolySynth<T>,
  duration: number,
  ctx: BrowserTimeContext
) => {
  const scale = new Scale(null, 48)
  const degrees = initialChord.map(degree => scale.getIndFromPitch(degree))
  const inversionDegrees = degrees.map(i => i)
  inversionDegrees[0] += 7
  if(Math.random() < 0.2) inversionDegrees[1] += 7
  const inversion = scale.getMultiple(inversionDegrees)
  const chord = Math.random() < 0.2 ? inversion : initialChord
  ctx.branch(async (ctx) => {
    const voices: MPEVoiceGraph[] = []
    for (let i = 0; i < chord.length; i++) {
      voices.push(synth.noteOn(chord[i], 70 + Math.random() * 30, 0, 0))
    }
    await ctx.wait(duration)
    for (let i = 0; i < chord.length; i++) {
      synth.noteOff(voices[i])
    }
  })
}

/**
 * parameters to vary
 * - velocity - add brigtness pulse to the dancers texture?
 * - duration - length of brightness pulse
 */

export const notePulse = <T extends MPEVoiceGraph>(
  dancersAndChords: {
    dcMap: { dancer: Dancer; chord: number[] }[]
    activeChord: number
    speed: number
    stop: boolean
  },
  synth: MPEPolySynth<T>,
  ctx: BrowserTimeContext
) => {
  let frame = 0
  ctx.branch(async (ctx) => {
    while (!dancersAndChords.stop) {
      dancersAndChords.dcMap.forEach((dc, index) => {
        if (index === dancersAndChords.activeChord) {
          dc.dancer.quadVisible(true)
          dc.dancer.lineVisible(false)
          dc.dancer.setFrame(frame)
        } else {
          dc.dancer.quadVisible(false)
          dc.dancer.lineVisible(true)
          if(frame % 4 == 0) dc.dancer.setFrame(Math.floor(frame/4))
        }
      })
      frame++
      const chord = dancersAndChords.dcMap[dancersAndChords.activeChord].chord
      pulseChord(chord, synth, dancersAndChords.speed * 0.05, ctx)
      await ctx.wait(dancersAndChords.speed)
    }
  })
}

const playNote = <T extends MPEVoiceGraph>(
  ctx: BrowserTimeContext,
  noteData: AbletonNote,
  inst: MPEPolySynth<T>
) => {
  const { pitch, velocity, duration: noteDur } = noteData
  if (!isFinite(pitch)) {
    // debugger
    console.warn("bad pitch",noteData)
    return
  }
  const voice = inst.noteOn(pitch, velocity, 0, 0)
  ctx.branch(async (ctx) => {
    await ctx.wait((noteDur ?? 0.1) * 0.98)
    inst.noteOff(voice)
  })
}

const arrayRandChoice = <T>(arr: T[]) => {
  return arr[Math.floor(Math.random() * arr.length)]
}

const weightedRandomChoice = <T>(choices: { item: T; weight: number }[]) => {
  const totalWeight = choices.reduce((acc, w) => acc + w.weight, 0)
  const rand = Math.random() * totalWeight
  let cumulativeWeight = 0
  for (const { item, weight } of choices) {
    cumulativeWeight += weight
    if (rand <= cumulativeWeight) {
      return item
    }
  }
  return choices[choices.length - 1].item // Fallback in case of rounding errors
}

const dancePhrase = async <T extends MPEVoiceGraph>(
  dancer: Dancer,
  clip: AbletonClip,
  synth: MPEPolySynth<T>,
  ctx: BrowserTimeContext
) => {
  const startColors = {
    color1: dancer.params.color1.clone(),
    color2: dancer.params.color2.clone(),
    color3: dancer.params.color3.clone(),
    color4: dancer.params.color4.clone(),
    color5: dancer.params.color5.clone(),
    color6: dancer.params.color6.clone()
  }
  const colorKeys = Object.keys(startColors)

  for (const [i, note] of clip.noteBuffer().entries()) {
    await ctx.wait(note.preDelta)
    playNote(ctx, note.note, synth)

    ctx.branch(async (ctx) => {
      const duration = note.note.duration
      const startBeat = ctx.beats
      const colorKey = arrayRandChoice(colorKeys)
      while (ctx.beats - startBeat < duration) {
        const rampVal = 0.5 + 0.5 * biasedTri((ctx.beats - startBeat) / duration, 0.25)
        const newColor = startColors[colorKey].clone().multiplyScalar(rampVal)
        dancer.dancerShapeUniforms[colorKey].value = newColor
        await ctx.waitSec(0.016)
      }
    })

    await ctx.wait(note.postDelta ?? 0)
  }
}


const waitChoices = [
  {item: 0, weight: 3},
  {item: 2, weight: 2},
  {item: 3, weight: 1},
  {item: 4, weight: 1},
  {item: 5, weight: 1},
  {item: 6, weight: 1},
]
export const randomPhraseDancer = async <T extends MPEVoiceGraph>(
  dancer: Dancer,
  synth: MPEPolySynth<T>,
  params: { noWaitProb: {val: number}; baseSpeed: {val: number}; root5Prob: {val: number} },
  ctx: BrowserTimeContext
) => {
  const generator = new MelodyGenerator(() => params.root5Prob.val)
  let lastSpeed = 1
  while (true) {
    const clip = generator.generateMelody()
    const sameSpeedProb = 0.5
    const newSpeed = ((1-params.baseSpeed.val)*0.8 + (Math.random()**2) *0.2) ** 2 * 2 + 0.25
    lastSpeed = Math.random() < sameSpeedProb ? lastSpeed : newSpeed
    const scaledClip = clip.scale(lastSpeed)
    ctx.branch(async (ctx) => {
      await dancePhrase(dancer, scaledClip, synth, ctx)
    })
    await ctx.wait(scaledClip.duration)
    waitChoices[0].weight = params.noWaitProb.val**2 * 30
    await ctx.wait(weightedRandomChoice(waitChoices) * 0.25)
  }
}

/*
music algorithm
pick root note - either same as last, or move some random amount
pick melodic contour - either same as last, 1 note diff, new (only if cache not full), or from cache
  melodic contour is deltas from root note - 2-6 notes, all same duration
  when fully new melodic contour is made, cache it if cache size < 5
wait 2-6 8th notes before playing next phrase (or with some small prob, no extra wait)

//parmeters for control
- probability of no gap between phrases
- root note (+/- 1 degree)
- base speed
- repeat exact last phrase (binary)
*/

function evenRandomWalk(state: number, lowBound: number, highBound: number) {
  //step up/down 3, 2, 1 steps with equal probability
  const choices = [-3, -2, -1, 1, 2, 3]
  //filter choices to be within bounds
  const filteredChoices = choices.filter(
    (choice) => state + choice >= lowBound && state + choice <= highBound
  )
  //choose one at random
  const choice = arrayRandChoice(filteredChoices)
  const retVal = state + choice
  if (!isFinite(retVal)) {
    // debugger
    console.warn("bad even random walk", state, lowBound, highBound, choice, retVal)
    return state
  }
  return retVal
}

function melodyRandomWalk(state: number, lowBound: number, highBound: number) {
  const choices = [-3, -2, -1, -1, 0, 1, 1, 2, 3]
  //filter choices to be within bounds
  const filteredChoices = choices.filter(
    (choice) => state + choice >= lowBound && state + choice <= highBound
  )
  //choose one at random
  const choice = arrayRandChoice(filteredChoices)
  const retVal = state + choice
  if (!isFinite(retVal)) {
    // debugger
    console.warn("bad melody random walk", state, lowBound, highBound, choice, retVal)
    return state
  }
  return retVal
}

const findRoot5 = (degree: number) => {
  //input degree is an integer, and scale degrees are 0 being the root, 7 being octave up, -7 being octave down, 4 being 5th up, -4 being 5th down
  //output is the closest root or 5th
  if(degree == 0) return 0;
  const absDegree = Math.abs(degree)
  const sign = Math.sign(degree)
  const closestRoot = sign * Math.round(absDegree / 7) * 7
  const closest5th = sign * Math.round(absDegree / 5) * 5
  return Math.abs(closestRoot - degree) < Math.abs(closest5th - degree) ? closestRoot : closest5th
}

class MelodyGenerator {
  cache: number[][] = [
    [1, 0, 2, 1, 3, 2],
    [4, 2, 0],
    [0, 1, 2, 3, 4],
    [2, 2, 2, 0]
  ]
  lastRoot: number = 0 //a scale degree delta relative to scale root
  lastMelodicContour: number[] = [] //a list of scale degree deltas from root
  scale = new Scale()
  sameRootProb = 0.5
  root5Prob: () => number


  constructor(root5Prob: () => number) {
    this.root5Prob = root5Prob
  }

  selectRoot() {
    const sameRoot = Math.random() < this.sameRootProb
    if (sameRoot) {
      return this.lastRoot
    } else {
      return evenRandomWalk(this.lastRoot, -7, 7)
    }
  }

  generateMelodicContour() {
    const contour = []
    const numNotes = Math.floor(Math.random() * 4) + 2
    let note = 0
    for (let i = 0; i < numNotes; i++) {
      contour.push(note)
      note = melodyRandomWalk(note, -5, 5)
    }
    return contour
  }

  generateMelody() {
    this.lastRoot = this.selectRoot()

    const melodyChoices = ['same', 'oneNoteDiff', 'new', 'fromCache']
    if (this.cache.length === 0) {
      melodyChoices.splice(melodyChoices.indexOf('fromCache'), 1)
    }
    if (this.cache.length === 5) {
      melodyChoices.splice(melodyChoices.indexOf('new'), 1)
    }
    const melodyChoice = arrayRandChoice(melodyChoices)

    let contour: number[] = []
    if (melodyChoice === 'same') {
      contour = this.lastMelodicContour
    } else if (melodyChoice === 'oneNoteDiff') {
      contour = this.lastMelodicContour.map((note) => note)
      contour[Math.floor(Math.random() * contour.length)] = arrayRandChoice([
        -3, -2, -1, 0, 1, 2, 3
      ])
    } else if (melodyChoice === 'new') {
      contour = this.generateMelodicContour()
      this.cache.push(contour)
    } else if (melodyChoice === 'fromCache') {
      contour = arrayRandChoice(this.cache)
    }

    if (Math.random() < this.root5Prob()) {
      contour[0] = findRoot5(contour[0])
      contour[contour.length - 1] = findRoot5(contour[contour.length - 1])
    }

    this.lastMelodicContour = contour

    const finalContour = contour.map((note) => this.lastRoot + note)
    const melody = this.scale.getMultiple(finalContour)
    const notes = melody.map((pitch, i) => {
      return { pitch, velocity: 100, position: i * 0.5, duration: 0.5 }
    })

    return new AbletonClip(`melody_${this.lastRoot}`, notes.length * 0.5, notes)
  }
}
