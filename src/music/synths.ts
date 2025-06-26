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

export function getPianoChain() {
  const piano = getPiano(false)
  const distortion = new Tone.Distortion(0.1)
  const chorus = new Tone.Chorus(2, 2, 0.3)
  const filter = new Tone.Filter(20000, 'lowpass')
  const delay = new Tone.FeedbackDelay(0.5, 0.1)
  const delayCrossfader = new Tone.CrossFade(0)
  const reverb = new Tone.Freeverb()
  const gain = new Tone.Gain(1)
  const panner = new Tone.Panner(0)

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
  reverb.connect(gain)
  gain.connect(panner)
  panner.connect(Tone.getDestination())

  const paramScaling = {
    distortion: (val: number) => val,
    chorusWet: (val: number) => val,
    chorusDepth: (val: number) => val,
    chorusRate: (val: number) => 2 + val ** 2 * 20,
    filterFreq: (val: number) => 20000 * val ** 2,
    filterRes: (val: number) => val * 10,
    delayTime: (val: number) => val ** 2,
    delayFeedback: (val: number) => val,
    delayMix: (val: number) => val,
    reverb: (val: number) => val,
    gain: (val: number) => val * 5, //map 1 to 5
    pan: (val: number) => (val - 0.5) * 2 // Map 0-1 to -1 to 1
  }
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
    reverb: (val: number) => reverb.wet.value = paramScaling.reverb(val),
    gain: (val: number) => gain.gain.value = paramScaling.gain(val),
    pan: (val: number) => panner.pan.value = paramScaling.pan(val)
  }

  const defaultParams = {
    distortion: 0,
    chorusWet: 0,
    chorusDepth: 0.3,
    chorusRate: 0.2,
    filterFreq: 1.0,
    filterRes: 0.5,
    delayTime: 0.5,
    delayFeedback: 0.1,
    delayMix: 0,
    reverb: 0,
    gain: 0.2,
    pan: 0.5
  }

  //INITIALIZE FX TO DEFAULT VALUES
  Object.keys(defaultParams).forEach(param => {
    paramFuncs[param as keyof typeof paramFuncs](defaultParams[param as keyof typeof defaultParams])
  })
  
  return {
    instrument: piano,
    distortion,
    chorus,
    filter,
    delay,
    reverb,
    gain,
    panner,
    paramFuncs,
    paramNames: Object.keys(paramFuncs),
    defaultParams,
    paramScaling
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
  const gain = new Tone.Gain(1)
  const panner = new Tone.Panner(0)

  synth.connect(distortion)
  distortion.connect(chorus)
  chorus.connect(filter)
  filter.connect(delayCrossfader.a)
  filter.connect(delay)
  delay.connect(delayCrossfader.b)
  delayCrossfader.connect(reverb)
  reverb.connect(gain)
  gain.connect(panner)
  panner.connect(Tone.getDestination())

  // piano.chain(distortion, chorus, filter, delay, reverb, Tone.getDestination())
  // piano.chain(delay, Tone.getDestination())


  const paramScaling = {
    attack: (val: number) => val**2,
    decay: (val: number) => val**2,
    sustain: (val: number) => val,
    release: (val: number) => (val**2)*5,
    distortion: (val: number) => val,
    chorusWet: (val: number) => val,
    chorusDepth: (val: number) => val,
    chorusRate: (val: number) => 2 + val ** 2 * 20,
    filterFreq: (val: number) => 20000 * val ** 2,
    filterRes: (val: number) => val * 10,
    delayTime: (val: number) => val ** 2,
    delayFeedback: (val: number) => val,
    delayMix: (val: number) => val,
    reverb: (val: number) => val,
    gain: (val: number) => val * 5, //map 1 to 5
    pan: (val: number) => (val - 0.5) * 2 // Map 0-1 to -1 to 1
  }

  const paramFuncs = {
    attack: (val: number) => {
      synth.set({ envelope: { attack: paramScaling.attack(val) } })
      return paramScaling.attack(val)
    },
    decay: (val: number) => {
      synth.set({envelope: {decay: paramScaling.decay(val)}})
      return paramScaling.decay(val)
    },
    sustain: (val: number) => {
      synth.set({envelope: {sustain: paramScaling.sustain(val)}})
      return val
    },
    release: (val: number) => {
      synth.set({envelope: {release: paramScaling.release(val)}})
      return paramScaling.release(val)
    },
    distortion: (val: number) => distortion.distortion = paramScaling.distortion(val),
    chorusWet: (val: number) => chorus.wet.value = paramScaling.chorusWet(val),
    chorusDepth: (val: number) => chorus.depth = paramScaling.chorusDepth(val),
    chorusRate: (val: number) => chorus.delayTime = paramScaling.chorusRate(val),
    filterFreq: (val: number) => filter.frequency.value = paramScaling.filterFreq(val),
    filterRes: (val: number) => filter.Q.value = paramScaling.filterRes(val),
    delayTime: (val: number) => delay.delayTime.value = paramScaling.delayTime(val),
    delayFeedback: (val: number) => delay.feedback.value = paramScaling.delayFeedback(val),
    delayMix: (val: number) => delayCrossfader.fade.value = paramScaling.delayMix(val),
    reverb: (val: number) => reverb.wet.value = paramScaling.reverb(val),
    gain: (val: number) => gain.gain.value = paramScaling.gain(val),
    pan: (val: number) => panner.pan.value = paramScaling.pan(val)
  }


  const defaultParams = {
    attack: 0.1,
    decay: 0.1,
    sustain: 0.1,
    release: 0.1,
    distortion: 0.1,
    chorusWet: 0.1,
    chorusDepth: 0.3,
    chorusRate: 0.2,
    filterFreq: 1.0,
    filterRes: 0.5,
    delayTime: 0.5,
    delayFeedback: 0.1,
    delayMix: 0.0,
    reverb: 0.1,
    gain: 0.2,
    pan: 0.5
  }

  //INITIALIZE FX TO DEFAULT VALUES
  Object.keys(defaultParams).forEach(param => {
    paramFuncs[param as keyof typeof paramFuncs](defaultParams[param as keyof typeof defaultParams])
  })


  return {
    instrument: synth,
    distortion,
    chorus,
    filter,
    delay,
    reverb,
    gain,
    panner,
    paramFuncs,
    paramNames: Object.keys(paramFuncs),
    defaultParams,
    paramScaling
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

export const oscWebSocket = new WebSocket('ws://localhost:57130')
const OSC_CLIENT_PORT = 6543


oscWebSocket.onopen = () => {
  oscWebSocket.send(JSON.stringify({ type: 'new_osc_client', host: 'localhost', port: OSC_CLIENT_PORT }))
}

// oscWebSocket.send(JSON.stringify({ type: 'synth_param_osc', instrumentPath: '/drift1', voiceInd: 0, paramInd: 0, value: 0.5, portNum: OSC_CLIENT_PORT }))
//todo wrap synth_param_osc in a function that also sends it out to window.max object 
//in the case that the page is bundled in max - https://docs.cycling74.com/userguide/web_browser/#sending-messages


export function createClient(port: number) {
  oscWebSocket.send(JSON.stringify({ type: 'new_osc_client', port: port }))
}

export function sendSynthParam(instrumentPath: string, voiceInd: number, paramInd: number, value: number) {
  oscWebSocket.send(JSON.stringify({ type: 'synth_param_osc', instrumentPath: instrumentPath, voiceInd: voiceInd, paramInd: paramInd, value: value, portNum: OSC_CLIENT_PORT }))
}

export const getDriftChain = (instrumentInd: number) => {


  const paramNames = []
  const paramFuncs = {}
  const defaultParams = {}
  const paramScaling = {}

  Array.from({ length: 16 }).forEach((_, i) => {
    const paramName = `param${i}`
    paramNames.push(paramName)
    paramFuncs[paramName] = (val: number) => {
      sendSynthParam(`/drift${instrumentInd}`, 0, i, val)
      return val
    }
    defaultParams[paramName] = 0.5
    paramScaling[paramName] = (val: number) => val * 127
  })

  return {
    instrument: {
      triggerAttack: (pitches: number[], time: number, velocity: number) => {},
      triggerRelease: (pitch: number) => {}
    },
    paramNames,
    paramFuncs,
    defaultParams,
    paramScaling
  }
}