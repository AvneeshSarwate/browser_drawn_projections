
import { FaustMonoDspGenerator, FaustMonoAudioWorkletNode } from "@grame/faustwasm";
import { argv, compiler, f2m, faustAudioContext, param, type MPEVoiceGraph, m2f } from "./mpeSynth";

const generator = new FaustMonoDspGenerator();
const name = "oscillator"
const code = `

import("stdfaust.lib");

nHarmonics = 16;  // Change this number to experiment with different numbers of harmonics
modIndex = hslider("ModIndex", 26, 1, 100, 1);


t = button("Gate") | checkbox("AOn_hold");
// baseFreq = ba.midikey2hz(hslider("AMidiNote", 60, 1, 127, 1));
baseFreq = hslider("Frequency", 220, 20, 2000, 0.01);
vAmp = hslider("VelocityAmp", 0.7, 0, 1, 0.01);
release = hslider("Release", 0.3, 0, 1, 0.01);
polyGain = hslider("PolyGain", 0.7, 0, 1, 0.01);


harmonic_operator(modulator, ind, isEnd) = sumSignals
with {
    vg(x) = vgroup("voice_%ind",x);
    modDepthControl = vg(hslider("yOp_%ind Mod Depth", ba.if(isEnd, 1, 0), 0, 1, 0.01));
    fine = vg(hslider("yFine", 0, 0, 1, 0.001));
    coarse = vg(hslider("yCoarse", 1, 1, 16, 1));
    fMult = fine + coarse;
    multFreq = baseFreq * fMult;
    modDepth = ba.lin2LogGain(modDepthControl) * ba.if(isEnd, 1, (modIndex * multFreq)); //don't need to use modIndex for last operator in chain

    hGroup(x) = vg(hgroup("zHarmonics_%ind",x));
    harmonicLevels = par(i, nHarmonics, hGroup(vslider("h_%i", i==0, 0, 1, 0.01)));
    totalWeight = harmonicLevels :> _;

    harmonics = par(i, nHarmonics, os.osc((multFreq+modulator) * float(i + 1))); // Generate harmonic frequencies

    weightedSignals = (harmonics, harmonicLevels) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
    a2 = vg(hslider("xAttack", 0.03, 0.001, 1, .001));
    d2 = vg(hslider("xDecay", 0.03, 0.001, 1, .001));
    s2 = vg(hslider("xSustain", 0.8, 0, 1, 0.001));
    r2 = vg(hslider("xRelease", 0.03, 0.001, 1, .001));
    env2 = en.adsr(a2, d2, s2, r2, t);
    sumSignals = weightedSignals :> _ / ba.if(isEnd, totalWeight, 1) * modDepth * env2; //don't normalize harmonic sum except at last operator - todo - probs need to attentuate sum a bit (sqrt?), but not a ton
};


v1 = harmonic_operator(0, 1, 0);
v2 = harmonic_operator(v1, 2, 0);
v3 = harmonic_operator(v2, 3, 0);
v4 = harmonic_operator(v3, 4, 1);


outSignal = v4 * vAmp * polyGain;



process = outSignal, outSignal;

`;
const compilePromise = generator.compile(compiler, name, code, argv.join(" "));

export class FaustOperatorVoice implements MPEVoiceGraph {
  id: number

  //defensive programming - user should call MPEPolySynth.synthReady() before starting to play notes
  node: Partial<FaustMonoAudioWorkletNode> =  {setParamValue: (param: string, value: number) => {}, getParamValue: (param: string) => 0}
  
  _pressure: number
  _slide: number
  constructorPromise: Promise<void>
  constructor(id: number) {
    this.id = id
    const nodeMakeNode = async () =>{
      console.log("starting nodeMakeNode", id)
      await compilePromise
      console.log("post compile", id)
      this.node = await generator.createNode(faustAudioContext, `operator_voice_${id}`);
      this.node.connect(faustAudioContext.destination);
      this.node.start();
      this.node.setParamValue("/oscillator/voice_4/yOp_4_Mod_Depth", 1);
      console.log("node params", this.node.getParams())
      console.log("node created", id)
    } 
    this.constructorPromise = nodeMakeNode() //should ideally be pre-allocated in outer MPEPolySynth constructor
  }

  ready(): Promise<void> {
    return this.constructorPromise
  }

  getAllParams() {
    const params = this.node.getParams()
    const allParams = {}
    params.forEach((param) => {
      allParams[param] = this.node.getParamValue(param)
    })
    return allParams
  }

  //todo - if you want params to vary based on velocity, need to modify noteOn func generated by script
  noteOn(note: number, velocity: number, pressure: number, slide: number): void {
    this.pitch = note
    this._pressure = pressure
    this._slide = slide
    this.node.setParamValue("/oscillator/VelocityAmp", velocity/127)
    this.node.setParamValue("/oscillator/Gate", 1)
    console.log("operator noteOn", note, velocity, pressure, slide)
  }

  setBatchParams(params: { [key: string]: number }): void {
    for (const [key, value] of Object.entries(params)) {
      this.node.setParamValue(key, value);
    }
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
}
