import * as Tone from 'tone'



export const sampler = new Tone.Sampler({
  "A0": "A0.[mp3|ogg]",
  "C1": "C1.[mp3|ogg]",
  "D#1": "Ds1.[mp3|ogg]",
  "F#1": "Fs1.[mp3|ogg]",
  "A1": "A1.[mp3|ogg]",
  "C2": "C2.[mp3|ogg]",
  "D#2": "Ds2.[mp3|ogg]",
  "F#2": "Fs2.[mp3|ogg]",
  "A2": "A2.[mp3|ogg]",
  "C3": "C3.[mp3|ogg]",
  "D#3": "Ds3.[mp3|ogg]",
  "F#3": "Fs3.[mp3|ogg]",
  "A3": "A3.[mp3|ogg]",
  "C4": "C4.[mp3|ogg]",
  "D#4": "Ds4.[mp3|ogg]",
  "F#4": "Fs4.[mp3|ogg]",
  "A4": "A4.[mp3|ogg]",
  "C5": "C5.[mp3|ogg]",
  "D#5": "Ds5.[mp3|ogg]",
  "F#5": "Fs5.[mp3|ogg]",
  "A5": "A5.[mp3|ogg]",
  "C6": "C6.[mp3|ogg]",
  "D#6": "Ds6.[mp3|ogg]",
  "F#6": "Fs6.[mp3|ogg]",
  "A6": "A6.[mp3|ogg]",
  "C7": "C7.[mp3|ogg]",
  "D#7": "Ds7.[mp3|ogg]",
  "F#7": "Fs7.[mp3|ogg]",
  "A7": "A7.[mp3|ogg]",
  "C8": "C8.[mp3|ogg]"
}, {
  "release": 1,
  "baseUrl": "salamander/"
}).toDestination();

export function getPiano(connectToDestination: boolean = true) {
  const piano = new Tone.Sampler({
    "A0": "A0.[mp3|ogg]",
    "C1": "C1.[mp3|ogg]",
    "D#1": "Ds1.[mp3|ogg]",
    "F#1": "Fs1.[mp3|ogg]",
    "A1": "A1.[mp3|ogg]",
    "C2": "C2.[mp3|ogg]",
    "D#2": "Ds2.[mp3|ogg]",
    "F#2": "Fs2.[mp3|ogg]",
    "A2": "A2.[mp3|ogg]",
    "C3": "C3.[mp3|ogg]",
    "D#3": "Ds3.[mp3|ogg]",
    "F#3": "Fs3.[mp3|ogg]",
    "A3": "A3.[mp3|ogg]",
    "C4": "C4.[mp3|ogg]",
    "D#4": "Ds4.[mp3|ogg]",
    "F#4": "Fs4.[mp3|ogg]",
    "A4": "A4.[mp3|ogg]",
    "C5": "C5.[mp3|ogg]",
    "D#5": "Ds5.[mp3|ogg]",
    "F#5": "Fs5.[mp3|ogg]",
    "A5": "A5.[mp3|ogg]",
    "C6": "C6.[mp3|ogg]",
    "D#6": "Ds6.[mp3|ogg]",
    "F#6": "Fs6.[mp3|ogg]",
    "A6": "A6.[mp3|ogg]",
    "C7": "C7.[mp3|ogg]",
    "D#7": "Ds7.[mp3|ogg]",
    "F#7": "Fs7.[mp3|ogg]",
    "A7": "A7.[mp3|ogg]",
    "C8": "C8.[mp3|ogg]"
  }, {
    "release": 1,
    "baseUrl": "salamander/"
  })

  if (connectToDestination) {
    piano.connect(Tone.getDestination())
  }

  return piano
}

// Separate scaling functions that can be reused for both setting and display
export const paramScaling = {
  distortion: (val: number) => val,
  chorusWet: (val: number) => val,
  chorusDepth: (val: number) => val,
  chorusRate: (val: number) => 2 + val ** 2 * 20,
  filterFreq: (val: number) => 20000 * val ** 2,
  filterRes: (val: number) => val ** 100,
  delayTime: (val: number) => val ** 2,
  delayFeedback: (val: number) => val,
  delayMix: (val: number) => val,
  reverb: (val: number) => val
}

