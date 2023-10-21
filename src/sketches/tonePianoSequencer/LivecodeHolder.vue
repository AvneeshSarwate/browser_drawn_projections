<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type ToneSeqAppState, PulseCircle, sampler } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cos, sin, Ramp, tri } from '@/channels/channels';

const appState = inject<ToneSeqAppState>('appState')!!
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
  return xyZip(0, cos1, sin1, n).map(({ x, y }) => ({x: x*rad + center.x, y: y*rad + center.y}))
}

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const initialCiclePos = appState.circles.list.map(c => ({ x: c.x, y: c.y }))

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = () => {
      clearDrawFuncs()
      appState.circles.list.forEach(c => c.debugDraw = false)

      const drawingCursor = (p: p5) => {
        p.push()
        p.strokeWeight(10)
        p.stroke(255, 0, 0)
        p.noFill()
        p.circle(p5Mouse.x, p5Mouse.y, 30)
        p.pop()
      }

      let seqInd = 0
      const cMajNoteStrings = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']
      launchLoop(async (ctx) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (appState.circles.list.length > 0) {
            const randIndex = Math.floor(Math.random() * appState.circles.list.length)
            seqInd = (seqInd + 1) % appState.circles.list.length
            appState.circles.list[seqInd].trigger()
            const randNote = cMajNoteStrings[seqInd % cMajNoteStrings.length]
            console.log("triggering note", randNote, sampler)
            sampler.triggerAttackRelease(randNote, '8n')
          }
          await ctx.wait(0.2)
        }
      })

      //todo template - should keyboard events be on the window? can the three canvas be focused?
      singleKeydownEvent('d', (ev) => {
        appState.drawing = !appState.drawing
        console.log("drawing: " + appState.drawing)
        if (appState.drawing) {
          appState.drawFuncMap.set("debugDraw", drawingCursor)
        } else {
          appState.drawFuncMap.delete("debugDraw")
        }
      })

      //todo bug - circles not being picked up to draw after being created
      singleKeydownEvent('s', (ev) => {
        if (appState.drawing) {
          const newCircle = new PulseCircle(p5Mouse.x, p5Mouse.y, 100)
          newCircle.debugDraw = false
          appState.circles.pushItem(newCircle)
          initialCiclePos.push({ x: newCircle.x, y: newCircle.y })
          console.log("adding circle", newCircle)
        }
      })

      
      appState.drawFunctions.push((p: p5) => {
        // console.log("drawing circles", appState.circles.list.length)
        appState.circles.list.forEach(c => c.draw(p))
      })

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