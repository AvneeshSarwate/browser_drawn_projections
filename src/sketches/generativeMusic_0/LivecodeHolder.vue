<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { Scale } from '@/music/scale'
import { MIDI_READY, midiOutputs } from '@/io/midi';
import seedrandom from 'seedrandom'

import { HyperFormula } from 'hyperformula';

const options = {
    licenseKey: 'gpl-v3'
};

const hfInstance = HyperFormula.buildEmpty(options);
const sheetSize = 4
const sheetData: string[][] = new Array(sheetSize).fill(0).map(() => new Array(sheetSize).fill(""))
const testSheet = hfInstance.addSheet('test')
const testSheetId = hfInstance.getSheetId(testSheet)!!
hfInstance.setSheetContent(testSheetId, sheetData)
hfInstance.setCellContents({ col: 0, row: 0, sheet: testSheetId }, "5")
hfInstance.setCellContents({ col: 0, row: 1, sheet: testSheetId }, "=A1 * 2")
const initData = hfInstance.getCellValue({ col: 0, row: 1, sheet: testSheetId })

console.log("initData", initData)



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

let noteWait = appState.UIState.noteWait
let noteWaitUseLfo = appState.UIState.noteWaitUseLfo
let velocity = appState.UIState.velocity
let velocityUseLfo = appState.UIState.velocityUseLfo
let shuffleSeed = appState.UIState.shuffleSeed
let shuffleSeedUseLfo = appState.UIState.shuffleSeedUseLfo

const RUNNING = ref(true)
const PLAYING = ref(true)

