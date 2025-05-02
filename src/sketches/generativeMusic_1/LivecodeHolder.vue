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

import { lerp } from 'three/src/math/MathUtils.js';
import { brd, choice, weightedChoice } from '@/utils/utils';

import testJson from './test_json.json'
import { INITIALIZE_ABLETON_CLIPS, clipMap } from '@/io/abletonClips';
import { playClip } from '@/music/clipPlayback';

const j = testJson.key1

const options = {
    licenseKey: 'gpl-v3'
};




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
let noteLen = appState.UIState.noteLen
let noteLenUseLfo = appState.UIState.noteLenUseLfo

const RUNNING = ref(true)
const PLAYING = ref(false)

onMounted(async () => {
  try {

    await MIDI_READY
    await INITIALIZE_ABLETON_CLIPS('src/sketches/generativeMusic_1/synths Project/meld_experiments.als') //todo - reuse


    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    let scale = new Scale()
    const cHarmonicMajorScale = new Scale([0, 2, 4, 5, 7, 8, 11, 12], 60)

    // eslint-disable-next-line no-inner-declarations
    function progGen(scale: Scale, roots: number[], shape: number[]) {
      const shell9 = shape
      const prog = roots.map(r => scale.getShapeFromInd(r, shell9))
      return prog
    }
    const progRoots = [0, 1, 2, 9, 10]
    // const progRoots = [0, 1, 2, 9, 10].map(e => e + 1)
    // const progRoots = [0, 1, 2, 9, 10].map(e => e + 3)
    // const progRoots = [0, 1, 2, 9, 10].map(e => e + 5)
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

    const iac1 = midiOutputs.get('IAC Driver Bus 1')!!
    const iac2 = midiOutputs.get('IAC Driver Bus 2')!!
    const iac3 = midiOutputs.get('IAC Driver Bus 3')!!

    const drum0 = () => clipMap.get('drum0')!! //todo - reuse

    const playNote = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, inst = iac1) => {
      if(!PLAYING.value) return
      // console.log("pitch play", pitch, velocity)
      inst.sendNoteOn(pitch, velocity)
      ctx?.branch(async ctx => {
        await ctx?.wait((noteDur ?? 0.1) * 0.98)
        inst.sendNoteOff(pitch)
      })
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

    const drum = drum0().clone()
    const notes = drum.notes.map((e, i) => [i, drum.next()])
    console.log("notes", notes)
    
    const code = () => {
      clearDrawFuncs()

      launchLoop(async ctx => {
        while (RUNNING.value) {
          await ctx.waitFrame()
          if(noteWaitUseLfo.value) noteWait.value = 0.1 + sinN(Date.now() / 1000 * 0.02) * 0.3 
          if(velocityUseLfo.value) velocity.value = sinN(Date.now() / 1000 * 0.17) * 30 + 50
          if (shuffleSeedUseLfo.value) shuffleSeed.value = Math.floor(1 + sinN(Date.now() / 1000 * 0.13) * 5)
          if (noteLenUseLfo.value) noteLen.value = 0.05 + Math.pow(tri(Date.now() / 1000 * 0.07), 1) * .95
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
       *  - add more subdivisions and phrase types to the bass (or a counterpoint?) or counter point on middle voice
       * 
       * add visuals
       *  - colors pallete for different scale or chord shapes 
       *  - color variation for the other of scale/chord shape
       *  - some type of complex shape(s) with interlocking movements for bass+melody for a single "two hand phrase"
       */

      let quickPlay = (pitch: number, ctx: TimeContext, vel: number) => playNote(pitch, vel, ctx, noteLen.value, iac1)
      let progNote = (progInd: number, dev: number) => scale.getByIndex(progRoots[progInd % progRoots.length] + dev)

      let phraseCount = 0
      let phraseRepeatTime = 1
      launchLoop(async (ctx) => {
        ctx.bpm = 70

        ctx.branch(async ctx => {
          let loopCount = 0
          while (RUNNING.value) {
            const drum = drum0().clone()
            let notes = drum.noteBuffer() //todo - reuse
            if (loopCount % 2 == 0) {
              const sliceStartTime = choice([0, 1, 2, 3, 4, 5, 6, 7, 8].map(e => e * 0.25))
              const sliceEndTime = sliceStartTime + 1
              const slice = drum.timeSlice(sliceStartTime, sliceEndTime).loop(2)
              notes = slice.noteBuffer()
            }
            for (const [i, nextNote] of notes.entries()) { //todo - reuse
              // console.log("drum note", nextNote)
              await ctx.wait(nextNote.preDelta)
              playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, iac3)
              if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
            }
            loopCount++
          }
        })

        ctx.branch(async ctx => {
          while (RUNNING.value) {

            ctx.branch(async ctx => {
              let circ5 = [1, 5, 2, 6, 3, 7, 4].map(e => e-1)
              let circCount = Math.floor(phraseCount / progRoots.length / 2) % circ5.length
              scale = new Scale([0, 2, 4, 5, 7, 9, 11, 12], 60 +  circ5[circCount])

              const third = Math.random() < 0.5 ? 0 : 2
              quickPlay(progNote(phraseCount, -12 + third), ctx, velocity.value)

              quickPlay(progNote(phraseCount, 0), ctx, velocity.value)
              if (brd(0.3)) {
                ctx.branch(async ctx => {
                  if (brd(0.3)) await ctx.wait(phraseRepeatTime * 0.25)
                  quickPlay(progNote(phraseCount, 2), ctx, velocity.value)
                })
              }
              await ctx.wait(phraseRepeatTime * 0.5)
              if (brd(0.3)) quickPlay(progNote(phraseCount, 1), ctx, velocity.value)

            })
            // console.log("playing")
            phraseCount++
            await ctx.wait(phraseRepeatTime)
          }
        })
        let phraseCount2 = 0
        ctx.branch(async ctx => {
          while (RUNNING.value) {
            ctx.branch(async ctx => {
              quickPlay(progNote(phraseCount, 4), ctx, velocity.value * 0.7)
              if (brd(0.3)) quickPlay(progNote(phraseCount, 5), ctx, velocity.value * 0.7)

              await ctx.wait(phraseRepeatTime * 0.25)

              quickPlay(progNote(phraseCount, 6), ctx, velocity.value * 0.7)

              if (phraseCount % 4 == 0 && phraseCount2 % 2 == 0) {
                const numNotes = weightedChoice([
                  [1, 1],
                  [2, 0.5],
                  [3, 0.2],
                  [4, 0.1]
                ])
                const ascDec = brd(0.5)
                const dir = (i: number) => ascDec ? numNotes - i : i
                const notes = Array.from({ length: numNotes }, (e, i) => progNote(phraseCount, 9 + dir(i)))
                // console.log("notes", notes)
                ctx.branch(async ctx => {
                  for (const note of notes) {
                    playNote(note, lerp(velocity.value, 100, 0.5), ctx, phraseRepeatTime * 4, iac2)
                    await ctx.wait(phraseRepeatTime * 0.25)
                  }
                })
              }
              phraseCount2++

            })
            // console.log("playing")
            // phraseCount++
            await ctx.wait(phraseRepeatTime * 0.5)
          }
        })
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
      <input type="checkbox" id="noteLenLfo" v-model="noteLenUseLfo">
      <label for="noteLenLfo">lfo</label>
      <input type="range" min="0" max="2" step="0.01" id="noteLen" v-model.number="noteLen">
      <label for="noteLen">Note Length</label>
      <br>
      <input type="checkbox" id="running" v-model="RUNNING">
      <label for="running">Running</label>
      <input type="checkbox" id="playing" v-model="PLAYING">
      <label for="playing">Playing</label>
    </div>
  </div>
</template>

<style scoped></style>