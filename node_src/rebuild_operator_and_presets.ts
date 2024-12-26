// run from project root with - npx ts-node node_src/rebuild_operator_and_presets.ts ../Ableton/operator_rebuild\ Project/operator_rebuild.als true true

import { parseXMLFile } from "./operator_param_extract"
import * as fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util';

//print direcotry the process is running from
console.log('Current directory:', process.cwd())

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const execAsync = promisify(exec);

async function runCommand(command: string) {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      console.error('Error:', stderr);
    }
    console.log('Output:', stdout);
  } catch (error) {
    console.error('Command failed:', error);
  }
}

const filePath = process.argv[2]

const grabPreset = process.argv[3] === 'true'

if (grabPreset) {
  const presetJson = parseXMLFile(filePath)!!
  const presetTs = `export const operatorPreset = ${presetJson}`
  fs.writeFileSync('src/sketches/faustSynthTest/operator_preset.ts', presetTs)
}

//use shell command to compile dsp
const rebuildDsp = process.argv[4] === 'true'

if (rebuildDsp) {
  
  rebuildOperator()
}

async function rebuildOperator() {
  await runCommand('faust -lang wasm-i src/music/FaustOperatorPrecompiled/operator.dsp -o operator.wasm')

  await runCommand('mv operator.wasm public/operator.wasm')

  //read file dsp-meta.json - //todo - somthing going wrong with how this is rewritten
  const dspMeta = JSON.parse(fs.readFileSync('operator.json', 'utf8'))
  const dspMetaTs = `export const dspMeta = ${JSON.stringify(dspMeta, null, 2)}`
  fs.writeFileSync('src/music/FaustOperatorPrecompiled/dsp-meta.ts', dspMetaTs)

  await runCommand('rm operator.json')
}
