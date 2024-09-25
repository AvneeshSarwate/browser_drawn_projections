import * as Tone from 'tone'
import { v4 as uuidv4 } from 'uuid';


//polyfil for Symbol.metadata (typescript doesnt emit a polyfil for backwards compat reasons? discussion in links below)
//polyfill used from https://github.com/tc39/proposal-decorator-metadata/issues/14#issuecomment-2136289464
//similar solution https://github.com/microsoft/TypeScript/issues/53461#issuecomment-1738762398
declare global {
  interface SymbolConstructor {
    readonly metadata: unique symbol
  }
}

;(Symbol as any).metadata ??= Symbol.for('Symbol.metadata')

const _metadata = Object.create(null)

if (typeof Symbol === 'function' && Symbol.metadata) {
  Object.defineProperty(globalThis, Symbol.metadata, {
    enumerable: true,
    configurable: true,
    writable: true,
    value: _metadata
  })
}




type Constructor<T> = new (...args: any[]) => T

interface VoiceGraph {
  noteOn(note: number, velocity: number, pressure: number, slide: number): void
  noteOff(): void
  voiceFinishedCB?: (...args: any[]) => void
  forceFinish(): void
  dispose(): void
}

//todo api - in MPEVoiceGraph, directly setting pitch (and for actual MPE implementation, calculating bend) vs setting bend directly?
//todo api - all implementations need to take input 0-127 for pressure/slide and appropriate range for pitch, and handle scaling to internal param
export interface MPEVoiceGraph extends VoiceGraph {
  //should be implemented as getters/setters on the implementing class
  pitch: number
  pressure: number
  slide: number
  id: number
}

export type NumberKeys<T> = {
  [K in keyof T]: T[K] extends number ? K : never
}[keyof T];

//todo api - for now, all of the voices need to connect to the output destination themselves
/**
 * todo api - create a voice-manager object that allocates ids for voices based on noteon/off.
 * the set of ids is passed in as an argument - the MPE set of voices is a special case of 1-14.
 * Add this voiceID mapper into the MPEPolySynth implementation, and have all voices get an id.
 * that ID is then the voice channel used for MPE stuff. Have both a max voices param and 
 * a mpe flag, and if maxVoices > 14 and also mpe is true, throw an error. if not mpe, the 
 * ids of the voice-manager are just 1-maxVoices
 */
export class MPEPolySynth<T extends MPEVoiceGraph> {
  vGraphCtor: Constructor<T>
  maxVoices: number
  voices: Map<number, {isOn: boolean, voice: T}> //map of voices by creation time via Date.now()
  idGenerator = 1
  params: Record<NumberKeys<T>, SynthParam>

  //todo api - add a "preallocateVoices" flag for MPEPolySynth if voice graphs are heavy
  constructor(vGraph: Constructor<T>, maxVoices: number = 32, isActualMpe: boolean = false) {
    this.vGraphCtor = vGraph
    this.maxVoices = maxVoices
    this.voices = new Map()

    // @ts-expect-error
    const voiceMetadata = vGraph[Symbol.metadata]
    console.log("voiceMetadata", voiceMetadata)

    this.params = voiceMetadata.setterParams
    
    if(isActualMpe && maxVoices > 14) {
      throw new Error("MPEPolySynth: maxVoices must be less than or equal to 14 for actual MPE")
    }
  }

  setParam(param: NumberKeys<T>, value: number) {
    const paramDef = this.params[param]
    if(!paramDef) {
      throw new Error(`MPEPolySynth: param ${String(param)} not found`)
    }
    const clampedValue = Math.min(Math.max(value, paramDef.low), paramDef.high)
    paramDef.value = clampedValue
    this.voices.forEach(({voice}) => {
      voice[param] = clampedValue as any
    })
  }
  
  //alternate typing - learn why these are different?
  // setParam<K extends NumberKeys<T>>(param: K, value: number) {
  //   this.voices.forEach(voice => {
  //     voice[param] = value as any;
  //   });
  // }

  allNotesOff() {
    for(const key of this.voices.keys()) {
      const voiceRecord = this.voices.get(key)
      if(voiceRecord?.isOn) {
        voiceRecord.voice.forceFinish()
        this.voices.set(key, {isOn: false, voice: voiceRecord.voice})
      }
    }
  }

