<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, touchstartEvent, touchmoveEvent, touchendEvent, touchcancelEvent } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import dat from 'dat.gui';

const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const datGui = new dat.GUI()
const drawParams = {
  lineWidth: 10,
  circleRadius: 100,
  orientation: 'horizontal'
}
datGui.add(drawParams, 'lineWidth', 0, 30).onChange((v) => {
  drawParams.lineWidth = v
})
datGui.add(drawParams, 'circleRadius', 0, 100).onChange((v) => {
  drawParams.circleRadius = v
})
datGui.add(drawParams, 'orientation', ['horizontal', 'vertical', 'sequential']).onChange((v) => {
  drawParams.orientation = v
})



const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?
      

      touchstartEvent((ev) => {
        appState.circles = Array.from(ev.touches).map((t) => ({ x: t.clientX, y: t.clientY }))
        ev.preventDefault()
      }, threeCanvas)

      touchmoveEvent((ev) => {
        appState.circles = Array.from(ev.touches).map((t) => ({ x: t.clientX, y: t.clientY }))
        ev.preventDefault()
      }, threeCanvas)

      touchendEvent((ev) => {
        appState.circles = Array.from(ev.touches).map((t) => ({ x: t.clientX, y: t.clientY }))
        ev.preventDefault()
      }, threeCanvas)

      touchcancelEvent((ev) => {
        appState.circles = Array.from(ev.touches).map((t) => ({ x: t.clientX, y: t.clientY }))
        ev.preventDefault()
      }, threeCanvas)


      
      appState.drawFunctions.push((p: p5) => {
        appState.circles.forEach((c) => {
          p.push()
          p.stroke(0)
          p.fill(255)
          p.ellipse(c.x, c.y, drawParams.circleRadius, drawParams.circleRadius)
          p.pop()

          p.push()
          p.stroke(255)
          p.strokeWeight(drawParams.lineWidth)

          let circles = appState.circles.map(c => c)
          switch (drawParams.orientation) {
            case 'horizontal':
              circles.sort((a, b) => a.x - b.x)
              break
            case 'vertical':
              circles.sort((a, b) => a.y - b.y)
              break
            case 'sequential':
              circles
              break
          }
          circles.forEach((c, i) => {
            if(i == 0) return
            p.line(circles[i-1].x, circles[i-1].y, c.x, c.y)
          })

          p.pop()
        })
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
  document.getElementsByClassName('frameRateStats')[0]?.remove()
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>