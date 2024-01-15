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

    let prog = progGen(cHarmonicMajorScale, [0, 2, 4, 3, 6, 5, 8, 7], [0, 2, 6, 8])


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

    const RUNNING = true

    const mod2 = (n: number, m: number) =>  (n % m + m) % m

    // eslint-disable-next-line no-inner-declarations
    function invertChord(chord: number[], inversions: number): number[] {
      const root = Math.min(...chord)
      const pitchSet = new Set(chord)
      const orderedPitches = Array.from(pitchSet).sort()
      const indices = orderedPitches.map(p => chord.indexOf(p))

      const deltas = chord.map(n => n - root).map(d => mod2(d, 12))
      const deltaSet = new Set(deltas)
      deltaSet.add(12)
      const intervals = Array.from(deltaSet).sort((a, b) => a - b)
      console.log(intervals)

      const scale = new Scale(intervals, root).invert(inversions)

      return scale.getMultiple(indices)
    }

    console.log("inversion", invertChord([62, 61, 60], 2))
    
    const code = () => {
      clearDrawFuncs()

      let noteWait = 0.3
      let velocity = 100
      let shuffleSeed = 2
      launchLoop(async ctx => {
        while (RUNNING) {
          await ctx.waitFrame()
          noteWait = 0.1 + sinN(Date.now() / 1000 * 0.02) * 0.3 
          velocity = sinN(Date.now() / 1000 * 0.17) * 30 + 80
          shuffleSeed = Math.floor(1 + sinN(Date.now() / 1000 * 0.13) * 5)
        }
      })

      launchLoop(async (ctx) => {
        ctx.bpm = 90
        while (RUNNING) {
          const randProgStart = Math.floor(Math.random() * prog.length/2)
          const randProdLen = Math.floor(Math.random() * 4) + 1
          let useFull = Math.random() > 0.5 
          let useHarmonic = Math.random() > 0.5
          prog = progGen(useHarmonic ? cHarmonicMajorScale : cMajScale, [0, 2, 4, 3, 6, 5, 8, 7], [0, 2, 6, 8])
          const progSlice = useFull ? prog : prog.slice(randProgStart, randProgStart + randProdLen)
          console.log(randProgStart, randProdLen)
          for (let i = 0; i < progSlice.length; i++) {
            const chord = invertChord(shuffle(progSlice[i], shuffleSeed), shuffleSeed-2)
            const vel = velocity + Math.random() * 10

            playPitchSeq(chord, vel, ctx, noteWait, 2)

            await ctx.wait(1)
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
  <div></div>
</template>

<style scoped></style>