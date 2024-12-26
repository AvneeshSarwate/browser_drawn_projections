import { parseXMLFile } from "./operator_param_extract"
import * as fs from 'fs'
import { exec } from 'child_process'

const filePath = process.argv[2]
const presetJson = parseXMLFile(filePath)!!

const presetTs = `export const operatorPreset = ${presetJson}`
fs.writeFileSync('src/sketches/faustSynthTest/operator_preset.ts', presetTs)

//use shell command to compile dsp


exec('faust -lang wasm-i src/music/FaustOperatorPrecompiled/operator.dsp -o operator.wasm', (error, stdout, stderr) => {
    if (error) {
        console.error(`Error executing command: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`stderr: ${stderr}`);
        return;
    }
    console.log(`stdout: ${stdout}`);
});

exec('mv operator.wasm public/operator.wasm')

//read file dsp-meta.json
const dspMeta = fs.readFileSync('operator.json', 'utf8')
const dspMetaTs = `export const dspMeta = ${dspMeta}`
fs.writeFileSync('src/music/FaustOperatorPrecompiled/dsp-meta.ts', dspMetaTs)

exec('rm operator.json')



