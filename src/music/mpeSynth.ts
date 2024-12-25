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
  ready(): Promise<void>
  release: number
  polyGain: number
  setBatchParams?: (params: Record<string, number>) => void
  //todo api - add a gain param for polyphonic volume management
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
  constructor(vGraph: Constructor<T>, maxVoices: number = 32, isActualMpe: boolean = false, preallocateVoices: boolean = false) {
    this.vGraphCtor = vGraph
    this.maxVoices = maxVoices
    this.voices = new Map()

    const voiceMetadata = vGraph[Symbol.metadata]
    console.log("voiceMetadata", voiceMetadata)

    this.params = voiceMetadata?.setterParams ?? {}
    
    if(isActualMpe && maxVoices > 14) {
      throw new Error("MPEPolySynth: maxVoices must be less than or equal to 14 for actual MPE")
    }

    if(preallocateVoices) {
      console.log("preallocating voices")
      for(let i = 0; i < maxVoices; i++) {
        const voice = new this.vGraphCtor(i)
        this.voices.set(i, {isOn: false, voice})
      }
    }
  }

  async synthReady(): Promise<void> {
    const voices = Array.from(this.voices.values()).map(v => v.voice)
    await Promise.all(voices.map(v => v.ready()))
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

  //todo - make this work properly when dynamically creating new voices - only works for voice existing when this is called
  setBatchParams(params: Record<string, number>): void {
    this.voices.forEach(({voice}) => {
      console.log("setting batch params", voice.id)
      voice.setBatchParams(params)
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

  //when sequencing via ableton, 2 voices might be created in the same millisecond,
  //leading them to not be properly stored in the voices map, that uses Date.now() as the key
  //this tieBreaker is a simple way to ensure that each voice gets a unique key
  tieBreaker = 0

  //extra id parameter here to make it easy to coordinate an instance with actual external midi controllers, who will provide their own voice id
  //todo testing - see how this external id plays with voice stealing and voice allocation
  //todo api - add a dict param that allows for setting params by name
  noteOn(note: number, velocity: number, pressure: number, slide: number, id?: number): T {
    let voice = this.getVoice(id)
    voice.noteOn(note, velocity, pressure, slide)
    return voice
  }


  getVoice(id?: number): T {
    let voice: T //the voice returned at the end

    const offVoices = Array.from(this.voices.keys()).filter((k) => this.voices.get(k)?.isOn === false)
    if(offVoices.length > 0) { //if there are any voices that are off, reuse them
      voice = this.voices.get(offVoices[0])!.voice
      this.voices.delete(offVoices[0])
      this.voices.set(Date.now() + this.tieBreaker++, {isOn: true, voice})
    } else if (this.voices.size < this.maxVoices) { //if there are no off voices, and there is room, create a new one
      voice = new this.vGraphCtor(id ?? this.idGenerator++)

      //have new voices initialize to the values set by the synth
      for(const param in this.params) {
        voice[param as keyof T] = this.params[param as NumberKeys<T>].value as any ?? this.params[param as NumberKeys<T>].defaultVal
        if((voice[param as keyof T] as number) < 0) {
          console.warn(`MPEPolySynth: param ${param} value is less than 0, which is not allowed`)
        }
      }

      this.voices.set(Date.now() + this.tieBreaker++, {isOn: true, voice})
    } else { //if there are no off voices, and there is no room, replace the oldest voice
      const minKey = Array.from(this.voices.keys()).sort()[0]
      const {isOn, voice: replaceVoice} = this.voices.get(minKey)!

      replaceVoice.forceFinish()
      this.voices.delete(minKey)

      this.voices.set(Date.now() + this.tieBreaker++, {isOn: true, voice: replaceVoice})
      voice = replaceVoice
    }

    //set the parameters of the voice to either default or overriden vals
    for(const param in this.params) {
      voice[param as keyof T] = this.params[param as NumberKeys<T>].value as any ?? this.params[param as NumberKeys<T>].defaultVal
    }

    return voice
  }

  noteOff(voice: VoiceGraph): void {
    this.voices.forEach(({voice: v}, k) => {
      if (v === voice) {
        //todo - wrap with setTimeout based on voice release time?
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
  defaultVal: number
}


//todo - need to allow  voice graphs to set default params and have them picked up automatically
export type SynthParam = SynthParamDef & { value?: number }


//a decorator for parameters of a setter of mpeVoiceGraph that sets the high/low limits
export function param(low: number, high: number, defaultVal: number) {
  return function(setter: (value: number) => void, context: ClassSetterDecoratorContext) {

    //add setter name, low, high to decorator metadata
    (context.metadata!.setterParams as Record<string, SynthParamDef>) ??= {}
    const setterParams = context.metadata.setterParams as Record<string, SynthParamDef>
    setterParams[context.name as string] = {low, high, defaultVal}

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
  private distortionNode: Tone.Distortion
  private ampEnv: Tone.AmplitudeEnvelope
  private outputGain: Tone.Gain
  private _polyGain: Tone.Gain
  private _pitch: number
  private _pressure: number
  private _slide: number
  id: number

  voiceName: string = "fatOsc"

  constructor(id: number) {
    console.log("fatOscVoice constructor", id)
    this.id = id
    this.oscillator = new Tone.FatOscillator().start()
    // this.oscillator.volume.value = -20
    // this.oscillator.type = "sine"
    this.filter = new Tone.Filter({ type: "lowpass" })
    this.filter.Q.value = 25
    this.distortionNode = new Tone.Distortion()
    this.ampEnv = new Tone.AmplitudeEnvelope({
      attack: 0.01,
      decay: 0.2,
      sustain: 0.9,
      release: 0.05
    })
    this.outputGain = new Tone.Gain(0.1)
    this._polyGain = new Tone.Gain(0.1)

    // todo api - have output of all voices be a raw webAudio gain node (RWGN), which all get merged into a RWGN in the mpeSynth
    // this allows MPEVoiceGraphs to be implemented with either Tone.js or raw webAudio
    // MPEPolySynth then needs to manually be connected to it's destination (another node or webaudio AudioDestinationNode)
    // const rawGain = new GainNode(Tone.context.rawContext)
    // Tone.connect(this.outputGain, rawGain)
    // rawGain can also be at the end of the chain() call

    this.oscillator.chain(this.distortionNode, this.filter, this.ampEnv, this.outputGain, this._polyGain, Tone.getDestination())

    this._pitch = 0
    this._pressure = 0
    this._slide = 0
  }

  ready(): Promise<void> {
    return new Promise<void>(resolve => { resolve() })
  }

  set polyGain(value: number) {
    this._polyGain.gain.value = value
  }

  get polyGain(): number {
    return this._polyGain.gain.value
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

  set slide(value: number) {
    this._slide = value
    this.distortionNode.distortion = Math.pow(value/127, 2.5) // Example mapping
  }

  noteOn(note: number, velocity: number, pressure: number, slide: number): void {
    this.pitch = note
    this._pressure = pressure
    this._slide = slide
    this.ampEnv.triggerAttack("+0", velocity)
  }

  noteOff(): void {
    this.ampEnv.triggerRelease()

    // Call the callback after the release time
    setTimeout(() => {
      if (this.voiceFinishedCB) {
        this.voiceFinishedCB()
      }
    }, Number(this.ampEnv.release) * 1000) // Convert seconds to milliseconds
  }

  forceFinish(): void {
    // Same as noteOff, but immediate
    this.ampEnv.cancel()
    if (this.voiceFinishedCB) {
      this.voiceFinishedCB()
    }
  }

  voiceFinishedCB?: () => void

  dispose(): void {
    this.oscillator.disconnect()
    this.filter.disconnect()
    this.distortionNode.disconnect()
    this.ampEnv.disconnect()
    this.outputGain.disconnect()

    this.oscillator.dispose()
    this.filter.dispose()
    this.distortionNode.dispose()
    this.ampEnv.dispose()
    this.outputGain.dispose()
  }

  //========== params ==========

  get filterFrequency(): number {
    return this.filter.frequency.immediate()
  }

  @param(50, 3000, 400)
  set filterFrequency(value: number) {
    this.filter.frequency.value = value
  }

  get filterQ(): number {
    return this.filter.Q.value
  }

  @param(0, 100, 10)
  set filterQ(value: number) {
    this.filter.Q.value = value
  }

  get count(): number {
    return this.oscillator.count
  }

  @param(1, 20, 3)
  set count(value: number) {
    this.oscillator.count = value
  }

  get spread(): number {
    return this.oscillator.spread
  }

  @param(0, 100, 3)
  set spread(value: number) {
    this.oscillator.spread = value
  }

  get attack(): number {
    return Number(this.ampEnv.attack)
  }
  @param(0, 5, 0.1)
  set attack(value: number) {
    this.ampEnv.attack = value
  }

  get decay(): number {
    return Number(this.ampEnv.decay)
  }

  @param(0, 5, 0.2)
  set decay(value: number) {
    this.ampEnv.decay = value
  }

  get sustain(): number {
    return this.ampEnv.sustain
  }

  @param(0, 1, 0.9)
  set sustain(value: number) {
    this.ampEnv.sustain = value
  }

  get release(): number {
    return Number(this.ampEnv.release)
  }

  @param(0, 5, 0.6)
  set release(value: number) {
    this.ampEnv.release = value
  }

  get distortion(): number {
    return this.distortionNode.distortion
  }

  @param(0, 1, 0.5)
  set distortion(value: number) {
    this.distortionNode.distortion = value
  }
}


// const fatOscVoice = new FatOscillatorVoice(1)
// fatOscVoice.filterQ = 20
// console.log("fastOsc Q", fatOscVoice.filterQ)

//todo - both this and the replicated-channel version need to do midi_chan<=>on_note management
//todo api - for pressure/slide, have a [pressure/slide]Target param that is the keyname of the mapped actual parameter
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

  release: number = 0.3 //want this to be the same has your external midi synth??
  polyGain: number = 0.1 //unused in this context

  ready(): Promise<void> {
    return new Promise<void>(resolve => { resolve() })
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

//unused
export class ElementaryBasicVoice implements MPEVoiceGraph {

  private pitchSetter: (value: number) => void
  private gainSetter: (value: number) => void
  private asdrTrigger: (value: number) => void
  private elementaryId: string
  private _pitch: number = 0
  id: number

  release: number = 0.3 //as hardcoded in the adsr in constructor

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

  polyGain = 1 //unused here, since we aren't really using this implemenation

  ready(): Promise<void> {
    return new Promise<void>(resolve => { resolve() })
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






import { instantiateFaustModuleFromFile,
  LibFaust,
  FaustMonoDspGenerator,
  FaustCompiler, 
  FaustMonoAudioWorkletNode} from "@grame/faustwasm";


// initialize the libfaust wasm
const faustModule = await instantiateFaustModuleFromFile("../node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.js");

// Get the Faust compiler
const libFaust = new LibFaust(faustModule);
// @ts-ignore
window.libFaust = libFaust;
console.log(libFaust.version());
export const compiler = new FaustCompiler(libFaust);
export const argv = ["-I", "libraries/"];
export const faustAudioContext = new AudioContext();

//a promise that resolves after a click on the document body and resumes the audio context
export const FAUST_AUDIO_CONTEXT_READY = new Promise<void>(resolve => {
  const resume = () => {
    faustAudioContext.resume()
    resolve()
    document.body.removeEventListener('click', resume)
  }
  document.body.addEventListener('click', resume)
})



const generator = new FaustMonoDspGenerator();
const name = "oscillator"
const code = `
import("stdfaust.lib");

//basic parameters all voices need to have
gate = button("Gate");
freq = hslider("Frequency", 440, 20, 2000, 1);
vAmp = hslider("VelocityAmp", 0.7, 0, 1, 0.01);
release = hslider("Release", 0.3, 0, 1, 0.01);
polyGain = hslider("PolyGain", 0.7, 0, 1, 0.01);

//custom parameters for each voice
filterFreq = hslider("Filter", 3000, 20, 10000, 0.1);

env = gate : en.adsr(0.01, 0.1, 0.8, release);
filter = fi.lowpass(2, filterFreq);
process = os.sawtooth(freq) * vAmp * polyGain * env : filter;
`;

//todo - wrap this in some callback or someting so it doesn't block the main thread?
// await generator.compile(compiler, name, code, argv.join(" "));

export class FaustTestVoice implements MPEVoiceGraph {
  id: number

  //defensive programming - user should call MPEPolySynth.synthReady() before starting to play notes
  node: Partial<FaustMonoAudioWorkletNode> =  {setParamValue: (param: string, value: number) => {}, getParamValue: (param: string) => 0}
  
  _pressure: number
  _slide: number
  constructorPromise: Promise<void>
  constructor(id: number) {
    this.id = id
    const nodeMakeNode = async () =>{
      this.node = await generator.createNode(faustAudioContext);
      this.node.connect(faustAudioContext.destination);
      this.node.start();
    } 
    this.constructorPromise = nodeMakeNode() //should ideally be pre-allocated in outer MPEPolySynth constructor
  }

  ready(): Promise<void> {
    return this.constructorPromise
  }

  //todo - if you want params to vary based on velocity, need to modify noteOn func generated by script
  noteOn(note: number, velocity: number, pressure: number, slide: number): void {
    this.pitch = note
    this._pressure = pressure
    this._slide = slide
    this.node.setParamValue("oscillator/VelocityAmp", velocity)
    this.node.setParamValue("/oscillator/Gate", 1)
  }

  get polyGain(): number {
    return this.node.getParamValue("/oscillator/PolyGain")
  }

  set polyGain(value: number) {
    this.node.setParamValue("/oscillator/PolyGain", value)
  }

  get release(): number {
    return this.node.getParamValue("/oscillator/Release")
  }

  set release(value: number) {
    this.node.setParamValue("/oscillator/Release", value)
  }

  noteOff(): void {
    this.node.setParamValue("/oscillator/Gate", 0)

    // // Call the callback after the release time
    // setTimeout(() => {
    //   if (this.voiceFinishedCB) {
    //     this.voiceFinishedCB()
    //   }
    // }, Number(this.ampEnv.release) * 1000) 
  }

  //do you need voiceFinishedCB? might be too niche for template script
  //todo need to have "release" value available at API level for proper voice lifecycle management (eg, don't want to accidentally reuse a voice that is still in release)

  forceFinish(): void {
    //todo - need to implement forceFinish properly for voice stealing - might need a per voice global gain object to manage voice stealing?


    // if (this.voiceFinishedCB) {
    //   this.voiceFinishedCB()
    // }
  }

  dispose(): void {
    this.node.disconnect()
    this.node.destroy()
  }

  get pitch(): number {
    return f2m(this.node.getParamValue('/oscillator/Frequency'))
  }

  set pitch(value: number) {
    this.node.setParamValue("/oscillator/Frequency", m2f(value))
  }

  get slide(): number {
    return this._slide
  }

  set slide(value: number) {
    this._slide = value
  }

  get pressure(): number {
    return this._pressure
  }

  set pressure(value: number) {
    this._pressure = value
  }

  get filterFreq(): number {
    return this.node.getParamValue("/oscillator/Filter")
  }

  @param(20, 2000, 440)
  set filterFreq(value: number) {
    this.node.setParamValue("/oscillator/Filter", value)
  }
}

// midi to frequency calculation
export const m2f = (m : number) => 440 * (2**((m-69)/12))
export const f2m = (f: number) => ( 12 * Math.log(f / 220.0) / Math.log(2.0) ) + 57.01
