<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { AbletonClip, clipMap, INITIALIZE_ABLETON_CLIPS } from '@/io/abletonClips';
import { MIDI_READY, midiOutputs } from '@/io/midi';
import { Scale } from '@/music/scale';
import { getPiano } from '@/music/synths';
import { m2f } from '@/music/mpeSynth';

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

const mod2 = (n: number, m: number) =>  (n % m + m) % m

onMounted(async() => {
  try {

    await MIDI_READY
    await INITIALIZE_ABLETON_CLIPS('src/sketches/sonar_sketch/piano_melodies Project/piano_melodies.als') //todo - reuse

    let scale = new Scale()
    const cHarmonicMajorScale = new Scale([0, 2, 4, 5, 7, 8, 11, 12], 60)

    const iac1 = midiOutputs.get('IAC Driver Bus 1')!!
    const iac2 = midiOutputs.get('IAC Driver Bus 2')!!
    const iac3 = midiOutputs.get('IAC Driver Bus 3')!!
    const iac4 = midiOutputs.get('IAC Driver Bus 3')!!

    const drum0 = () => clipMap.get('drum0')!!.clone()


    const playNoteMidi = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, inst = iac1) => {
      inst.sendNoteOn(pitch, velocity)
      ctx?.branch(async ctx => {
        await ctx?.wait((noteDur ?? 0.1) * 0.98)
        inst.sendNoteOff(pitch)
      })
    }

    const pianos = Array.from({ length: 10 }, (_, i) => getPiano())

    const playNotePiano = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, pianoIndex = 0) => {
      const piano = pianos[mod2(pianoIndex, pianos.length)]
      piano.triggerAttackRelease([m2f(pitch)], '16n', null, velocity)
    }

    const playNote = playNoteMidi

    const playClip= async (clip: AbletonClip, ctx: TimeContext, midiOut = iac1) => {
      let notes = clip.noteBuffer() //todo - reuse
      for (const [i, nextNote] of notes.entries()) { //todo - reuse
        await ctx.wait(nextNote.preDelta)
        playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, midiOut)
        if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
      }
    }







    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement
    
    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)
    
    appState.drawFunctions.push((p: p5) => {
    })

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

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
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>