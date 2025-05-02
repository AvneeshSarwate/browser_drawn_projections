<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { MIDI_READY, midiOutputs } from '@/io/midi';
import { launchSC, SuperColliderTimeContext } from '@/channels/supercolliderTimeContext';

const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: SuperColliderTimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launchSC(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

function circleArr(n: number, rad: number, p: p5) {
  const center = { x: p.width / 2, y: p.height / 2 }
  const sin1 = (x: number) => Math.sin(x * 2 * Math.PI)
  const cos1 = (x: number) => Math.cos(x * 2 * Math.PI)
  return xyZip(0, cos1, sin1, n).map(({ x, y }) => ({x: x*rad + center.x, y: y*rad + center.y}))
}

onMounted(async () => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const initialCiclePos = appState.circles.list.map(c => ({ x: c.x, y: c.y }))

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = async () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?


      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      shaderGraphEndNode = canvasPaint
      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })

      await MIDI_READY

      const midiOut = midiOutputs.get("IAC Driver Bus 1")!!

      launchLoop(async (ctx) => {

        const start = Date.now()
        await ctx.initialBeatSync()
        console.log("initialBeatSync done", ((Date.now() - start)/1000).toFixed(3), ctx.time.toFixed(3))
        // ctx.time = 0

        ctx.branch(async (ctx) => {
          console.log("branch 1 time", ctx.time.toFixed(3))
          while(true) {
            await ctx.wait(1)
            // console.log("wait 1")
            ctx.branch(async (ctx) => {
              const note = 60 + Math.floor(Math.random() * 12)
              midiOut.sendNoteOn(note, 80)
              await ctx.wait(0.2)
              midiOut.sendNoteOff(note)
            })
          }
        })

        ctx.branch(async (ctx) => {
          console.log("branch 2 time", ctx.time.toFixed(3))
          while(true) {
            await ctx.wait(1)
            ctx.branch(async (ctx) => {
              const note = 48 + Math.floor(Math.random() * 12)
              midiOut.sendNoteOn(note, 80)
              await ctx.wait(0.2)
              midiOut.sendNoteOff(note)
            })
          }
        })

      })
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