export function getPianoChain() {
  const piano = getPiano(false)
  const distortion = new Tone.Distortion(0.1)
  const chorus = new Tone.Chorus(2, 2, 0.3)
  const filter = new Tone.Filter(20000, 'lowpass')
  const delay = new Tone.FeedbackDelay(0.5, 0.1)
  const delayCrossfader = new Tone.CrossFade(0)
  const reverb = new Tone.Freeverb()

  chorus.spread = 90
  chorus.frequency.value = 2
  chorus.feedback.value = 0.8

  piano.connect(distortion)
  distortion.connect(chorus)
  chorus.connect(filter)
  filter.connect(delayCrossfader.a)
  filter.connect(delay)
  delay.connect(delayCrossfader.b)
  delayCrossfader.connect(reverb)
  reverb.connect(Tone.getDestination())

  // Use the scaling functions in paramFuncs to ensure consistency
  const paramFuncs = {
    distortion: (val: number) => distortion.distortion = paramScaling.distortion(val),
    chorusWet: (val: number) => chorus.wet.value = paramScaling.chorusWet(val),
    chorusDepth: (val: number) => chorus.depth = paramScaling.chorusDepth(val),
    chorusRate: (val: number) => chorus.delayTime = paramScaling.chorusRate(val),
    filterFreq: (val: number) => filter.frequency.value = paramScaling.filterFreq(val),
    filterRes: (val: number) => filter.Q.value = paramScaling.filterRes(val),
    delayTime: (val: number) => delay.delayTime.rampTo(paramScaling.delayTime(val), 0.01),
    delayFeedback: (val: number) => delay.feedback.value = paramScaling.delayFeedback(val),
    delayMix: (val: number) => delayCrossfader.fade.value = paramScaling.delayMix(val),
    reverb: (val: number) => reverb.wet.value = paramScaling.reverb(val)
  }
  
  return {
    piano,
    distortion,
    chorus,
    filter,
    delay,
    reverb,
    paramFuncs,
    paramNames: Object.keys(paramFuncs)
  }
}




export function getSynthChain() {
  const synth = new Tone.PolySynth(Tone.Synth)
  synth.set({
    oscillator: {
      type: 'fatsawtooth'
    }
  })
  const distortion = new Tone.Distortion(0.1)
  const chorus = new Tone.Chorus(2, 2, 0.3)
  const filter = new Tone.Filter(1000, 'lowpass')
  const delay = new Tone.FeedbackDelay(0.5, 0.1)
  const delayCrossfader = new Tone.CrossFade(0)
  const reverb = new Tone.Freeverb()

  synth.connect(distortion)
  distortion.connect(chorus)
  chorus.connect(filter)
  filter.connect(delayCrossfader.a)
  filter.connect(delay)
  delay.connect(delayCrossfader.b)
  delayCrossfader.connect(reverb)
  reverb.connect(Tone.getDestination())

  // piano.chain(distortion, chorus, filter, delay, reverb, Tone.getDestination())
  // piano.chain(delay, Tone.getDestination())


  const paramFuncs = {
    distortion: (val: number) => distortion.distortion = val,
    chorusWet: (val: number) => chorus.wet.value = val,
    chorusDepth: (val: number) => chorus.depth = val,
    chorusRate: (val: number) => chorus.delayTime = 2 + val**2 * 20,
    filterFreq: (val: number) => filter.frequency.value = 20000 * val**2,
    filterRes: (val: number) => filter.Q.value = val**100,
    delayTime: (val: number) => delay.delayTime.value = val**2,
    delayFeedback: (val: number) => delay.feedback.value = val,
    delayMix: (val: number) => delayCrossfader.fade.value = val,
    reverb: (val: number) => reverb.wet.value = val
  }
  return {
    synth,
    distortion,
    chorus,
    filter,
    delay,
    reverb,
    paramFuncs,
    paramNames: Object.keys(paramFuncs)
  }
}


export const TONE_AUDIO_START = new Promise((resolve) => {

  const audioStart = async () => {
    await Tone.start()
    resolve(true)
    Tone.getTransport().start()
    console.log('Tone.js audio is ready')
    document.querySelector('body')?.removeEventListener('click', audioStart)
  }
  document.querySelector('body')?.addEventListener('click', audioStart)
})


