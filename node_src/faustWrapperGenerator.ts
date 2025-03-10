

/*
Usage:

replace the code in the `code` variable with your Faust code.
run the script to generate the TypeScript class.
the class should go in the `src/music` folder as a sibling to `FaustSynthTemplate.ts`.

node faustWrapperGenerator.ts 

*/

type SliderParam = {
  name: string;
  defaultVal: number;
  min: number;
  max: number;
  stepSize?: number;
};

type ButtonParam = {
  name: string;
};

function parseFaustCode(faustCode: string) {
  const sliders: SliderParam[] = [];
  const buttons: ButtonParam[] = [];
  const sliderRegex = /hslider\s*\(\s*"([^"]+)"\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)/g;
  const buttonRegex = /button\s*\(\s*"([^"]+)"\s*\)/g;

  let match;

  while ((match = sliderRegex.exec(faustCode)) !== null) {
    sliders.push({
      name: match[1],
      defaultVal: parseFloat(match[2]),
      min: parseFloat(match[3]),
      max: parseFloat(match[4]),
      stepSize: match[5] ? parseFloat(match[5]) : undefined,
    });
  }

  while ((match = buttonRegex.exec(faustCode)) !== null) {
    buttons.push({ name: match[1] });
  }

  return { sliders, buttons };
}

function generateTypeScriptClass(faustCode: string, className: string) {
  const { sliders, buttons } = parseFaustCode(faustCode);
  const excludedParams = new Set(["Gate", "Frequency", "VelocityAmp", "Release", "PolyGain"]);


  const sliderProperties = sliders.filter(slider => !excludedParams.has(slider.name))
    .map(
      ({ name, min, max, defaultVal, stepSize }) => `
  get ${name}(): number {
    return this.node.getParamValue("/oscillator/${name}");
  }

  @param(${min}, ${max}, ${defaultVal})
  set ${name}(value: number) {
    this.node.setParamValue("/oscillator/${name}", value);
  }
`
    )
    .join("\n");

  const buttonProperties = buttons
    .map(
      ({ name }) => `
  get ${name}(): number {
    return this.node.getParamValue("/oscillator/${name}");
  }

  set ${name}(value: number) {
    this.node.setParamValue("/oscillator/${name}", value);
  }
`
    )
    .join("\n");

  return `
import { FaustMonoDspGenerator, FaustMonoAudioWorkletNode } from "@grame/faustwasm";
import { argv, compiler, f2m, faustAudioContext, param, type MPEVoiceGraph, m2f } from "./mpeSynth";

const generator = new FaustMonoDspGenerator();
const name = "oscillator"
const code = \`
${faustCode}
\`;
await generator.compile(compiler, name, code, argv.join(" "));

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
${sliderProperties}
}
`;
}

// Example usage:
const faustCode = `
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

const tsClass = generateTypeScriptClass(faustCode, "FaustSynthVoice");
console.log(tsClass);
