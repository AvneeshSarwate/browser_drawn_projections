import * as Tone from 'tone'

type Constructor<T> = new (...args: any[]) => T

interface VoiceGraph {
  noteOn(note: number, velocity: number, pressure: number, slide: number): void
  noteOff(): void
  voiceFinishedCB?: (...args: any[]) => void
  forceFinish(): void
}

interface MPEVoiceGraph extends VoiceGraph {
  pitch: number
  pressure: number
  slide: number
}

class MPEPolySynth<T extends MPEVoiceGraph> {
  vGraphCtor: Constructor<T>
  maxVoices: number
  voices: Map<number, T> //map of voices by creation time via Date.now()
  voiceIndex: number

  constructor(vGraph: Constructor<T>, maxVoices: number = 32) {
    this.vGraphCtor = vGraph
    this.maxVoices = maxVoices
    this.voices = new Map
    this.voiceIndex = 0
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
      voice.noteOn(note, velocity, pressure, slide)
    }

    return voice
  }

  noteOff(voice: T): void {
    this.voices.forEach((v, k) => {
      if (v === voice) {
        v.voiceFinishedCB = () => {
          this.voices.delete(k)
        }
        v.noteOff()
      }
    })
  }
}


