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
import { Scale } from "@/music/scale";
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
  mainVolume: {val: 0.5, min: 0, max: 1, midiCC: -1, quantize: false},
  chordVolume: {val: 0.3, min: 0, max: 1, midiCC: 9, quantize: false},
  activeChord: {val: 1, min: 0, max: 4, midiCC: 1, quantize: true},
  chordSpeed: {val: 0.5, min: 0, max: 1, midiCC: 2, quantize: false},
  chordFilter: {val: 3000, min: 0, max: 10000, midiCC: 3, quantize: false},
  chordRelease: {val: 0.15, min: 0, max: 1, midiCC: 4, quantize: false},
  bassNote: {val: 0, min: 0, max: 7, midiCC: 5, quantize: true},
  bassVol: {val: 0.5, min: 0, max: 1, midiCC: 7, quantize: false},
  bassFilterLfoRate: {val: 0.1, min: 0, max: 1, midiCC: 16, quantize: false},
  melodyVol: {val: 0.3, min: 0, max: 1, midiCC: 8, quantize: false},
  melodyEchoFdbk: {val: 0.5, min: 0, max: 0.95, midiCC: 11, quantize: false},
  melodyEchoTime: {val: 0.33, min: 0.01, max: 1, midiCC: 12, quantize: false},
  melodyNoWaitProb: {val: 0.2, min: 0, max: 1, midiCC: 13, quantize: false},
  melodyBaseSpeed: {val: 0.5, min: 0, max: 1, midiCC: 14, quantize: false},
  melodyRoot5Prob: {val: 0.2, min: 0, max: 1, midiCC: 15, quantize: false},
}
const paramMap = ref(paramDef)

