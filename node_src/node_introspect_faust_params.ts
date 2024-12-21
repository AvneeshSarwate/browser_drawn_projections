
//run with npx tsx node_src/node_introspect_faust_params.ts

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as FaustWasm from "@grame/faustwasm/dist/esm/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const run = async () => {
    const faustModulePath = join(__dirname, "../node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.js");
    
    // initialize the libfaust wasm
    const faustModule = await FaustWasm.instantiateFaustModuleFromFile(faustModulePath);
    
    // Get the Faust compiler
    const libFaust = new FaustWasm.LibFaust(faustModule);
    console.log(libFaust.version());
    
    const compiler = new FaustWasm.FaustCompiler(libFaust);
    const generator = new FaustWasm.FaustMonoDspGenerator();
    
    const argv = ["-I", "libraries/"];
    const name = "oscillator"
    const code = `
 import("stdfaust.lib");

nHarmonics = 16;  // Change this number to experiment with different numbers of harmonics
modIndex = 13;


t = button("AGate") | checkbox("AOn_hold");
baseFreq = ba.midikey2hz(hslider("AMidiNote", 60, 1, 127, 1));

vg1(x) = vgroup("Voice_1",x);
modDepthControl_1 = vg1(hslider("yOp_1 Mod Depth", 0, 0, 1, 0.01));
fine_1 = vg1(hslider("yFine", 0, 0, 1, 0.001));
coarse_1 = vg1(hslider("yCoarse", 1, 1, 16, 1));
fMult_1 = fine_1 + coarse_1;
multFreq_1 = baseFreq * fMult_1;
modDepth_1 = ba.lin2LogGain(modDepthControl_1) * (modIndex * multFreq_1);
hGroup_1(x) = vg1(hgroup("zHarmonics_1",x));
harmonicLevels_1 = par(i, nHarmonics, hGroup_1(vslider("h_%i", i==0, 0, 1, 0.01)));
totalWeight_1 = harmonicLevels_1 :> _;
harmonics_1 = par(i, nHarmonics, os.osc(multFreq_1 * float(i + 1))); // Generate harmonic frequencies
weightedSignals_1 = (harmonics_1, harmonicLevels_1) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
a1 = vg1(hslider("xAttack", 0.03, 0.001, 1, .001));
d1 = vg1(hslider("xDecay", 0.03, 0.001, 1, .001));
s1 = vg1(hslider("xSustain", 0.8, 0, 1, 0.001));
r1 = vg1(hslider("xRelease", 0.03, 0.001, 1, .001));
env1 = en.adsr(a1, d1, s1, r1, t);
sumSignals_1 = weightedSignals_1 :> _ / totalWeight_1 * modDepth_1 * env1;





vg2(x) = vgroup("Voice_2",x);
modDepthControl_2 = vg2(hslider("yOp_2 Mod Depth", 0, 0, 1, 0.01));
fine_2 = vg2(hslider("yFine", 0, 0, 1, 0.001));
coarse_2 = vg2(hslider("yCoarse", 1, 1, 16, 1));
fMult_2 = fine_2 + coarse_2;
multFreq_2 = baseFreq * fMult_2;
modDepth_2 = ba.lin2LogGain(modDepthControl_2) * (modIndex * multFreq_2);
hGroup_2(x) = vg2(hgroup("zHarmonics_2",x));
harmonicLevels_2 = par(i, nHarmonics, hGroup_2(vslider("h_%i", i==0, 0, 1, 0.01)));
totalWeight_2 = harmonicLevels_2 :> _;

harmonics_2 = par(i, nHarmonics, os.osc((multFreq_2+sumSignals_1) * float(i + 1))); // Generate harmonic frequencies

weightedSignals_2 = (harmonics_2, harmonicLevels_2) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
a2 = vg2(hslider("xAttack", 0.03, 0.001, 1, .001));
d2 = vg2(hslider("xDecay", 0.03, 0.001, 1, .001));
s2 = vg2(hslider("xSustain", 0.8, 0, 1, 0.001));
r2 = vg2(hslider("xRelease", 0.03, 0.001, 1, .001));
env2 = en.adsr(a2, d2, s2, r2, t);
sumSignals_2 = weightedSignals_2 :> _ / totalWeight_2 * modDepth_2 * env2;





vg3(x) = vgroup("Voice_3",x);
modDepthControl_3 = vg3(hslider("yOp_3 Mod Depth", 0, 0, 1, 0.01));
fine_3 = vg3(hslider("yFine", 0, 0, 1, 0.001));
coarse_3 = vg3(hslider("yCoarse", 1, 1, 16, 1));
fMult_3 = fine_3 + coarse_3;
multFreq_3 = baseFreq * fMult_3;
modDepth_3 = ba.lin2LogGain(modDepthControl_3) * (modIndex * multFreq_3);
hGroup_3(x) = vg3(hgroup("zHarmonics_3",x));
harmonicLevels_3 = par(i, nHarmonics, hGroup_3(vslider("h_%i", i==0, 0, 1, 0.01)));
totalWeight_3 = harmonicLevels_3 :> _;

harmonics_3 = par(i, nHarmonics, os.osc((multFreq_3+sumSignals_2) * float(i + 1))); // Generate harmonic frequencies

weightedSignals_3 = (harmonics_3, harmonicLevels_3) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
a3 = vg3(hslider("xAttack", 0.03, 0.001, 1, .001));
d3 = vg3(hslider("xDecay", 0.03, 0.001, 1, .001));
s3 = vg3(hslider("xSustain", 0.8, 0, 1, 0.001));
r3 = vg3(hslider("xRelease", 0.03, 0.001, 1, .001));
env3 = en.adsr(a3, d3, s3, r3, t);
sumSignals_3 = weightedSignals_3 :> _ / totalWeight_3 * modDepth_3 * env3;





vg4(x) = vgroup("Voice_4",x);
modDepthControl_4 = vg4(hslider("yOp_4 Mod Depth", 1, 0, 1, 0.01));
fine_4 = vg4(hslider("yFine", 0, 0, 1, 0.001));
coarse_4 = vg4(hslider("yCoarse", 1, 1, 16, 1));
fMult_4 = fine_4 + coarse_4;
multFreq_4 = baseFreq * fMult_4;
hGroup_4(x) = vg4(hgroup("zHarmonics_4",x));
harmonicLevels_4 = par(i, nHarmonics, hGroup_4(vslider("h_%i", i==0, 0, 1, 0.01)));
totalWeight_4 = harmonicLevels_4 :> _;

harmonics_4 = par(i, nHarmonics, os.osc((multFreq_4+sumSignals_3) * float(i + 1))); // Generate harmonic frequencies

weightedSignals_4 = (harmonics_4, harmonicLevels_4) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*); // Make sure signals are properly paired before multiplication
a4 = vg4(hslider("xAttack", 0.03, 0.001, 1, .001));
d4 = vg4(hslider("xDecay", 0.03, 0.001, 1, .001));
s4 = vg4(hslider("xSustain", 0.8, 0, 1, 0.001));
r4 = vg4(hslider("xRelease", 0.03, 0.001, 1, .001));
env4 = en.adsr(a4, d4, s4, r4, t);
sumSignals_4 = weightedSignals_4 :> _ / totalWeight_4 * ba.lin2LogGain(modDepthControl_4) * env4;





// Sum all signals into mono channel
process = sumSignals_4, sumSignals_4;
    `;
    
    // Compile the DSP
    await generator.compile(compiler, name, code, argv.join(" "));
    const processor = await generator.createOfflineProcessor(44100, 1024);
    const meta = generator.getMeta();
    console.log("meta", meta);
    const params = generator.getUI();
    console.log("UI", params);
    const paramNames = processor.getParams();
    console.log("paramValues", paramNames);
};

run().catch(console.error);