  //extra id parameter here to make it easy to coordinate an instance with actual external midi controllers, who will provide their own voice id
  //todo testing - see how this external id plays with voice stealing and voice allocation
  noteOn(note: number, velocity: number, pressure: number, slide: number, id?: number): T {
    let voice: T

    const offVoices = Array.from(this.voices.keys()).filter((k) => this.voices.get(k)?.isOn === false)
    if(offVoices.length > 0) { //if there are any voices that are off, reuse them
      voice = this.voices.get(offVoices[0])!.voice
      this.voices.delete(offVoices[0])
      voice.noteOn(note, velocity, pressure, slide)
      this.voices.set(Date.now(), {isOn: true, voice})
    } else if (this.voices.size < this.maxVoices) { //if there are no off voices, and there is room, create a new one
      voice = new this.vGraphCtor(id ?? this.idGenerator++)

      //have new voices initialize to the values set by the synth
      for(const param in this.params) {
        voice[param as keyof T] = this.params[param as NumberKeys<T>].value as any ?? this.params[param as NumberKeys<T>].low
      }

      voice.noteOn(note, velocity, pressure, slide)
      this.voices.set(Date.now(), {isOn: true, voice})
    } else { //if there are no off voices, and there is no room, replace the oldest voice
      const minKey = Array.from(this.voices.keys()).sort()[0]
      const {isOn, voice: replaceVoice} = this.voices.get(minKey)!

      replaceVoice.forceFinish()
      this.voices.delete(minKey)

      replaceVoice.noteOn(note, velocity, pressure, slide)
      this.voices.set(Date.now(), {isOn: true, voice: replaceVoice})
      voice = replaceVoice
    }

    return voice
  }

  noteOff(voice: VoiceGraph): void {
    this.voices.forEach(({voice: v}, k) => {
      if (v === voice) {
        v.noteOff()
        this.voices.set(k, {isOn: false, voice: v})
      }
    })
  }

  public dispose(): void {
    this.voices.forEach(({voice}) => {
      voice.dispose()
    })
    this.voices.clear()
  }
}

type SynthParamDef = {
  low: number
  high: number
}


//todo - need to allow  voice graphs to set default params and have them picked up automatically
export type SynthParam = SynthParamDef & { value: number }


//a decorator for parameters of a setter of mpeVoiceGraph that sets the high/low limits
function param(low: number, high: number) {
  return function(setter: (value: number) => void, context: ClassSetterDecoratorContext) {

    //add setter name, low, high to decorator metadata
    (context.metadata!.setterParams as Record<string, SynthParamDef>) ??= {}
    const setterParams = context.metadata.setterParams as Record<string, SynthParamDef>
    setterParams[context.name as string] = {low, high}

    return function boundedSetter(this: any, value: number) {
      const clampedValue = Math.min(Math.max(value, low), high)
      setter.call(this, clampedValue)
    }
  }
}

function testDecorator(ths: any, context: any) {
  // context.metadata ??= {}
  context.metadata[context.name] = context.name
  return
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
  id: number

  voiceName: string = "fatOsc"

  constructor(id: number) {
    console.log("fatOscVoice constructor", id)
    this.id = id
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

    this.oscillator.chain(this.filter, this.distortion, this.envelope, this.outputGain, Tone.getDestination())

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
    this.filter.frequency.value = 100 + (value/127) * 3000 // Example mapping
  }

  get slide(): number {
    return this._slide
  }

  get filterFrequency(): number {
    return this.filter.frequency.immediate()
  }

  @param(50, 3000)
  set filterFrequency(value: number) {
    this.filter.frequency.value = value
  }

  get filterQ(): number {
    return this.filter.Q.value
  }

  // @testDecorator
  @param(0, 100)
  set filterQ(value: number) {
    this.filter.Q.value = value
  }

  set slide(value: number) {
    this._slide = value
    this.distortion.distortion = Math.pow(value/127, 2.5) // Example mapping
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
    this._pressure = pressure
    this._slide = slide
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
    this.oscillator.disconnect()
    this.filter.disconnect()
    this.distortion.disconnect()
    this.envelope.disconnect()
    this.outputGain.disconnect()

    this.oscillator.dispose()
    this.filter.dispose()
    this.distortion.dispose()
    this.envelope.dispose()
    this.outputGain.dispose()
  }
}


const fatOscVoice = new FatOscillatorVoice(1)
fatOscVoice.filterQ = 20
console.log("fastOsc Q", fatOscVoice.filterQ)

//todo - both this and the replicated-channel version need to do midi_chan<=>on_note management

