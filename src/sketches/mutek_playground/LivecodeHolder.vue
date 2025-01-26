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
import { notePulse } from "./audiovisualProcesses";
import { FAUST_AUDIO_CONTEXT_READY, MPEPolySynth } from "@/music/mpeSynth";
import { FaustTestVoice } from "@/music/FaustSynthTemplate";
import { logisticSigmoid } from "@/rendering/logisticSigmoid";
import { lerp } from "three/src/math/MathUtils.js";
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

const selectedDancerIndex = ref(1)
const speed = ref(0.125)
const filterFreq = ref(1500) //lerp outline to circle based on filter
const release = ref(0.15) //pulse outlien out based on release
const bassNote = ref(0)
const bassVol = ref(0.5)

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

    await FAUST_AUDIO_CONTEXT_READY
    const synth = new MPEPolySynth(FaustTestVoice, 32, false, true)
    const synth2 = new MPEPolySynth(FaustTestVoice, 2, false, true)
    await synth.synthReady()
    await synth2.synthReady()

    synth.setParam('release', 0.15)
    synth.setParam('polyGain', 0.2)
    synth.setParam('Filter', 1500)

    const bassPitches = [36, 38, 40, 41, 43, 45, 47, 48]
    const bassDancers = people.slice(10, 18)
    const bassVoice = synth2.noteOn(bassPitches[bassNote.value], 100, 0, 0)
    bassVoice.polyGain = bassVol.value
    bassVoice.Filter = 600

    const lerpDancer = dancerScene.createDancer(bassDancers[bassNote.value], 500, {x: 150, y: 250})
    lerpDancer.group.position.z = 1
    lerpDancer.quadVisible(false)
    lerpDancer.lerpDef.lerping = true
    lerpDancer.lerpDef.fromDancer = bassDancers[bassNote.value]
    lerpDancer.lerpDef.toDancer = bassDancers[bassNote.value]
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

    let bassNoteTarget = bassNote.value
    let lastTarget = bassNoteTarget
    const slideTime = 120
    let slideProg = 0
    let loopFrame = 0
    launchLoop(async (ctx) => {
      while(true) {
        await ctx.waitFrame()
        chordPulseData.speed = speed.value
        chordPulseData.activeChord = selectedDancerIndex.value
        synth.setParam('Filter', filterFreq.value)
        synth.setParam('release', release.value)

        //slider sets target bass note, and this loop 
        //interpolates towards the target note over about 10 frames.
        //each note has it's own dancer, and the dancers interpolate along with the notes

        if(bassNoteTarget !== bassNote.value) {
          lastTarget = bassNoteTarget
          bassNoteTarget = bassNote.value
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
        bassVoice.polyGain = bassVol.value

        segmentDancer.setFrame(Math.floor(loopFrame/10) % framesPerPerson[segmentDancer.params.dancerName])
      }
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
    <label for="speed">Speed</label>
    <input type="range" v-model.number="speed" :min="0" :max="1" :step="0.01" />
    <span>{{ speed }}</span>
  </div>

  <div>
    <label for="activeChord">Active Chord</label>
    <input type="range" v-model.number="selectedDancerIndex" :min="0" :max="4" />
    <span>{{ selectedDancerIndex }}</span>
  </div>

  <div>
    <label for="filterFreq">Filter Freq</label>
    <input type="range" v-model.number="filterFreq" :min="0" :max="10000" />
    <span>{{ filterFreq }}</span>
  </div>

  <div>
    <label for="release">Release</label>
    <input type="range" v-model.number="release" :min="0" :max="1" :step="0.01" />
    <span>{{ release }}</span>
  </div>

  <div>
    <label for="bassNote">Bass Note</label>
    <input type="range" v-model.number="bassNote" :min="0" :max="7" />
    <span>{{ bassNote }}</span>
  </div>

  <div>
    <label for="bassVol">Bass Vol</label>
    <input type="range" v-model.number="bassVol" :min="0" :max="1" :step="0.01" />
    <span>{{ bassVol }}</span>
  </div>
</template>

<style scoped></style>
