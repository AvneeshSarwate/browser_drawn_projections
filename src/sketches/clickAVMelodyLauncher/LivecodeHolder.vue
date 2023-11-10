<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type ClickAVAppState } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, targetNormalizedCoords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, EventChop, cos, sin } from '@/channels/channels';
import { listToClip, clipToDeltas, note } from '@/music/clipPlayback';
import { Scale } from '@/music/scale';
import { sampler } from '@/music/synths';
import { HorizontalBlur, LayerBlend, VerticalBlur, Transform } from '@/rendering/customFX';

const appState = inject<ClickAVAppState>('appState')!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions.length = 0
  appState.drawFuncMap.clear()
}


onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const scale = new Scale(undefined, 48)


    const baseDur = 0.125
    const baseSeq = [1, 3, 5, 6, 8, 10, 12]
    const circle0 = xyZip(0, cos, sin, baseSeq.length)
    const rad = 50


    const code = () => {

      const mousePos = { x: 0, y: 0 }

      mousemoveEvent(ev => {
        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        mousePos.x = p5xy.x
        mousePos.y = p5xy.y
      }, threeCanvas)

      // sketchTodo - set this after shader passes somehow
      // appState.drawFunctions.push((p: p5) => {
      //   p.push()
      //   p.strokeWeight(2)
      //   p.stroke(255, 255, 255)
      //   p.line(mousePos.x, 0, mousePos.x, p.height)
      //   p.line(0, mousePos.y, p.width, mousePos.y)
      //   p.pop()
      // })

      const loopMap = new Map<string, CancelablePromisePoxy<any>>()
      const loopIdStack = [] as string[]

      mousedownEvent(ev => {

        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        const normCoords = targetNormalizedCoords(ev, ev.target as HTMLCanvasElement)
        
        const transposition = Math.floor(normCoords.y * 24)
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
        loopIdStack.push(drawFuncId)
        appState.drawFuncMap.set(drawFuncId, () => {

          // sketchTodo - set this after shader passes somehow
          // p5i.push()
          // p5i.strokeWeight(1)
          // p5i.stroke(255, 255, 255)
          // p5i.noFill()
          // p5i.circle(p5xy.x, p5xy.y, 10)
          // p5i.pop()

          evtChop.events.forEach(evt => {
            const { r, g, b, x, y } = evt.metadata
            p5i.push()
            p5i.noStroke()
            p5i.fill(r * 255, g * 255, b * 255)
            p5i.circle(x, y, 40 * (1 - evt.evt.val()))
            p5i.pop()
          })
        })

        const r = () => Math.random()


        const loop = launch(async ctx => {
          // eslint-disable-next-line no-constant-condition
          while (true) {
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
            await ctx.wait(evtDur)
          }
        })

        loopMap.set(drawFuncId, loop)

      }, threeCanvas)

      const p5Passthru = new Passthru({ src: p5Canvas })
      const feedback = new FeedbackNode(p5Passthru)
      const vertBlur = new VerticalBlur({ src: feedback })
      const horBlur = new HorizontalBlur({ src: vertBlur })
      const transform = new Transform({ src: horBlur })
      const layerOverlay = new LayerBlend({ src1: p5Passthru, src2: transform })
      feedback.setFeedbackSrc(layerOverlay)
      const canvasPaint = new CanvasPaint({ src: layerOverlay })
      shaderGraphEndNode = canvasPaint

      transform.setUniforms({ scale: [0.995, 0.995] })
      vertBlur.setUniforms({ pixels: 2 })
      horBlur.setUniforms({ pixels: 2 })


      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)

      singleKeydownEvent('u', (ev) => {
        const lastId = loopIdStack.pop()
        if (lastId) {
          const lastLoop = loopMap.get(lastId)
          if (lastLoop) {
            lastLoop.cancel()
            appState.drawFuncMap.delete(lastId)
          }
        }
      })

      singleKeydownEvent('c', (ev) => {
        //iterate over keys in loopMap and cancel each
        for(const [key, loop] of loopMap.entries()) {
          loop.cancel()
          appState.drawFuncMap.delete(key)
        }
      })
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    code()
  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  clearDrawFuncs()
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