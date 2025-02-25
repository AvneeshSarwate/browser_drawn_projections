<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { FAUST_AUDIO_CONTEXT_READY, MPEPolySynth, type MPEVoiceGraph } from '@/music/mpeSynth';
import { WavefoldChorusVoice_clicks } from '@/music/WavefoldChorusSynth_clicks';

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



const playSynthNote = async <T extends MPEVoiceGraph>(note: number, velocity: number, duration: number, synth: MPEPolySynth<T>, ctx: TimeContext) => {
  const voice = synth.noteOn(note, velocity, 0, 0)
  ctx.branch(async () => {
    await ctx.wait(duration)
    synth.noteOff(voice)
  })
}

const playVoiceNote = async (note: number, velocity: number, duration: number, voice: MPEVoiceGraph, ctx: TimeContext) => {
  voice.noteOn(note, velocity, 0, 0)
  ctx.branch(async () => {
    await ctx.wait(duration)
    voice.noteOff()
  })
}

const displayText = ref('click to start')

onMounted(() => {
  try {


    const code = async () => { //todo template - is this code-array pattern really needed in the template?

      const pitches = [48, 50, 52, 53, 55, 57, 59, 60]
      await FAUST_AUDIO_CONTEXT_READY


      // const melodySynth = new MPEPolySynth(WavefoldChorusVoice_clicks, 1, false, true)
      // await melodySynth.synthReady()

      // launchLoop(async (ctx) => {
      //   let i = 0
      //   // eslint-disable-next-line no-constant-condition
      //   while(true) {
      //     await playSynthNote(pitches[i], 100, 0.125, melodySynth, ctx)
      //     i = (i + 1) % pitches.length
      //     await ctx.wait(0.5)
      //   }
      // })

      const voice = new WavefoldChorusVoice_clicks(0)
      await voice.ready()

      launchLoop(async (ctx) => {
        let i = 0
        // eslint-disable-next-line no-constant-condition
        while(true) {
          await playVoiceNote(pitches[i], 100, 0.125, voice, ctx)
          i = (i + 1) % pitches.length
          await ctx.wait(0.5)
        }
      })

      displayText.value = 'started'

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
  <div>
    {{ displayText }}
  </div>
</template>

<style scoped></style>