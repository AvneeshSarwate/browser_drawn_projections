<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import * as Tone from 'tone'

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

const m2f = (m: number) => Tone.Frequency(m, 'midi').toFrequency()

const midiNote = ref(60)

//coarse corse is [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
//fine is [0, 1]
//gain is [-100, 0]
const oscSliders = ref({
  osc0: { fine: 0, coarse: 1, gain: 0 },
  osc1: { fine: 0, coarse: 1, gain: 0 },
  osc2: { fine: 0, coarse: 1, gain: 0 },
  osc3: { fine: 0, coarse: 1, gain: 0 },
})

const toneStartListener =  async (ev) => {
  console.log("mousedown")
  await Tone.start()
  console.log("fm tone started")
  document.removeEventListener('mousedown', toneStartListener)
}
document.addEventListener('mousedown', toneStartListener)

let changeOscSlider: (ev: Event) => void = (ev) => {console.log("changeOscSlider", ev)}
let changeMidiNote: (ev: Event) => void = (ev) => {console.log("changeMidiNote", ev)}
let turnOnNote: () => void = () => {console.log("turnOnNote")}
let turnOffNote: () => void = () => {console.log("turnOffNote")}

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = async () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?

      const rootFreqSig = new Tone.Signal(m2f(midiNote.value))

      const osc0 = new Tone.Oscillator(m2f(midiNote.value), 'sine')
      const o0CoarseSig = new Tone.Signal(oscSliders.value.osc0.coarse)
      const o0FineSig = new Tone.Signal(oscSliders.value.osc0.fine)
      const o0GainSig = new Tone.Signal(oscSliders.value.osc0.gain)
      const o0Params = {coarse: o0CoarseSig, fine: o0FineSig, gain: o0GainSig}

      const o0CoarseMult = new Tone.Multiply()
      o0CoarseSig.connect(o0CoarseMult)
      rootFreqSig.connect(o0CoarseMult.factor)

      const o0FineMult = new Tone.Multiply()
      o0FineSig.connect(o0FineMult)
      rootFreqSig.connect(o0FineMult.factor)

      const o0modAdd = new Tone.Add()
      o0CoarseMult.connect(o0modAdd)
      o0FineMult.connect(o0modAdd.addend)

      const o0rootfreqAdd = new Tone.Add()
      o0modAdd.connect(o0rootfreqAdd)
      rootFreqSig.connect(o0rootfreqAdd.addend)

      o0rootfreqAdd.connect(osc0.frequency)
      o0GainSig.connect(osc0.volume)





      const osc1 = new Tone.Oscillator(m2f(midiNote.value), 'sine')
      const o1CoarseSig = new Tone.Signal(oscSliders.value.osc1.coarse)
      const o1FineSig = new Tone.Signal(oscSliders.value.osc1.fine)
      const o1GainSig = new Tone.Signal(oscSliders.value.osc1.gain)
      const o1Params = {coarse: o1CoarseSig, fine: o1FineSig, gain: o1GainSig}

      const o1CoarseMult = new Tone.Multiply()
      o1CoarseSig.connect(o1CoarseMult)
      rootFreqSig.connect(o1CoarseMult)

      const o1FineMult = new Tone.Multiply()
      o1FineSig.connect(o1FineMult)
      rootFreqSig.connect(o1FineMult.factor)

      const o1modAdd = new Tone.Add()
      o1CoarseMult.connect(o1modAdd)
      o1FineMult.connect(o1modAdd.addend)

      const o1rootfreqAdd = new Tone.Add()
      o1modAdd.connect(o1rootfreqAdd)
      rootFreqSig.connect(o1rootfreqAdd.addend)

      const o1lastStage = new Tone.Add()
      osc0.connect(o1lastStage)
      o1rootfreqAdd.connect(o1lastStage.addend)

      o1lastStage.connect(osc1.frequency)
      o1GainSig.connect(osc1.volume)





      const osc2 = new Tone.Oscillator(m2f(midiNote.value), 'sine')
      const o2CoarseSig = new Tone.Signal(oscSliders.value.osc2.coarse)
      const o2FineSig = new Tone.Signal(oscSliders.value.osc2.fine)
      const o2GainSig = new Tone.Signal(oscSliders.value.osc2.gain)
      const o2Params = {coarse: o2CoarseSig, fine: o2FineSig, gain: o2GainSig}

      const o2CoarseMult = new Tone.Multiply()
      o2CoarseSig.connect(o2CoarseMult)
      rootFreqSig.connect(o2CoarseMult.factor)

      const o2FineMult = new Tone.Multiply()
      o2FineSig.connect(o2FineMult)
      rootFreqSig.connect(o2FineMult.factor)

      const o2modAdd = new Tone.Add()
      o2CoarseMult.connect(o2modAdd)
      o2FineMult.connect(o2modAdd.addend)

      const o2rootfreqAdd = new Tone.Add()
      o2modAdd.connect(o2rootfreqAdd)
      rootFreqSig.connect(o2rootfreqAdd.addend)

      const o2lastStage = new Tone.Add()
      osc1.connect(o2lastStage)
      o2rootfreqAdd.connect(o2lastStage.addend)

      o2lastStage.connect(osc2.frequency)
      o2GainSig.connect(osc2.volume)





      const osc3 = new Tone.Oscillator(m2f(midiNote.value), 'sine')
      const o3CoarseSig = new Tone.Signal(oscSliders.value.osc3.coarse)
      const o3FineSig = new Tone.Signal(oscSliders.value.osc3.fine)
      const o3GainSig = new Tone.Signal(oscSliders.value.osc3.gain)
      const o3Params = {coarse: o3CoarseSig, fine: o3FineSig, gain: o3GainSig}

      const o3CoarseMult = new Tone.Multiply()
      o3CoarseSig.connect(o3CoarseMult)
      rootFreqSig.connect(o3CoarseMult.factor)

      const o3FineMult = new Tone.Multiply()
      o3FineSig.connect(o3FineMult)
      rootFreqSig.connect(o3FineMult.factor)

      const o3modAdd = new Tone.Add()
      o3CoarseMult.connect(o3modAdd)
      o3FineMult.connect(o3modAdd.addend)

      const o3rootfreqAdd = new Tone.Add()
      o3modAdd.connect(o3rootfreqAdd)
      rootFreqSig.connect(o3rootfreqAdd.addend)

      const o3lastStage = new Tone.Add()
      osc2.connect(o3lastStage)
      o3rootfreqAdd.connect(o3lastStage.addend)

      o3lastStage.connect(osc3.frequency)
      o3GainSig.connect(osc3.volume)

      const adsr = new Tone.AmplitudeEnvelope()
      osc3.connect(adsr)
      adsr.toDestination()

      turnOnNote = () => {
        adsr.triggerAttack()
      }

      turnOffNote = () => {
        adsr.triggerRelease()
      }

      changeMidiNote = (ev: Event) => {
        console.log("changeMidiNote", ev)
        const target = ev.target as HTMLInputElement
        midiNote.value = parseFloat(target.value)
        rootFreqSig.setValueAtTime(m2f(midiNote.value), Tone.now())
      }

      const sliderParams = {
        osc0: o0Params,
        osc1: o1Params,
        osc2: o2Params,
        osc3: o3Params,
      }

      changeOscSlider = (ev: Event) => {
        const target = ev.target as HTMLInputElement
        const [osc, param] = target.name.split('-')
        const sig = sliderParams[osc][param] as Tone.Signal
        sig.setValueAtTime(parseFloat(target.value), Tone.now())

        const freq3 = osc3.frequency.value
        const finemult3 = o3FineMult.getValueAtTime(Tone.now())
        const coarse3 = o3CoarseMult.getValueAtTime(Tone.now())
        const gain3 = o3GainSig.getValueAtTime(Tone.now())
        console.log("changeOscSlider", osc, param, sliderParams[osc][param],target.value, sig.value)
        console.log("freq3", freq3, "finemult3", finemult3, "coarse3", coarse3, "gain3", gain3)
        const fineval3 = o3FineSig.getValueAtTime(Tone.now())
        const coarseval3 = o3CoarseSig.getValueAtTime(Tone.now())
        console.log("fineval3", fineval3, "coarseval3", coarseval3)
        console.log('\n')
      }

      osc0.start()
      osc1.start()
      osc2.start()
      osc3.start()

      




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
})

