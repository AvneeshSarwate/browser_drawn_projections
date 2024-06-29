import * as Tone from 'tone'
import { v4 as uuidv4 } from 'uuid';

type Constructor<T> = new (...args: any[]) => T

interface VoiceGraph {
  noteOn(note: number, velocity: number, pressure: number, slide: number): void
  noteOff(): void
  voiceFinishedCB?: (...args: any[]) => void
  forceFinish(): void
  dispose(): void
}

export interface MPEVoiceGraph extends VoiceGraph {
  //should be implemented as getters/setters on the implementing class
  pitch: number
  pressure: number
  slide: number
}

//todo api - for now, all of the voices need to connect to the output destination themselves
/**
 * todo api - create a voice-manager object that allocates ids for voices based on noteon/off.
 * the set of ids is passed in as an argument - the MPE set of voices is a special case of 1-14.
 * Add this voiceID mapper into the MPEPolySynth implementation, and have all voices get an id.
 * that ID is then the voice channel used for MPE stuff. Have both a max voices param and 
 * a mpe flag, and if maxVoices > 14 and also mpe is true, throw an error. if not mpe, the 
 * ids of the voice-manager are just 1-maxVoices
 */
class MPEPolySynth<T extends MPEVoiceGraph> {
  vGraphCtor: Constructor<T>
  maxVoices: number
  voices: Map<number, T> //map of voices by creation time via Date.now()

  //todo api - add a "preallocateVoices" flag for MPEPolySynth if voice graphs are heavy
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

  noteOff(voice: VoiceGraph): void {
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

export class FatOscillatorVoice implements MPEVoiceGraph {
  private oscillator: Tone.FatOscillator
  private filter: Tone.Filter
  private distortion: Tone.Distortion
  private envelope: Tone.AmplitudeEnvelope
  private outputGain: Tone.Gain
  private _pitch: number
  private _pressure: number
  private _slide: number

  constructor() {
    this.oscillator = new Tone.FatOscillator().start()
    this.filter = new Tone.Filter({ type: "lowpass" })
    this.filter.Q.value = 25
    this.distortion = new Tone.Distortion()
    this.envelope = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.2,
      sustain: 0.9,
      release: 0.05
    })
    this.outputGain = new Tone.Gain(0.1)

    // todo api - have output of all voices be a raw webAudio gain node (RWGN), which all get merged into a RWGN in the mpeSynth
    // this allows MPEVoiceGraphs to be implemented with either Tone.js or raw webAudio
    // MPEPolySynth then needs to manually be connected to it's destination (another node or webaudio AudioDestinationNode)
    // const rawGain = new GainNode(Tone.context.rawContext)
    // Tone.connect(this.outputGain, rawGain)
    // rawGain can also be at the end of the chain() call

    this.oscillator.chain(this.filter, this.distortion, this.envelope, this.outputGain, Tone.Destination)

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
    this.filter.frequency.value = 100 + value * 3000 // Example mapping
  }

  get slide(): number {
    return this._slide
  }

