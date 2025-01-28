<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import * as THREE from "three";
import { type TemplateAppState, PulseCircle, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { createDancerScene, framesPerPerson, people } from './dancerInitializer';
import { notePulse, randomPhraseDancer } from "./audiovisualProcesses";
import { FAUST_AUDIO_CONTEXT_READY, MPEPolySynth } from "@/music/mpeSynth";
import { FaustTestVoice } from "@/music/FaustSynthTemplate";
import { logisticSigmoid } from "@/rendering/logisticSigmoid";
import { lerp } from "three/src/math/MathUtils.js";
import { FMChorusVoice } from "@/music/FMChorusSynth";
import { MIDI_READY, midiInputs } from "@/io/midi";
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

//todo note somewhere special midi CCs that might break with naive usage, like those for RPN/NRPN  [6, 98, 99, 100, 101]
const paramDef = {
  activeChord: {val: 1, min: 0, max: 4, midiCC: 1, quantize: true},
  speed: {val: 0.125, min: 0, max: 1, midiCC: 2, quantize: false},
  filterFreq: {val: 1500, min: 0, max: 10000, midiCC: 3, quantize: false},
  release: {val: 0.15, min: 0, max: 1, midiCC: 4, quantize: false},
  bassNote: {val: 0, min: 0, max: 7, midiCC: 5, quantize: true},
  bassVol: {val: 0.5, min: 0, max: 1, midiCC: 7, quantize: false} 
}
const paramMap = ref(paramDef)

onMounted(async () => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const dancerRenderTarget = new THREE.WebGLRenderTarget(resolution.width, resolution.height)
    const dancerScene = await createDancerScene(appState.threeRenderer!!, dancerRenderTarget)
    
    Array.from(dancerScene.dancers.keys()).forEach(id => {
      dancerScene.dancers.get(id)?.remove()
    })

    const dancerChords = [
    {dancer: dancerScene.createDancer("kurush", 200, {x: 300, y: 200}), chord: [47, 48]},
      {dancer: dancerScene.createDancer("chloe", 200, {x: 400, y: 200}), chord: [48, 55]},
      {dancer: dancerScene.createDancer("chris", 200, {x: 500, y: 200}), chord: [55, 59]},
      {dancer: dancerScene.createDancer("iman", 200, {x: 600, y: 200}), chord: [55, 65]},
      {dancer: dancerScene.createDancer("aroma", 200, {x: 700, y: 200}), chord: [58, 65]}
    ]

    const chordPulseData = {
      dcMap: dancerChords,
      activeChord: 1,
      speed: 0.125,
      stop: false
    }

    await MIDI_READY

    const midiIn = midiInputs.get("IAC Driver Bus 1")
    if(midiIn) {
      midiIn.onAllControlChange((ev) => {
        const cc = ev.control
        const val = ev.value / 127
        
        //for each param, check if the cc matches
        //if it does, set the param to the value
        const paramNames: (keyof typeof paramDef)[] = Object.keys(paramDef) as (keyof typeof paramDef)[]
        paramNames.forEach(paramName => {
          if(paramDef[paramName].midiCC === cc) {
            const sliderVal = paramDef[paramName].min + (paramDef[paramName].max - paramDef[paramName].min) * val
            paramMap.value[paramName].val = paramDef[paramName].quantize ? Math.floor(sliderVal) : sliderVal
          }
        })
      })
    }

    await FAUST_AUDIO_CONTEXT_READY
    const synth = new MPEPolySynth(FaustTestVoice, 32, false, true)
    const synth2 = new MPEPolySynth(FaustTestVoice, 2, false, true)
    const synth3 = new MPEPolySynth(FMChorusVoice, 2, false, true)
    await synth.synthReady()
    await synth2.synthReady()
    await synth3.synthReady()

    synth3.setParam('polyGain', 0.3)

    synth.setParam('release', 0.15)
    synth.setParam('polyGain', 0.2)
    synth.setParam('Filter', 1500)

    const bassPitches = [36, 38, 40, 41, 43, 45, 47, 48]
    const bassDancers = people.slice(10, 18)
    const bassVoice = synth2.noteOn(bassPitches[paramMap.value.bassNote.val], 100, 0, 0)
    bassVoice.polyGain = paramMap.value.bassVol.val
    bassVoice.Filter = 600

    const lerpDancer = dancerScene.createDancer(bassDancers[paramMap.value.bassNote.val], 500, {x: 150, y: 250})
    lerpDancer.group.position.z = 1
    lerpDancer.quadVisible(false)
    lerpDancer.lerpDef.lerping = true
    lerpDancer.lerpDef.fromDancer = bassDancers[paramMap.value.bassNote.val]
    lerpDancer.lerpDef.toDancer = bassDancers[paramMap.value.bassNote.val]
    lerpDancer.lerpDef.fromFrame = 0
    lerpDancer.lerpDef.toFrame = 0

    const segmentDancer = dancerScene.createDancer("chris", 500, {x: 900, y: 200})
    segmentDancer.quadVisible(false)
    segmentDancer.regionsVisible(true)
    segmentDancer.lineVisible(false)

    launchLoop(async (ctx) => {
      await ctx.wait(0.1)
      notePulse(chordPulseData, synth, ctx)
    })

    let bassNoteTarget = paramMap.value.bassNote.val
    let lastTarget = bassNoteTarget
    const slideTime = 120
    let slideProg = 0
    let loopFrame = 0
    launchLoop(async (ctx) => {
      while(true) {
        await ctx.waitFrame()
        chordPulseData.speed = paramMap.value.speed.val
        chordPulseData.activeChord = paramMap.value.activeChord.val
        synth.setParam('Filter', paramMap.value.filterFreq.val)
        synth.setParam('release', paramMap.value.release.val)

        //slider sets target bass note, and this loop 
        //interpolates towards the target note over about 10 frames.
        //each note has it's own dancer, and the dancers interpolate along with the notes

        if(bassNoteTarget !== paramMap.value.bassNote.val) {
          lastTarget = bassNoteTarget
          bassNoteTarget = paramMap.value.bassNote.val
          lerpDancer.lerpDef.fromDancer = bassDancers[lastTarget]
          lerpDancer.lerpDef.toDancer = bassDancers[bassNoteTarget]
          slideProg = 0
        }

        slideProg = Math.min(slideProg + 1, slideTime)
        lerpDancer.lerpDef.fromFrame = Math.floor(loopFrame/10) % framesPerPerson[lerpDancer.lerpDef.fromDancer]
        lerpDancer.lerpDef.toFrame = Math.floor(loopFrame/10) % framesPerPerson[lerpDancer.lerpDef.toDancer]
        lerpDancer.lerpDef.lerp = logisticSigmoid(slideProg / slideTime, 0.8)
        lerpDancer.updateLerp()
        loopFrame++

        bassVoice.pitch = lerp(bassPitches[lastTarget], bassPitches[bassNoteTarget], slideProg / slideTime)
        bassVoice.polyGain = paramMap.value.bassVol.val

        segmentDancer.setFrame(Math.floor(loopFrame/10) % framesPerPerson[segmentDancer.params.dancerName])
      }
    })

    launchLoop(async (ctx) => {
      await ctx.wait(0.1)
      randomPhraseDancer(segmentDancer, synth3, ctx)
    })

    appState.drawFunctions.push(() => {
      dancerScene.renderScene(dancerRenderTarget)
    })

    const canvasPaint = new CanvasPaint({ src: dancerRenderTarget })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })


  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
  clearDrawFuncs() //todo template - move this to cleanup block?
})

