<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type PulseCircleAppState, PulseCircle } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, targetNormalizedCoords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, EventChop, cos, sin } from '@/channels/channels';
import { listToClip, clipToDeltas, note } from '@/music/clipPlayback';
import { Scale } from '@/music/scale';
import { sampler } from '@/music/synths';

const appState = inject<PulseCircleAppState>('appState')!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

//todo template - currently need to change sketch module in App.vue, stateInitializer.ts, and OneShoteCode.vue - can this be consolidated?

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

function circleArr(n: number, rad: number, p: p5) {
  const center = { x: p.width / 2, y: p.height / 2 }
  const sin1 = (x: number) => Math.sin(x * 2 * Math.PI)
  const cos1 = (x: number) => Math.cos(x * 2 * Math.PI)
  return xyZip(0, cos1, sin1, n).map(({ x, y }) => ({ x: x * rad + center.x, y: y * rad + center.y }))
}

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const scale = new Scale()


    const baseDur = 0.125
    const baseSeq = [1, 3, 5, 6, 8, 10, 12]
    const circle0 = xyZip(0, cos, sin, baseSeq.length)
    const rad = 50


    const code = () => {

      mousedownEvent(ev => {

        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        const normCoords = targetNormalizedCoords(ev, ev.target as HTMLCanvasElement)
        
        const transposition = Math.floor(normCoords.y * 12)
        console.log("transposition", transposition)
        const seq = baseSeq.map(x => x + transposition)
        const evtDur = baseDur + normCoords.x

        const pitches = scale.getMultiple(seq)
        console.log("pitches", pitches)
        const mel = listToClip(pitches, evtDur)

        const evtChop = new EventChop<{ r: number, g: number, b: number, x: number, y: number }>
        const durs = clipToDeltas(mel)
        console.log("durs", durs)
        const drawFuncId = crypto.randomUUID()
        appState.drawFuncMap.set(drawFuncId, () => {
          evtChop.events.forEach(evt => {
            const { r, g, b, x, y } = evt.metadata
            p5i.push()
            p5i.fill(r * 255, g * 255, b * 255)
            p5i.circle(x, y, 40 * (1 - evt.evt.val()))
            p5i.pop()
          })
        })

        const r = () => Math.random()


        launch(async ctx => {
          for (let i = 0; i < mel.length; i++) {
            const dur = durs[i]
            await ctx.wait(dur)
            const x = circle0[i].x * rad + p5xy.x
            const y = circle0[i].y * rad + p5xy.y
            const evtData = { r: p5xy.x / p5i.width, g: p5xy.y / p5i.height, b: r(), x, y }
            evtChop.ramp(evtDur * 4, evtData)
            const { pitch, duration, velocity } = mel[i]
            note(sampler, pitch, duration, velocity)
            // console.log("playing note", (Date.now() / 1000).toFixed(2), evtData)
          }
          await ctx.wait(evtDur * 4)
          appState.drawFuncMap.delete(drawFuncId)
        })
      }, threeCanvas)

      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      shaderGraphEndNode = canvasPaint
      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)

      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
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