import * as Tone from 'tone'

type Constructor<T> = new (...args: any[]) => T

interface VoiceGraph {
  noteOn(note: number, velocity: number, pressure: number, slide: number): void
  noteOff(): void
  voiceFinishedCB?: (...args: any[]) => void
  forceFinish(): void
  dispose(): void
}

interface MPEVoiceGraph extends VoiceGraph {
  //should be implemented as getters/setters on the implementing class
  pitch: number
  pressure: number
  slide: number
}

//todo api - for now, all of the voices need to connect to the output destination themselves

class MPEPolySynth<T extends MPEVoiceGraph> {
  vGraphCtor: Constructor<T>
  maxVoices: number
  voices: Map<number, T> //map of voices by creation time via Date.now()

  constructor(vGraph: Constructor<T>, maxVoices: number = 32) {
    this.vGraphCtor = vGraph
    this.maxVoices = maxVoices
    this.voices = new Map()
  }

  noteOn(note: number, velocity: number, pressure: number, slide: number): T {
    let voice: T

    if (this.voices.size < this.maxVoices) {
      voice = new this.vGraphCtor()
      voice.noteOn(note, velocity, pressure, slide)
      this.voices.set(Date.now(), voice)
    } else {
      const minKey = Array.from(this.voices.keys()).sort()[0]
      voice = this.voices.get(minKey)!

      voice.forceFinish()
      this.voices.delete(minKey)

      voice.noteOn(note, velocity, pressure, slide)
      this.voices.set(Date.now(), voice)
    }

    return voice
  }

  noteOff(voice: T): void {
    this.voices.forEach((v, k) => {
      if (v === voice) {
        v.voiceFinishedCB = () => this.voices.delete(k)
        v.noteOff()
      }
    })
  }

  public dispose(): void {
    this.voices.forEach(voice => {
      voice.dispose()
    })
    this.voices.clear()
  }
}

class FatOscillatorVoice implements MPEVoiceGraph {
  private oscillator: Tone.FatOscillator
  private filter: Tone.Filter
  private distortion: Tone.Distortion
  private envelope: Tone.AmplitudeEnvelope
  private _pitch: number
  private _pressure: number
  private _slide: number

  constructor() {
    this.oscillator = new Tone.FatOscillator().start()
    this.filter = new Tone.Filter({ type: "lowpass" })
    this.distortion = new Tone.Distortion()
    this.envelope = new Tone.AmplitudeEnvelope({
      attack: 0.1,
      decay: 0.2,
      sustain: 0.9,
      release: 0.8
    })

    this.oscillator.chain(this.filter, this.distortion, this.envelope, Tone.Destination)

    this._pitch = 0
    this._pressure = 0
    this._slide = 0
  }

  get pitch(): number {
    return this._pitch
  }

  set pitch(value: number) {
    this._pitch = value
    this.oscillator.frequency.value = Tone.Midi(value).toFrequency()
  }

  get pressure(): number {
    return this._pressure
  }

  set pressure(value: number) {
    this._pressure = value
    this.filter.frequency.value = 100 + value * 1000 // Example mapping
  }

  get slide(): number {
    return this._slide
  }

  set slide(value: number) {
    this._slide = value
    this.distortion.distortion = value // Example mapping
  }

  get attack(): number {
    return Number(this.envelope.attack)
  }

  set attack(value: number) {
    this.envelope.attack = value
  }

  get decay(): number {
    return Number(this.envelope.decay)
  }

  set decay(value: number) {
    this.envelope.decay = value
  }

  get sustain(): number {
    return this.envelope.sustain
  }

  set sustain(value: number) {
    this.envelope.sustain = value
  }

  get release(): number {
    return Number(this.envelope.release)
  }

  set release(value: number) {
    this.envelope.release = value
  }

  noteOn(note: number, velocity: number, pressure: number, slide: number): void {
    this.pitch = note
    this.pressure = pressure
    this.slide = slide
    this.envelope.triggerAttack(Tone.now(), velocity)
  }

  noteOff(): void {
    this.envelope.triggerRelease()

    // Call the callback after the release time
    setTimeout(() => {
      if (this.voiceFinishedCB) {
        this.voiceFinishedCB()
      }
    }, Number(this.envelope.release) * 1000) // Convert seconds to milliseconds
  }

  forceFinish(): void {
    // Same as noteOff, but immediate
    this.envelope.cancel()
    if (this.voiceFinishedCB) {
      this.voiceFinishedCB()
    }
  }

  voiceFinishedCB?: () => void

  dispose(): void {
    this.oscillator.dispose()
    this.filter.dispose()
    this.distortion.dispose()
    this.envelope.dispose()
  }
}


export const getMPESynth = () => {
  const synth = new MPEPolySynth(FatOscillatorVoice)
  return synth
}
