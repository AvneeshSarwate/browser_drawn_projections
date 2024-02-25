<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, type LoopHandle } from '@/channels/channels';
import { Scale } from '@/music/scale'
import { MIDI_READY, midiOutputs } from '@/io/midi';
import seedrandom from 'seedrandom'

import { lerp } from 'three/src/math/MathUtils.js';
import { brd, choiceNoReplaceN, weightedChoice } from '@/utils/utils';

import testJson from './test_json.json'
import { AbletonClip, INITIALIZE_ABLETON_CLIPS, clipMap } from '@/io/abletonClips';
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
    await INITIALIZE_ABLETON_CLIPS('src/sketches/musicAgentsTest/synths Project/meld_experiments.als')


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
    const iac4 = midiOutputs.get('IAC Driver Bus 4')!!
    const iac5 = midiOutputs.get('IAC Driver Bus 5')!!
    const iac6 = midiOutputs.get('IAC Driver Bus 6')!!
    const iac7 = midiOutputs.get('IAC Driver Bus 7')!!
    const iac8 = midiOutputs.get('IAC Driver Bus 8')!!

    const drum0 = () => clipMap.get('drum0')!!.clone()
    const bass = () => clipMap.get('bass')!!.clone()
    const mel = () => clipMap.get('mel')!!.clone()
    const high = () => clipMap.get('high')!!.clone()
    const liveClips = [drum0, bass, mel, high]

    const playNote = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, inst = iac1) => {
      if(!PLAYING.value) return
      // console.log("pitch play", pitch, velocity)
      inst.sendNoteOn(pitch, velocity)
      let noteIsOn = true
      ctx?.branch(async ctx => {
        await ctx?.wait((noteDur ?? 0.1) * 0.98)
        inst.sendNoteOff(pitch)
        noteIsOn = false
      }).finally(() => {
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

    const straightPlay = async (ctx: TimeContext, clip: () => AbletonClip) => {
      while (!ctx.isCanceled) {
        for (const [i, nextNote] of clip().noteBuffer().entries()) {
          // console.log("drum note", nextNote)
          await ctx.wait(nextNote.preDelta)
          playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, iac1)
          await ctx.wait(nextNote.postDelta ?? 0)
        }
      }
    }

    /**
     * 
     * todo feature - an RNG where you can set a flag for whether to return the last random value or not
     * - will let you have the same number across a set of invocations, useful for stuff like having all 
     * random slice calls over multiple loops/branches all return the same slice area relative to their root clip
     * 
     * in general, think about ergonomic + musically relevant ways to communicate/coordinate across voices
     */

    const sliceFill = async (ctx: TimeContext, clip: () => AbletonClip) => {
      let progInd = 0
      while (!ctx.isCanceled) {
        const clipInstance = clip()
        let beat = clipInstance

        if (clipInstance.duration >= 4) {
          const straight = clipInstance.timeSlice(0, 2)
          const fill = Math.random() > 0.5 ? clipInstance.timeSlice(2, 4) : clipInstance.timeSlice(1, 3)
          beat = progInd % 2 == 0 ? straight : fill
        }

        for (const [i, nextNote] of beat.noteBuffer().entries()) {
          // console.log("drum note", nextNote)
          await ctx.wait(nextNote.preDelta)
          playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, iac4)
          await ctx.wait(nextNote.postDelta ?? 0)
        }
        progInd++
      }
    }

    const twoBeatRandSlice = async (ctx: TimeContext, clip: () => AbletonClip) => {
      while (!ctx.isCanceled) {
        const scale = 1
        const clipInstance = clip()

        let startBeat = Math.floor(Math.random() * (clipInstance.duration - 2))
        startBeat = startBeat < 0 ? 0 : startBeat

        let duration = clipInstance.duration < 2 ? clipInstance.duration : 2

        const melSlice = clip().timeSlice(startBeat, startBeat + duration)
        for (const [i, nextNote] of melSlice.noteBuffer().entries()) {
          // console.log("drum note", nextNote)
          await ctx.wait(nextNote.preDelta * scale)
          playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration * scale, iac5)
          await ctx.wait(nextNote.postDelta ?? 0 * scale)
        }
      }
    }

    const playTypes = [straightPlay, sliceFill, twoBeatRandSlice]

    const drumLoop = async (ctx: TimeContext) => sliceFill(ctx, drum0)

    const bassLoop = async (ctx: TimeContext) => straightPlay(ctx, bass)
    
    const melLoop = async (ctx: TimeContext) => straightPlay(ctx, mel)
    
    const melSliceLoop = async (ctx: TimeContext) => twoBeatRandSlice(ctx, mel)
    
    const highLoop = async (ctx: TimeContext) => straightPlay(ctx, high)

    const loops = [drumLoop, bassLoop, melLoop, melSliceLoop, highLoop]

    console.log("inversion", invertChord([62, 61, 60], 2))


    type AgentMessage = {
      type: string
      numbers: number[]
      strings: string[]
    }

    class Agent {
      name: string
      ctx: TimeContext
      runningLoop: LoopHandle | undefined
      handleMessage: (msg: AgentMessage) => void = () => {}
      play: () => void = () => { }
      constructor(ctx: TimeContext, name: string) {
        this.ctx = ctx
        this.name = name
      }
    }


    const syncableAgent = (ctx: TimeContext, name: string = 'syncableAgent') => {
      const agent = new Agent(ctx, name)
      agent.play = function() {
        this.runningLoop = this.ctx.branch(async ctx => straightPlay(ctx, drum0))
      }
      agent.handleMessage = function(msg: AgentMessage) {
        if (msg.type === 'sync') {
          this.runningLoop?.cancel()
          this.runningLoop = ctx.branch(async ctx => {
            await ctx.wait(msg.numbers[0])
            straightPlay(ctx, drum0)
          })
        }
      }
      return agent
    }
    
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


      let phraseCount = 0
      let phraseRepeatTime = 1
      launchLoop(async (ctx) => {
        ctx.bpm = 70

        while (RUNNING.value) {
          const numLoops = Math.floor(Math.random() * loops.length) + 1
          const loopsToRun = choiceNoReplaceN(loops, numLoops)
          const loopHandles = loopsToRun.map(loop => ctx.branch(loop))
          await ctx.wait(16)
          loopHandles.forEach(handle => handle.cancel())
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