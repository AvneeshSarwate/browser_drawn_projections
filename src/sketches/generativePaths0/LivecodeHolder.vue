<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { pathPos, pathPosConstLen } from '@/utils/utils';
import { setUpColorDatGui, type colorChoices, toRgb, palette } from '@/rendering/palletteHelper';
import type { GUI } from 'dat.gui';
import { lerp } from 'three/src/math/MathUtils.js';



/**
 * sketch ideas
 * - more intentional color choices
 * - have option to have constant speed along path
 * - interpolate between different circle arrangements
 * - multiple paths - each with their own color
 * - control the randomization of the triangle sizes 
 * - launch different shapes than triangles 
 * - control/toggle the launch rate
 * - have triangles randomly launch off path off screen 
 * - post processing
 */

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

type simpleVec2 = { x: number, y: number }

//todo bug - something about hotreloading is causing a slowdown over time

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const savedColorStr = localStorage.getItem('generativePaths0')
    const savedColors = savedColorStr ? JSON.parse(savedColorStr) : undefined
    colorGui = setUpColorDatGui(savedColors)
    colorGui.datGui.close()

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

      singleKeydownEvent(' ', (ev) => {
        ev.preventDefault() //stops spacebar from scrolling when page loaded in touchdesigner
        if (appState.drawing) {
          const newCircle = new PulseCircle(p5Mouse.x, p5Mouse.y, 30)
          newCircle.debugInd = appState.circles.list.length
          console.log("adding circle", anyCircleSelected, nearestInd)
          if (anyCircleSelected) {
            appState.circles.list[nearestInd].debugSelected = false
            newCircle.debugSelected = true
            appState.circles.insertItem(newCircle, nearestInd + 1)
            nearestInd++
            appState.circles.list.forEach((c, i) => {
             c.debugInd = i
            })
          } else {
            appState.circles.pushItem(newCircle)
          }
        }
      })

      let debugDraw = true
      singleKeydownEvent('c', (ev) => {
        appState.circles.list.forEach(c => c.debugDraw = debugDraw)
        debugDraw = !debugDraw
      })

      let anyCircleSelected = false
      let nearestInd = 0
      singleKeydownEvent('s', (ev) => {
        //find closest circle to mouse pos

        //todo bug - selecting 0th circle doesn't seem to work properly
        
        const closestCircle = appState.circles.list.reduce((prev, curr, i) => {
          const prevDist = Math.sqrt((prev.x - p5Mouse.x) ** 2 + (prev.y - p5Mouse.y) ** 2)
          const currDist = Math.sqrt((curr.x - p5Mouse.x) ** 2 + (curr.y - p5Mouse.y) ** 2)
          nearestInd = currDist < prevDist ? i : nearestInd
          return prevDist < currDist ? prev : curr
        })
        appState.circles.list.forEach((c, i) => {
          if(i == nearestInd) return
          if(c.debugSelected) c.debugSelected = false
        })
        closestCircle.debugSelected = !closestCircle.debugSelected
        anyCircleSelected = closestCircle.debugSelected

      })

      let launchCounter = 0
      let activeLaunches = new Map<number, Ramp>()
      let launchLines = new Map<number, { firstId: number, secondId: number, thirdId: number }>()

      function drawCurve(p: p5, firstPos: simpleVec2, secondPos: simpleVec2, thirdPos: simpleVec2) {
        p.beginShape()
        p.curveVertex(firstPos.x, firstPos.y)
        p.curveVertex(lerp(firstPos.x, secondPos.x, 0.5), lerp(firstPos.y, secondPos.y, 0.5))
        p.curveVertex(secondPos.x, secondPos.y)
        p.curveVertex(lerp(secondPos.x, thirdPos.x, 0.5), lerp(secondPos.y, thirdPos.y, 0.5))
        p.curveVertex(thirdPos.x, thirdPos.y)
        p.curveVertex(lerp(thirdPos.x, firstPos.x, 0.5), lerp(thirdPos.y, firstPos.y, 0.5))
        p.curveVertex(firstPos.x, firstPos.y)
        p.curveVertex(lerp(firstPos.x, secondPos.x, 0.5), lerp(firstPos.y, secondPos.y, 0.5))
        p.curveVertex(secondPos.x, secondPos.y)
        p.curveVertex(lerp(secondPos.x, thirdPos.x, 0.5), lerp(secondPos.y, thirdPos.y, 0.5))
        p.endShape()        
      }

      let showCurves = true
      singleKeydownEvent("v", (ev) => {
        showCurves = !showCurves
      })

      const loopPath = false
      appState.drawFuncMap.set("launchLines", (p: p5) => {
        if(!showCurves) return
        p.push()
        p.strokeWeight(10)
        launchLines.forEach(({ firstId, secondId, thirdId }) => {

          const colorInd = (firstId / 3) % 4
          const color = colors[colorInd]

          p.noFill()
          p.stroke(color.r, color.g, color.b)
          const firstRamp = activeLaunches.get(firstId) || { val: () => 0}
          const secondRamp = activeLaunches.get(secondId) || { val: () => 0 }
          const thirdRamp = activeLaunches.get(thirdId) || { val: () => 0 }
          const firstPos = pathPosConstLen(appState.circles.list, firstRamp.val(), loopPath)
          const secondPos = pathPosConstLen(appState.circles.list, secondRamp.val(), loopPath)
          const thirdPos = pathPosConstLen(appState.circles.list, thirdRamp.val(), loopPath)  

          drawCurve(p, firstPos, secondPos, thirdPos)

        })
        p.pop()
      })

      const globalSpeedScale = 1
      let lastSpeed = 3 + Math.random() * 3
      let colors = [colorGui.colors.col0tet0, colorGui.colors.col0tet1, colorGui.colors.col0tet2, colorGui.colors.col0tet3].map(c => toRgb(c))
      colors = palette(colorGui.colors.col0tet0, colorGui.colors.col0tet1, 4).map(c => c.toRgb())

      const launchCircle = (launchId: number) => {
        const launchSpeed = launchId % 2 == 0 ? 3 + Math.random() * 3 : lastSpeed
        lastSpeed = launchSpeed
        const ramp = new Ramp(launchSpeed * globalSpeedScale * 4)
        ramp.trigger()

        ramp.onFinish = () => {
          if (loopPath) {
            activeLaunches.delete(launchId)
            launchLines.delete(launchId)
          }
          else {
            if (launchId % 3 == 2) {
              const lineId = Math.floor(launchId / 3) * 3
              activeLaunches.delete(lineId)
              activeLaunches.delete(lineId + 1)
              activeLaunches.delete(lineId + 2)
              launchLines.delete(lineId)
            }
          }
          
        }

        activeLaunches.set(launchId, ramp)
        
        if (launchId % 3 == 0) {
          launchLines.set(launchId, { firstId: launchId, secondId: -1, thirdId: -1 })
        } else {
          const lineId = Math.floor(launchId / 3) * 3
          const launchLine = launchLines.get(lineId)
          if (launchLine) {
            if (launchLine.secondId == -1) {
              launchLine.secondId = launchId
            } else if (launchLine.thirdId == -1) {
              launchLine.thirdId = launchId
            }
          }
        }
      }

      async function launchTriangle(lineId: number, ctx: TimeContext) {
        ctx.branch(async (ctx) => {
          launchCircle(lineId)
          let ptWait = 0.2 + Math.random() * 0.2
          const triSize = 0.5
          await ctx.waitSec(ptWait * globalSpeedScale * triSize)
          launchCircle(lineId + 1)
          ptWait = 0.2 + Math.random() * 0.2
          await ctx.waitSec(ptWait * globalSpeedScale * triSize)
          launchCircle(lineId + 2)
        })
      }

      let launching = true
      singleKeydownEvent('l', (ev) => {
        launching = !launching
      })


      launchLoop(async (ctx) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const triWait = 0.1 + Math.random() * 0.1
          await ctx.waitSec(triWait * globalSpeedScale)
          if (appState.circles.list.length > 2 && launching) {
            launchCounter += 3
            launchTriangle(launchCounter, ctx)
          }
        }
      })

      // singleKeydownEvent('l', launchCircle)

      
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