onMounted(async () => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    const cMajScale = new Scale()
    const cHarmonicMajorScale = new Scale([0, 2, 4, 5, 7, 8, 11, 12], 60)

    // eslint-disable-next-line no-inner-declarations
    function progGen(scale: Scale, roots: number[], shape: number[]) {
      const shell9 = shape
      const prog = roots.map(r => scale.getShapeFromInd(r, shell9))
      return prog
    }
    const progRoots = [0, 2, 4, 3, 6, 5, 8, 7]
    const triad = [0, 2, 4]
    const shell9 = [0, 2, 6, 8]
    let shape = triad
    let prog = progGen(cHarmonicMajorScale, progRoots, shape)

    /**
     * use drums to root the rhythms 
     * miles okazaki - open music experiments
     * kim cass - bassist - playing with subdivisions to change feel of tempo 
     * 
     * when playing with guitar, can have midi switch the guitar tone/fx in corrdination
     * with the generative scheme (or even switch the harmonizer with the key change)
     */


    await MIDI_READY

    const iac1 = midiOutputs.get('IAC Driver Bus 1')!!

    const playNote = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number) => {
      iac1.sendNoteOn(pitch, velocity)
      ctx?.branch(async ctx => {
        await ctx?.wait((noteDur ?? 0.1) * 0.98)
        iac1.sendNoteOff(pitch)
      })
    }

    const playPitchSeq = (pitches: number[], velocity: number, ctx: TimeContext, rollTime: number, noteDur: number) => {
      ctx?.branch(async ctx => {
        for (let i = 0; i < pitches.length; i++) {
          playNote(pitches[i], velocity, ctx, noteDur)
          await ctx?.wait(rollTime)
        }
      })
    }

    const shuffle = <T,>(list: T[], seed: number = 2): T[] => {
      const rng = seedrandom(seed.toString())
      let m = list.length, t: T, i: number;
      let listCopy = list.slice()
      while (m) {
        i = Math.floor(rng() * m--);
        t = listCopy[m];
        listCopy[m] = listCopy[i];
        listCopy[i] = t;
      }
      return listCopy;
    }

    const mod2 = (n: number, m: number) =>  (n % m + m) % m

    // eslint-disable-next-line no-inner-declarations
    function invertChord(chord: number[], inversions: number): number[] { //todo - can be way simpler - just shift highest/lowest by 12 in a for loop
      const root = Math.min(...chord)
      const pitchSet = new Set(chord)
      const orderedPitches = Array.from(pitchSet).sort()
      const indices = orderedPitches.map(p => chord.indexOf(p))

      const deltas = chord.map(n => n - root).map(d => mod2(d, 12))
      const deltaSet = new Set(deltas)
      deltaSet.add(12)
      const intervals = Array.from(deltaSet).sort((a, b) => a - b)
      // console.log(intervals)

      const scale = new Scale(intervals, root).invert(inversions)

      return scale.getMultiple(indices)
    }

    console.log("inversion", invertChord([62, 61, 60], 2))
    
    const code = () => {
      clearDrawFuncs()

      launchLoop(async ctx => {
        while (RUNNING.value) {
          await ctx.waitFrame()
          if(noteWaitUseLfo.value) noteWait.value = 0.1 + sinN(Date.now() / 1000 * 0.02) * 0.3 
          if(velocityUseLfo.value) velocity.value = sinN(Date.now() / 1000 * 0.17) * 30 + 50
          if(shuffleSeedUseLfo.value) shuffleSeed.value = Math.floor(1 + sinN(Date.now() / 1000 * 0.13) * 5)
        }
      })

      /**
       * todo sketch:
       *  - have some nice modularized LFO state/type/UI-component
       *  - have LFOs run based on loop context time (and make sure a root context always starts at 0)
       *  - take all Math.random calls and convert them to some kind of LFO or at least add a way to pause randomness and manually set them
       * 
       * musical
       *  - more musically considered approach to chord progression slicing
       *    - do it in such a way that you can practice playing over the changes 
       *      (or at least make it structured enought that a "live score" is reasonably playable)
       *  - a mode where the rhythm is flat/straight 16ths
       * 
       * add visuals
       *  - colors pallete for different scale or chord shapes 
       *  - color variation for the other of scale/chord shape
       *  - some type of complex shape(s) with interlocking movements for bass+melody for a single "two hand phrase"
       */

      let phraseCount = 0
      let phraseRepeatTime = 1
      launchLoop(async (ctx) => {
        ctx.bpm = 90
        while (RUNNING.value) {
          const randProgStart = Math.floor(Math.random() * prog.length/2)
          const randProdLen = Math.floor(Math.random() * 4) + 1
          let useFull = Math.random() > 0.5 
          let useHarmonic = Math.random() > 0.5
          let useTriads = phraseCount % 32 < 8
          prog = progGen(useHarmonic ? cHarmonicMajorScale : cMajScale, progRoots, useTriads ? triad : shell9)
          const progSlice = useFull ? prog : prog.slice(randProgStart, randProgStart + randProdLen)
          // console.log(randProgStart, randProdLen)
          for (let i = 0; i < progSlice.length; i++) {
            const chord = invertChord(shuffle(progSlice[i], shuffleSeed.value), shuffleSeed.value - 2)
            const velJit = velocity.value + Math.random() * 10
            const vel = Math.min(velJit, 127)

            if (PLAYING.value) {
              playPitchSeq(chord, vel, ctx, noteWait.value, 2)
              let numBassNotes = phraseCount % 4 == 0 ? 2 : 1
              const sorted = chord.map(n => n - 24).sort((a, b) => a - b).slice(0, numBassNotes)
              // console.log("sorted", sorted)
              // playNote(Math.min(...chord)-24, vel, ctx, noteWait.value * chord.length)
              playPitchSeq(sorted, vel, ctx, phraseRepeatTime / numBassNotes, 2)
            } 
            

            await ctx.wait(phraseRepeatTime)
            phraseCount++
          }
        }
      })

      // const passthru = new Passthru({ src: p5Canvas })
      // const canvasPaint = new CanvasPaint({ src: passthru })

      // shaderGraphEndNode = canvasPaint
      // appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
      // singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
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
    <!-- create sliders for noteWait -->
    <div>
      <input type="checkbox" id="noteWaitLfo" v-model="noteWaitUseLfo">
      <label for="noteWaitLfo">lfo</label>
      <input type="range" min="0" max="1" step="0.01" id="noteWait" v-model.number="noteWait">
      <label for="noteWait">Note Wait</label>
      <br>
      <input type="checkbox" id="velocityLfo" v-model="velocityUseLfo">
      <label for="velocityLfo">lfo</label>
      <input type="range" min="0" max="127" step="1" id="velocity" v-model.number="velocity">
      <label for="velocity">Velocity</label>
      <br>
      <input type="checkbox" id="shuffleSeedLfo" v-model="shuffleSeedUseLfo">
      <label for="shuffleSeedLfo">lfo</label>
      <input type="range" min="1" max="6" step="1" id="shuffleSeed" v-model.number="shuffleSeed">
      <label for="shuffleSeed">Shuffle Seed</label>
      <br>
      <input type="checkbox" id="running" v-model="RUNNING">
      <label for="running">Running</label>
      <input type="checkbox" id="playing" v-model="PLAYING">
      <label for="playing">Playing</label>
    </div>
  </div>
</template>

<style scoped></style>