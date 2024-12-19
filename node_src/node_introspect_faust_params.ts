
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

baseFreq = hslider("Base Frequency [Hz]", 440, 20, 2000, 0.01);
harmonicLevels = par(i, nHarmonics, hslider("Harmonic_%i", 0, 0, 1, 0.01));
totalWeight = harmonicLevels :> _;

// Generate harmonic frequencies
harmonics = par(i, nHarmonics, os.osc(baseFreq * float(i + 1)));

// Make sure signals are properly paired before multiplication
weightedSignals = (harmonics, harmonicLevels) : ro.interleave(nHarmonics,2) : par(i,nHarmonics,*);

// Sum all signals into mono channel
process = weightedSignals :> _ / totalWeight;
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