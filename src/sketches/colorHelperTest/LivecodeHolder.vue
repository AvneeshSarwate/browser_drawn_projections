<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { mixColor, palette, setUpColorDatGui } from '@/rendering/palletteHelper';

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

function circleArr(n: number, rad: number, p: p5) {
  const center = { x: p.width / 2, y: p.height / 2 }
  const sin1 = (x: number) => Math.sin(x * 2 * Math.PI)
  const cos1 = (x: number) => Math.cos(x * 2 * Math.PI)
  return xyZip(0, cos1, sin1, n).map(({ x, y }) => ({x: x*rad + center.x, y: y*rad + center.y}))
}

const colorGui = setUpColorDatGui()

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
      launchLoop(async (ctx) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (appState.circles.list.length > 0) {
            const randIndex = Math.floor(Math.random() * appState.circles.list.length)
            seqInd = (seqInd + 1) % appState.circles.list.length
            appState.circles.list[seqInd].trigger()
          }
          await ctx.waitSec(0.05)
        }
      })

      let lerpEvt = new Ramp(1)
      let lerpLoop: CancelablePromisePoxy<any> | undefined = undefined
      singleKeydownEvent('f', (ev) => {
        const basePositions = appState.circles.list.map(c => ({ x: c.x, y: c.y }))
        const targetPositions = circleArr(appState.circles.list.length, 300, p5i)

        const lerp = (t: number) => {
          appState.circles.list.forEach((c, i) => {
            c.x = initialCiclePos[i].x + (targetPositions[i].x - initialCiclePos[i].x) * t
            c.y = initialCiclePos[i].y + (targetPositions[i].y - initialCiclePos[i].y) * t
          })
        }

        lerpLoop?.cancel()
        lerpEvt = new Ramp(2)
        lerpEvt.trigger()
        lerpLoop = launchLoop(async (ctx) => {
          while (lerpEvt.val() < 1) {
            const v  =lerpEvt.val()
            const triVal = tri(v)
            // console.log("triVal", triVal)
            lerp(triVal)
            await ctx.waitFrame()
          }
          appState.circles.list.forEach((c, i) => {
            c.x = initialCiclePos[i].x
            c.y = initialCiclePos[i].y
          })

        })
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
          newCircle.debugDraw = false
          appState.circles.pushItem(newCircle)
          initialCiclePos.push({ x: newCircle.x, y: newCircle.y })
          console.log("adding circle", newCircle)

          const circleInd = appState.circles.list.length - 1
          const paletteLen = 10
          const col1 = colorGui.colors.color1
          const col2 = colorGui.colors.color2
          const pal = palette(col1, col2, paletteLen)
          const rgb = pal[circleInd % paletteLen].toRgb()
          newCircle.color = { r: rgb.r/255, g: rgb.g/255, b: rgb.b/255 }
        }
      })

      
      appState.drawFunctions.push((p: p5) => {
        // console.log("drawing circles", appState.circles.list.length)
        appState.circles.list.forEach((c, i) => {
          //todo api - wrap datGui colors in a ref in the sketch so you can listen for when they change and updated cached palettes
          const circleInd = i
          const paletteLen = 10
          const phase = (circleInd % paletteLen) / (paletteLen - 1)
          const col1 = colorGui.colors.color1
          const col2 = colorGui.colors.color2
          const pal = palette(col1, col2, paletteLen)
          const rgb = mixColor(col1, col2, phase).toRgb()
          c.color = { r: rgb.r/255, g: rgb.g/255, b: rgb.b/255 }
          c.draw(p)
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
  colorGui.datGui.destroy() //todo api - save/load to/from localStorage by sketch name
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>