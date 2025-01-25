<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import * as THREE from "three";
import { type TemplateAppState, PulseCircle, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { createDancerScene } from './dancerInitializer';
import { notePulse } from "./audiovisualProcesses";
import { FAUST_AUDIO_CONTEXT_READY, MPEPolySynth } from "@/music/mpeSynth";
import { FaustTestVoice } from "@/music/FaustSynthTemplate";
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
    {dancer: dancerScene.createDancer("kurush", 200, {x: 100, y: 200}), chord: [47, 48]},
      {dancer: dancerScene.createDancer("chloe", 200, {x: 200, y: 200}), chord: [48, 55]},
      {dancer: dancerScene.createDancer("chris", 200, {x: 300, y: 200}), chord: [55, 59]},
      {dancer: dancerScene.createDancer("iman", 200, {x: 400, y: 200}), chord: [55, 65]},
      {dancer: dancerScene.createDancer("aroma", 200, {x: 500, y: 200}), chord: [58, 65]}
    ]

    const chordPulseData = {
      dcMap: dancerChords,
      activeChord: 1,
      speed: 0.125,
      stop: false
    }

    launchLoop(async (ctx) => {
      while(true) {
        await ctx.waitFrame()
        chordPulseData.speed = speed.value
        chordPulseData.activeChord = selectedDancerIndex.value
      }
    })

    await FAUST_AUDIO_CONTEXT_READY
    const synth = new MPEPolySynth(FaustTestVoice, 32, false, true)
    await synth.synthReady()

    synth.setParam('release', 0.15)
    synth.setParam('polyGain', 0.2)
    synth.setParam('Filter', 1500)

    launchLoop(async (ctx) => {
      await ctx.wait(0.1)
      notePulse(chordPulseData, synth, ctx)
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
</template>

<style scoped></style>