//todo - how ot handle multuple note ons for same pitch 
export class MidiMPEVoiceGraph implements MPEVoiceGraph {
  channel: number
  midiDevice: MIDIValOutput
  note: number = -1
  _pressure: number = 0
  _slide: number = 0
  _pitch: number = 0
  pitchBendRange: number
  id: number

  constructor(id: number, channel: number, midiDevice: MIDIValOutput, pitchBendRange: number = 48) {
    this.id = channel
    this.channel = channel
    this.midiDevice = midiDevice
    this.pitchBendRange = pitchBendRange
  }

  noteOn(note: number, velocity: number, pressure: number, slide: number): void {
    this.note = note
    this._pressure = pressure
    this._slide = slide
    this.midiDevice.sendNoteOn(note, velocity, this.channel)
    this.midiDevice.sendControlChange(74, slide, this.channel)
    this.midiDevice.sendChannelPressure(pressure, this.channel)
  }

  noteOff(): void {
    this.midiDevice.sendNoteOff(this.note, this.channel)
    this.midiDevice.sendControlChange(74, 0, this.channel)
    this.midiDevice.sendChannelPressure(0, this.channel)
    this.note = -1
  }

  forceFinish(): void {
    this.noteOff()
  }

  get pressure(): number {
    return this._pressure
  }

  set pressure(value: number) {
    this._pressure = value
    this.midiDevice.sendChannelPressure(value, this.channel)
  }

  get slide(): number {
    return this._slide
  }

  set slide(value: number) {
    this._slide = value
    this.midiDevice.sendControlChange(74, value, this.channel)
  }

  get pitch(): number {
    return this._pitch
  }

  set pitch(value: number) {
    this._pitch = value
    const normalizedBend = (value - this.note) / this.pitchBendRange
    this.midiDevice.sendPitchBend(normalizedBend, this.channel)
  }

  dispose(): void {
    this.forceFinish()
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


async function initializeElementaryRenderer() {
  const node = await core.initialize(ctx, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });

  node.connect(ctx.destination);
}
 
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
  private elementaryId: string
  private _pitch: number = 0
  id: number

  constructor(id: number) {
    this.id = id
    this.elementaryId = uuidv4()
    const [adsrTriggerNode, setAdsrTrigger] = core.createRef('const', {value: 0}, [])
    const adsr = el.adsr(0.01, 0.2, 0.9, 0.05, adsrTriggerNode as ElemNode);
    const [osc, setOscFreq] = core.createRef('cycle', {frequency: 440}, [])
    const [gain, setGain] = core.createRef('const', {value: 0}, [])
    this.pitchSetter = setOscFreq as (value: number) => void
    this.gainSetter = setGain as (value: number) => void
    this.asdrTrigger = setAdsrTrigger as (value: number) => void

    const outNode = el.mul(el.mul(osc as ElemNode, adsr), gain as ElemNode)

    elemVoiceRegistry.set(this.elementaryId, outNode)
    refreshElemVoiceRegistry()
  }

  get pitch(): number {
    return this._pitch
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

  _pressure: number = 0
  _slide: number = 0

  get pressure(): number {
    return this._pressure
  }

  set pressure(value: number) {
    this._pressure = value
  }

  get slide(): number {
    return this._slide
  }

  set slide(value: number) {
    this._slide = value
  }

  dispose(): void {
    elemVoiceRegistry.delete(this.elementaryId)
    refreshElemVoiceRegistry()
  }
}

export function getElementarySynth() {
  return new MPEPolySynth(ElementaryBasicVoice)
}

//example pulled from TS 5.2 announcement for decorator metadata
// interface Context {
//   name: string;
//   metadata: Record<PropertyKey, unknown>;
// }
// function setMetadata(_target: any, context: any) {
//   context.metadata ??= {}
//   context.metadata[context.name] = true;
// }
// class SomeClass {
//   @setMetadata
//   foo = 123;
//   @setMetadata
//   accessor bar = "hello!";
//   @setMetadata
//   baz() { }
// }

// // @ts-ignore
// const ourMetadata = SomeClass[Symbol.metadata];
// console.log("docs metadata test", JSON.stringify(ourMetadata));



const audioStart = async () => {
  await Tone.start()
  Tone.Transport.start()
  console.log('audio is ready', Tone.Transport.bpm.value, Tone.context.lookAhead)
  // setTimeout(testCancel, 50)
  document.querySelector('body')?.removeEventListener('click', audioStart)
}
document.querySelector('body')?.addEventListener('click', audioStart)