  set slide(value: number) {
    this._slide = value
    this.distortion.distortion = Math.pow(value, 2.5) // Example mapping
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

//todo - both this and the replicated-channel version need to do midi_chan<=>on_note management

//todo - how ot handle multuple note ons for same pitch 
export class MidiMPEVoiceGraph implements MPEVoiceGraph {
  midiDevice: MIDIValOutput
  onNotes = new Map<number, number>() //map of <midi_channel, time note is on>
  freeNotes = [1, 2, 3, 4, 5, 6, 7, 8 ,9, 10, 11, 12, 13, 14]

  constructor(midiDevice: MIDIValOutput) {
    this.midiDevice = midiDevice
  }

  noteOn(note: number, velocity: number, pressure?: number, slide?: number, bend?: number): void {
    if (this.freeNotes.length == 0) {
      console.warn("no free notes")
    } else {
      const chan = this.freeNotes.shift()!!
      this.onNotes.set(chan, Date.now())
      this.midiDevice.sendNoteOn(note, velocity, chan)
      if (pressure) {
        this.midiDevice.sendChannelPressure(pressure, chan)
      }
      if (slide) {
        this.midiDevice.sendControlChange(74, slide, chan)
      }
      if (bend) {
        this.midiDevice.sendPitchBend(bend, chan)
      }
    }
  }


}

export const getMPESynth = () => {
  const synth = new MPEPolySynth(FatOscillatorVoice)
  return synth
}



import {el, type ElemNode} from '@elemaudio/core';
import WebRenderer from '@elemaudio/web-renderer';
import type { MIDIValOutput } from '@midival/core';
 
const ctx = new AudioContext();
const core = new WebRenderer();

const node = await core.initialize(ctx, {
  numberOfInputs: 0,
  numberOfOutputs: 1,
  outputChannelCount: [2],
});

node.connect(ctx.destination);
 
// (async function main() {
//   let node = await core.initialize(ctx, {
//     numberOfInputs: 0,
//     numberOfOutputs: 1,
//     outputChannelCount: [2],
//   });
 
//   node.connect(ctx.destination);
 
//   let stats = await core.render(el.cycle(440), el.cycle(441));
//   console.log("Elementary stats", stats);
// })();


const elemVoiceRegistry = new Map<string, ElemNode>()
function refreshElemVoiceRegistry() {
  const nodes = Array.from(elemVoiceRegistry.values())
  core.render(...nodes)
}
/**
 * a global voice registry is needed for VoiceGraphs made with elementary to work with the 
 * current MPEPolySynth implementation, as MPEPolySynth assumes that each voice is responsible
 * for connecting itself to the final output destination. It is not set up to be modularly 
 * routed into an effect. If you wanted to set up modular ouputs on each voice, you would need
 * each voice to have a specific output node, and MPEPolySynth would need it's own output
 * node that all voices connect to, which then connects to the final output destination.
 * 
 * For VoiceGraphs made with Elementary, you could give each voice it's own WebRenderer, 
 * because each webRenderer is just an audioWorkletNode. 
 * 
 * For Tone.js you could also try to pull out the underlying webAudio nodes and connect them, 
 * but it might not work that well because Tone.js uses the wrapper library for the AudioContext.
 * Still, if you can get the actual underlying audio context from the wrapper, you could maybe
 * use it as the source context for Elementary nodes, allowing interop
 *  
 */

const midi2freq = (midi: number) => Tone.Midi(midi).toFrequency()

export class ElementaryBasicVoice implements MPEVoiceGraph {

  private pitchSetter: (value: number) => void
  private gainSetter: (value: number) => void
  private asdrTrigger: (value: number) => void
  private id: string

  constructor() {
    this.id = uuidv4()
    const [adsrTriggerNode, setAdsrTrigger] = core.createRef('const', {value: 0}, [])
    const adsr = el.adsr(0.01, 0.2, 0.9, 0.05, adsrTriggerNode as ElemNode);
    const [osc, setOscFreq] = core.createRef('cycle', {frequency: 440}, [])
    const [gain, setGain] = core.createRef('const', {value: 0}, [])
    this.pitchSetter = setOscFreq as (value: number) => void
    this.gainSetter = setGain as (value: number) => void
    this.asdrTrigger = setAdsrTrigger as (value: number) => void

    const outNode = el.mul(el.mul(osc as ElemNode, adsr), gain as ElemNode)

    elemVoiceRegistry.set(this.id, outNode)
    refreshElemVoiceRegistry()
  }

  set pitch(value: number) {
    this.pitchSetter(midi2freq(value))
  }

  noteOn(note: number, velocity: number, pressure: number, slide: number): void {
    this.pitch = note
    this.gainSetter(velocity)
    this.asdrTrigger(1)
  }

  noteOff(): void {
    this.asdrTrigger(0)
  }

  forceFinish(): void {
    this.noteOff()
  }

  pressure: number = 0
  slide: number = 0

  dispose(): void {
    elemVoiceRegistry.delete(this.id)
    refreshElemVoiceRegistry()
  }
}

export function getElementarySynth() {
  return new MPEPolySynth(ElementaryBasicVoice)
}


