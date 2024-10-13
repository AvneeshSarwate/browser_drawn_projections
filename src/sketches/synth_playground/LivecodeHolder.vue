<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { FatOscillatorVoice, MPEPolySynth, type NumberKeys, type SynthParam } from '@/music/mpeSynth';
import { MIDI_READY, mapMidiInputToMpeSynth, midiInputs } from '@/io/midi';

const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

let synthRef: MPEPolySynth<FatOscillatorVoice> | undefined = undefined
let synthParams: Ref<Record<string, SynthParam>> = ref({})
const onParamChange = (paramName: string, val: number) => {
  synthRef?.setParam(paramName as NumberKeys<FatOscillatorVoice>, val)
  appState.params[paramName] = val
}

onMounted(async () => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    synthRef = new MPEPolySynth(FatOscillatorVoice)
    const synth = synthRef!!
    console.log("synth params", synth.params)
    synthParams.value = synth.params


    //if appState.params has keys that are in synthParams, we can set the parameters on the actual synth
    for(const key of Object.keys(appState.params)) {
      if(synthParams.value[key]) {
        synth.setParam(key as NumberKeys<FatOscillatorVoice>, appState.params[key])
        synthParams.value[key].value = appState.params[key]
      }
    }

    //for keys in synthParams that aren't in appState.params, set the value to the default
    for(const key of Object.keys(synthParams.value)) {
      if(!appState.params[key]) {
        synth.setParam(key as NumberKeys<FatOscillatorVoice>, synthParams.value[key].defaultVal)
        synthParams.value[key].value = synthParams.value[key].defaultVal
      }
    }

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    await MIDI_READY
    const midiInput = midiInputs.get("IAC Driver Bus 1")
    if (midiInput) {
      //todo sketch - do we need to unhook the synth mapping on unmount?
      mapMidiInputToMpeSynth(midiInput, synth)
    }

    //todo sketch - create presets that persist through hot reload (and also optionally to local storage)

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?
      

      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      shaderGraphEndNode = canvasPaint
      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    code() 
  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
  synthRef?.dispose()
})

</script>

<template>
  <div>
    <div v-for="(param, name) in synthParams" :key="name">
      <label>{{ name }}</label>
      <input type="range" v-model="param.value" :min="param.low" :max="param.high" step="0.01" @input="onParamChange(name, parseFloat(($event.target as HTMLInputElement).value))" />
      <span>{{ param.value }}</span>
    </div>
  </div>
</template>

<style scoped></style>