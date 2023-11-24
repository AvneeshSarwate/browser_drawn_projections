import * as Tone from 'tone'

class MPEPolySynth<T extends MPEVoiceGraph> {
  private vGraphCtor: Constructor<T>
  private maxVoices: number
  private voices: T[]
  private voiceIndex: number

  constructor(vGraph: Constructor<T>, maxVoices: number = 32) {
    this.vGraphCtor = vGraph

    this.maxVoices = maxVoices
    this.voices = []
    this.voiceIndex = 0
  }

  public noteOn(note: number, velocity: number, pressure: number, slide: number): T {
    let voice: T

    if (this.voices.length < this.maxVoices) {
      voice = new this.vGraphCtor()
      this.voices.push(voice)
    } else {
      voice = this.voices[this.voiceIndex]
      voice.noteOn(note, velocity, pressure, slide)
    }

    this.voiceIndex = (this.voiceIndex + 1) % this.maxVoices
    return voice
  }

  // Additional methods like noteOff can be added here
}

interface VoiceGraph {
  noteOn(note: number, velocity: number, pressure: number, slide: number): void
  noteOff(): void
}

interface MPEVoiceGraph extends VoiceGraph {
  //setters and getters for the numbers pitch, pressure, and slide
  pitch: number
  pressure: number
  slide: number
}

type Constructor<T> = new (...args: any[]) => T

// Example usage:
// let polySynth = new MPEPolySynth("sine", (osc, pressure) => { /* ... */ }, (osc, slide) => { /* ... */ });
// let voice = polySynth.noteOn("C4");
// voice.changePitch("D4");
// voice.changePressure(0.5);
// voice.changeSlide(0.5);
