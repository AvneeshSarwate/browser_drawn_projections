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
const osc0Fine = ref(0)
const osc0Coarse = ref(1)
const osc0Gain = ref(0.5)
const osc1Fine = ref(0)
const osc1Coarse = ref(1)
const osc1Gain = ref(0.5)
const osc2Fine = ref(0)
const osc2Coarse = ref(1)
const osc2Gain = ref(0.5)
const osc3Fine = ref(0)
const osc3Coarse = ref(1)
const osc3Gain = ref(0.5)

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

      await Tone.start()


      const rootFreqSig = new Tone.Signal(m2f(midiNote.value))

      const osc0 = new Tone.Oscillator('sine')
      const o0CoarseSig = new Tone.Signal(osc0Coarse.value)
      const o0FineSig = new Tone.Signal(osc0Fine.value)
      const o0GainSig = new Tone.Signal(osc0Gain.value)

      const o0CoarseMult = new Tone.Multiply()
      o0CoarseSig.connect(o0CoarseMult)
      rootFreqSig.connect(o0CoarseMult)

      const o0FineMult = new Tone.Multiply()
      o0FineSig.connect(o0FineMult)
      rootFreqSig.connect(o0FineMult)

      const o0modMult = new Tone.Add()
      o0CoarseMult.connect(o0modMult)
      o0FineMult.connect(o0modMult)

      const o0modFreq = new Tone.Add()
      o0modMult.connect(o0modFreq)
      rootFreqSig.connect(o0modFreq)

      o0modFreq.connect(osc0.frequency)
      o0GainSig.connect(osc0.volume)





      const osc1 = new Tone.Oscillator('sine')
      const o1CoarseSig = new Tone.Signal(osc1Coarse.value)
      const o1FineSig = new Tone.Signal(osc1Fine.value)
      const o1GainSig = new Tone.Signal(osc1Gain.value)

      const o1CoarseMult = new Tone.Multiply()
      o1CoarseSig.connect(o1CoarseMult)
      rootFreqSig.connect(o1CoarseMult)

      const o1FineMult = new Tone.Multiply()
      o1FineSig.connect(o1FineMult)
      rootFreqSig.connect(o1FineMult)

      const o1modMult = new Tone.Add()
      o1CoarseMult.connect(o1modMult)
      o1FineMult.connect(o1modMult)

      const o1modFreq = new Tone.Add()
      o1modMult.connect(o1modFreq)
      rootFreqSig.connect(o1modFreq)

      const o1lastStage = new Tone.Add()
      osc0.connect(o1lastStage)
      o1modFreq.connect(o1lastStage)

      o1lastStage.connect(osc1.frequency)
      o1GainSig.connect(osc1.volume)





      const osc2 = new Tone.Oscillator('sine')
      const o2CoarseSig = new Tone.Signal(osc2Coarse.value)
      const o2FineSig = new Tone.Signal(osc2Fine.value)
      const o2GainSig = new Tone.Signal(osc2Gain.value)






      const osc3 = new Tone.Oscillator('sine')
      const o3CoarseSig = new Tone.Signal(osc3Coarse.value)
      const o3FineSig = new Tone.Signal(osc3Fine.value)
      const o3GainSig = new Tone.Signal(osc3Gain.value)


      





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
  <div></div>
</template>

<style scoped></style>