</script>

<template>
  <div>
    <label for="speed">Speed - midi cc: {{ paramMap.speed.midiCC }}</label> 
    <br/>
    <input type="range" v-model.number="paramMap.speed.val" :min="paramMap.speed.min" :max="paramMap.speed.max" :step="0.01" />
    <span>{{ paramMap.speed.val }}</span>
  </div>

  <div>
    <label for="activeChord">Active Chord - midi cc: {{ paramMap.activeChord.midiCC }}</label>
    <br/>
    <input type="range" v-model.number="paramMap.activeChord.val" :min="paramMap.activeChord.min" :max="paramMap.activeChord.max" />
    <span>{{ paramMap.activeChord.val }}</span>
  </div>

  <div>
    <label for="filterFreq">Filter Freq - midi cc: {{ paramMap.filterFreq.midiCC }}</label>
    <br/>
    <input type="range" v-model.number="paramMap.filterFreq.val" :min="paramMap.filterFreq.min" :max="paramMap.filterFreq.max" />
    <span>{{ paramMap.filterFreq.val }}</span>
  </div>

  <div>
    <label for="release">Release - midi cc: {{ paramMap.release.midiCC }}</label>
    <br/>
    <input type="range" v-model.number="paramMap.release.val" :min="paramMap.release.min" :max="paramMap.release.max" :step="0.01" />
    <span>{{ paramMap.release.val }}</span>
  </div>

  <div>
    <label for="bassNote">Bass Note - midi cc: {{ paramMap.bassNote.midiCC }}</label>
    <br/>
    <input type="range" v-model.number="paramMap.bassNote.val" :min="paramMap.bassNote.min" :max="paramMap.bassNote.max" />
    <span>{{ paramMap.bassNote.val }}</span>
  </div>

  <div>
    <label for="bassVol">Bass Vol - midi cc: {{ paramMap.bassVol.midiCC }}</label>
    <br/>
    <input type="range" v-model.number="paramMap.bassVol.val" :min="paramMap.bassVol.min" :max="paramMap.bassVol.max" :step="0.01" />
    <span>{{ paramMap.bassVol.val }}</span>
  </div>
</template>

<style scoped></style>
