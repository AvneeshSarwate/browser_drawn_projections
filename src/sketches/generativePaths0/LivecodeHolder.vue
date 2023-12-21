<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { pathPos } from '@/utils/utils';
import { setUpColorDatGui, type colorChoices, toRgb } from '@/rendering/palletteHelper';
import type { GUI } from 'dat.gui';
import tinycolor from 'tinycolor2';

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

let colorGui: {
  datGui: GUI;
  colors: colorChoices;
};

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const savedColorStr = localStorage.getItem('generativePaths0')
    const savedColors = savedColorStr ? JSON.parse(savedColorStr) : undefined
    colorGui = setUpColorDatGui(savedColors)

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
      launchLoop(async (ctx) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (appState.circles.list.length > 0) {
            seqInd = (seqInd + 1) % appState.circles.list.length
            appState.circles.list[seqInd].trigger()
          }
          await ctx.waitSec(0.05)
        }
      })


      //sketchTodo - make all of these listen on threeCanvas
      singleKeydownEvent('d', (ev) => {
        appState.drawing = !appState.drawing
        console.log("drawing: " + appState.drawing)
        if (appState.drawing) {
          appState.drawFuncMap.set("debugDraw", drawingCursor)
        } else {
          appState.drawFuncMap.delete("debugDraw")
        }
      })

      singleKeydownEvent('s', (ev) => {
        if (appState.drawing) {
          const newCircle = new PulseCircle(p5Mouse.x, p5Mouse.y, 100)
          // newCircle.debugDraw = false
          appState.circles.pushItem(newCircle)
          initialCiclePos.push({ x: newCircle.x, y: newCircle.y })
          console.log("adding circle", newCircle)
        }
      })

      let debugDraw = true
      singleKeydownEvent('c', (ev) => {
        appState.circles.list.forEach(c => c.debugDraw = debugDraw)
        debugDraw = !debugDraw
      })

      let launchCounter = 0
      let activeLaunches = new Map<number, Ramp>()
      let launchLines = new Map<number, { firstId: number, secondId: number }>()

      appState.drawFuncMap.set("launchLines", (p: p5) => {
        p.push()
        p.strokeWeight(10)
        launchLines.forEach(({ firstId, secondId }) => {

          const colorInd = (firstId / 2) % 4
          const color = colors[colorInd]

          p.stroke(color.r, color.g, color.b)

          const firstRamp = activeLaunches.get(firstId) || { val: () => 0}
          const secondRamp = activeLaunches.get(secondId) || { val: () => 0}
          // if (firstRamp && secondRamp) {
            const firstPos = pathPos(appState.circles.list, firstRamp.val())
            const secondPos = pathPos(appState.circles.list, secondRamp.val())
            p.line(firstPos.x, firstPos.y, secondPos.x, secondPos.y)
          // }
        })
        p.pop()
      })

      let lastSpeed = 3 + Math.random() * 3
      let colors = [colorGui.colors.col0tet0, colorGui.colors.col0tet1, colorGui.colors.col0tet2, colorGui.colors.col0tet3].map(c => toRgb(c))
      const launchCircle = () => {
        const launchId = launchCounter++
        const launchSpeed = launchId % 2 == 0 ? 3 + Math.random() * 3 : lastSpeed
        lastSpeed = launchSpeed
        console.log("launchId/speed", launchId, launchSpeed)
        const ramp = new Ramp(launchSpeed)
        ramp.trigger()
        ramp.onFinish = () => {
          activeLaunches.delete(launchId)
          launchLines.delete(launchId)
          console.log("deleting launch", launchId)
        }
        activeLaunches.set(launchId, ramp)
        if (launchId % 2 == 0) {
          launchLines.set(launchId, { firstId: launchId, secondId: -1 })
        } else {
          const launchLine = launchLines.get(launchId - 1)
          if (launchLine) {
            launchLine.secondId = launchId
          }
        }
      }

      launchLoop(async (ctx) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const waitTime = 0.2 + Math.random() * 0.2
          await ctx.waitSec(waitTime)
          if (appState.circles.list.length > 2) {
            launchCircle()
          }
        }
      })

      singleKeydownEvent('l', launchCircle)

      
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
  localStorage.setItem('generativePaths0', JSON.stringify(colorGui!!.colors))
  colorGui!!.datGui.destroy() //todo api - save/load to/from localStorage by sketch name
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>