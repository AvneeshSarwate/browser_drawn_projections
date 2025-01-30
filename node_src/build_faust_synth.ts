// run from project root with -
// npx ts-node node_src/build_faust_synth.ts SYNTH_NAME

import * as fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util';

//print direcotry the process is running from
console.log('Current directory:', process.cwd())


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


async function rebuildFMChorus(synthName: string) {
  await runCommand(`faust -lang wasm-i -ct 1 -es 1 -mcd 16 -mdd 1024 -mdy 33 -single -ftz 2 src/music/${synthName}Precompiled/${synthName}.dsp -o ${synthName}.wasm`)

  await runCommand(`mv ${synthName}.wasm public/${synthName}.wasm`)

  //read file dsp-meta.json - //todo - somthing going wrong with how this is rewritten
  const dspMeta = JSON.parse(fs.readFileSync(`${synthName}.json`, 'utf8'))
  const dspMetaTs = `export const dspMeta = ${JSON.stringify(dspMeta, null, 2)}`
  fs.writeFileSync(`src/music/${synthName}Precompiled/dsp-meta.ts`, dspMetaTs)

  await runCommand(`rm ${synthName}.json`)
}

const synthName = process.argv[2]

rebuildFMChorus(synthName)