</script>

<template>
  <label>midi note</label>
  <input type="range" v-model="midiNote" min="0" max="127" step="1" @input="changeMidiNote($event)" />
  <span style="padding-right: 10px; margin-left: 3px">{{ midiNote }}</span>
  <button @click="turnOnNote">on</button>
  <button @click="turnOffNote">off</button>
  <li v-for="k in Object.keys(oscSliders)" :key="k" :style="{marginLeft: '10px'}">
    <div>
      <span style="border: 1px solid black; padding: 2px;">
        <label>{{ k + " fine" }}</label>
        <input type="range" :name="k+'-fine'" v-model="oscSliders[k].fine" min="0" max="1" step="0.01" @input="changeOscSlider($event)" />
        <span style="padding-right: 10px; margin-left: 3px">{{ oscSliders[k].fine }}</span>
      </span>
      <span style="border: 1px solid black; padding: 2px;">
        <label>{{ k + " coarse" }}</label>
        <input type="range" :name="k+'-coarse'" v-model="oscSliders[k].coarse" min="0.5" max="10" step="0.1" @input="changeOscSlider($event)" />
        <span style="padding-right: 10px; margin-left: 3px">{{ oscSliders[k].coarse }}</span>
      </span>
      <span style="border: 1px solid black; padding: 2px;">
        <label>{{ k + " gain" }}</label>
        <input type="range" :name="k+'-gain'" v-model="oscSliders[k].gain" min="-100" max="0" step="1" @input="changeOscSlider($event)" />
        <span style="padding-right: 10px; margin-left: 3px">{{ oscSliders[k].gain }}</span>
      </span>
    </div>
  </li>
</template>

<style scoped></style>