const randomizeParams = () => {
  Object.keys(paramDef).forEach((key: keyof typeof paramDef) => {
    if(key === "mainVolume") return
    const val = Math.random() * (paramDef[key].max - paramDef[key].min) + paramDef[key].min
    paramMap.value[key].val = paramDef[key].quantize ? Math.round(val) : val
  })
}

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

    // have 6 diff 7th chords, and with some low probability (0.2), play an inversion/subset with 3 notes
    //root degrees, 7 1 3 4 5 6?
    //be opinionated about the inversions? don't want this to sound like a practice backing track generator
    const scale = new Scale(null, 48)
    const dancerChords = [
      {dancer: dancerScene.createDancer("kurush", 200, {x: 300, y: 200}), chord: scale.getMultiple([-1, 1, 3, 5])}, 
      {dancer: dancerScene.createDancer("chloe", 200, {x: 400, y: 200}), chord: scale.getMultiple([0, 2, 4, 6])}, 
      {dancer: dancerScene.createDancer("chris", 200, {x: 500, y: 200}), chord: scale.getMultiple([1, 3, 5, 7])}, 
      {dancer: dancerScene.createDancer("iman", 200, {x: 600, y: 200}), chord: scale.getMultiple([2, 4, 6, 8])}, 
      {dancer: dancerScene.createDancer("aroma", 200, {x: 700, y: 200}), chord: scale.getMultiple([3, 5, 7, 9])} 
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
    const chordSynth = new MPEPolySynth(FaustTestVoice, 32, false, true)
    const bassSynth = new MPEPolySynth(FaustTestVoice, 2, false, true)
    const melodySynth = new MPEPolySynth(FMChorusVoice, 2, false, true)
    await chordSynth.synthReady()
    await bassSynth.synthReady()
    await melodySynth.synthReady()

    melodySynth.setParam('polyGain', 0.3)

    chordSynth.setParam('release', 0.15)
    chordSynth.setParam('polyGain', 0.2)
    chordSynth.setParam('Filter', 1500)

    const bassPitches = [36, 38, 40, 41, 43, 45, 47, 48]
    const bassDancers = people.slice(10, 18)
    bassSynth.setParam('Filter', 600)
    const bassVoice = bassSynth.noteOn(bassPitches[paramMap.value.bassNote.val], 100, 0, 0)
    bassVoice.polyGain = paramMap.value.bassVol.val
    // bassVoice.Filter = 1200

    const lerpDancer = dancerScene.createDancer(bassDancers[paramMap.value.bassNote.val], 500, {x: 150, y: 250})
    lerpDancer.group.position.z = 1
    lerpDancer.quadVisible(false)
    lerpDancer.lerpDef.lerping = true
    lerpDancer.lerpDef.fromDancer = bassDancers[paramMap.value.bassNote.val]
    lerpDancer.lerpDef.toDancer = bassDancers[paramMap.value.bassNote.val]
    lerpDancer.lerpDef.fromFrame = 0
    lerpDancer.lerpDef.toFrame = 0

    const segmentDancer = dancerScene.createDancer("chris", 500, {x: 900, y: 200})
    segmentDancer.params.dancerName = 'rupal'
    segmentDancer.quadVisible(false)
    segmentDancer.regionsVisible(true)
    segmentDancer.lineVisible(false)

    launchLoop(async (ctx) => {
      await ctx.wait(0.1)
      notePulse(chordPulseData, chordSynth, ctx)
    })

    let bassNoteTarget = paramMap.value.bassNote.val
    let lastTarget = bassNoteTarget
    const slideTime = 120
    let slideProg = 0
    let loopFrame = 0
    let bassFilterLfoTime = 0
    launchLoop(async (ctx) => {
      while(true) {
        await ctx.waitFrame()

        chordPulseData.speed = 0.05 + (1- paramMap.value.chordSpeed.val)**2
        chordPulseData.activeChord = paramMap.value.activeChord.val
        chordSynth.setParam('Filter', paramMap.value.chordFilter.val)
        chordSynth.setParam('release', paramMap.value.chordRelease.val)
        

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
        bassFilterLfoTime += paramMap.value.bassFilterLfoRate.val
        bassVoice.Filter = 600 + sinN(bassFilterLfoTime * 0.08)**2 * 3000
        lerpDancer.line.material.linewidth = 2 + sinN(bassFilterLfoTime * 0.08)*5


        
        segmentDancer.setFrame(Math.floor(loopFrame/10) % framesPerPerson[segmentDancer.params.dancerName])

        melodySynth.setParam('echoFdbk', paramMap.value.melodyEchoFdbk.val)
        melodySynth.setParam('echoTime', paramMap.value.melodyEchoTime.val ** 1.7)

        const MAIN_VOLUME = paramMap.value.mainVolume.val
        bassVoice.polyGain = paramMap.value.bassVol.val * MAIN_VOLUME
        chordSynth.setParam('polyGain', paramMap.value.chordVolume.val * MAIN_VOLUME)
        melodySynth.setParam('polyGain', paramMap.value.melodyVol.val * MAIN_VOLUME)
      }
    })

    launchLoop(async (ctx) => {
      await ctx.wait(0.1)
      const params = {
        noWaitProb: paramMap.value.melodyNoWaitProb,
        baseSpeed: paramMap.value.melodyBaseSpeed,
        root5Prob: paramMap.value.melodyRoot5Prob
      }
      randomPhraseDancer(segmentDancer, melodySynth, params, ctx)
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
  <div id="startScreen">
    click anywhere to start
  </div>
  <button id="randomizeParams" @click="randomizeParams">Randomize Params</button>
  <div style="margin-left: 10px;">
    <label for="mainVolume">Main Volume - midi cc: {{ paramMap.mainVolume.midiCC }}</label>
    <br/>
    <input type="range" v-model.number="paramMap.mainVolume.val" :min="paramMap.mainVolume.min" :max="paramMap.mainVolume.max" :step="0.01" />
    <span>{{ paramMap.mainVolume.val.toFixed(2) }}</span>
  </div>

  <div id="paramControls">
    <div class="paramColumn">
      <h3>Chord parameters</h3>
      <div>
        <label for="chordVolume">Chord Volume - midi cc: {{ paramMap.chordVolume.midiCC }}</label> 
        <br/>
        <input type="range" v-model.number="paramMap.chordVolume.val" :min="paramMap.chordVolume.min" :max="paramMap.chordVolume.max" :step="0.01" />
        <span>{{ paramMap.chordVolume.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="chordSpeed">Chord Speed - midi cc: {{ paramMap.chordSpeed.midiCC }}</label> 
        <br/>
        <input type="range" v-model.number="paramMap.chordSpeed.val" :min="paramMap.chordSpeed.min" :max="paramMap.chordSpeed.max" :step="0.01" />
        <span>{{ paramMap.chordSpeed.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="activeChord">Active Chord - midi cc: {{ paramMap.activeChord.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.activeChord.val" :min="paramMap.activeChord.min" :max="paramMap.activeChord.max" />
        <span>{{ paramMap.activeChord.val }}</span>
      </div>

      <div>
        <label for="chordFilter">Chord Filter - midi cc: {{ paramMap.chordFilter.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.chordFilter.val" :min="paramMap.chordFilter.min" :max="paramMap.chordFilter.max" />
        <span>{{ paramMap.chordFilter.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="chordRelease">Chord Release - midi cc: {{ paramMap.chordRelease.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.chordRelease.val" :min="paramMap.chordRelease.min" :max="paramMap.chordRelease.max" :step="0.01" />
        <span>{{ paramMap.chordRelease.val.toFixed(2) }}</span>
      </div>
    </div>

    <div class="paramColumn">
      <h3>Bass parameters</h3>
      <div>
        <label for="bassVol">Bass Vol - midi cc: {{ paramMap.bassVol.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.bassVol.val" :min="paramMap.bassVol.min" :max="paramMap.bassVol.max" :step="0.01" />
        <span>{{ paramMap.bassVol.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="bassNote">Bass Note - midi cc: {{ paramMap.bassNote.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.bassNote.val" :min="paramMap.bassNote.min" :max="paramMap.bassNote.max" />
        <span>{{ paramMap.bassNote.val }}</span>
      </div>

      <div>
        <label for="bassFilterLfoRate">Bass Filter Lfo Rate - midi cc: {{ paramMap.bassFilterLfoRate.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.bassFilterLfoRate.val" :min="paramMap.bassFilterLfoRate.min" :max="paramMap.bassFilterLfoRate.max" :step="0.01" />
        <span>{{ paramMap.bassFilterLfoRate.val.toFixed(2) }}</span>
      </div>
    </div>

    <div class="paramColumn">
      <h3>Melody parameters</h3>
      <div>
        <label for="melodyVol">Melody Vol - midi cc: {{ paramMap.melodyVol.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.melodyVol.val" :min="paramMap.melodyVol.min" :max="paramMap.melodyVol.max" :step="0.01" />
        <span>{{ paramMap.melodyVol.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="melodyEchoFdbk">Melody Echo Fdbk - midi cc: {{ paramMap.melodyEchoFdbk.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.melodyEchoFdbk.val" :min="paramMap.melodyEchoFdbk.min" :max="paramMap.melodyEchoFdbk.max" :step="0.01" />
        <span>{{ paramMap.melodyEchoFdbk.val.toFixed(2) }}</span>
      </div>


      <div>
        <label for="melodyEchoTime">Melody Echo Time - midi cc: {{ paramMap.melodyEchoTime.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.melodyEchoTime.val" :min="paramMap.melodyEchoTime.min" :max="paramMap.melodyEchoTime.max" :step="0.01" />
        <span>{{ paramMap.melodyEchoTime.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="melodyNoWaitProb">Melody No Wait Prob - midi cc: {{ paramMap.melodyNoWaitProb.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.melodyNoWaitProb.val" :min="paramMap.melodyNoWaitProb.min" :max="paramMap.melodyNoWaitProb.max" :step="0.01" />
        <span>{{ paramMap.melodyNoWaitProb.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="melodyBaseSpeed">Melody Base Speed - midi cc: {{ paramMap.melodyBaseSpeed.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.melodyBaseSpeed.val" :min="paramMap.melodyBaseSpeed.min" :max="paramMap.melodyBaseSpeed.max" :step="0.01" />
        <span>{{ paramMap.melodyBaseSpeed.val.toFixed(2) }}</span>
      </div>

      <div>
        <label for="root5Prob">Root 5 Prob - midi cc: {{ paramMap.melodyRoot5Prob.midiCC }}</label>
        <br/>
        <input type="range" v-model.number="paramMap.melodyRoot5Prob.val" :min="paramMap.melodyRoot5Prob.min" :max="paramMap.melodyRoot5Prob.max" :step="0.01" />
        <span>{{ paramMap.melodyRoot5Prob.val.toFixed(2) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>

#startScreen {
  margin-top: 10px;
  margin-left: 10px;
}

#randomizeParams {
  margin-bottom: 10px;
  margin-left: 10px;
  margin-top: 10px;
}

#paramControls {
  display: flex;
  flex-direction: row;
  gap: 10px;
  margin-left: 10px;
}

.paramColumn {
  width: 250px;
}
</style>


