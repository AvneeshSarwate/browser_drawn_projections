<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, EventChop } from '@/channels/channels';
import { Voronoi, getVoronoiPolygons } from '@/creativeAlgs/voronoi';

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

const seedRand = (n: number) => {
  return (Math.sin(100 +n * 12523.9898)+1)/2
}
const randRGB = (seed: number) => {
  return { r: seedRand(seed) * 255, g: seedRand(seed + 1.3) * 255, b: seedRand(seed + 2.4) * 255 }
}

const trueRandRgb = () => {
  return { r: Math.random() * 255, g: Math.random() * 255, b: Math.random() * 255 }
}

let drawVoronoi = ref(false)

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

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?
      appState.circles.list.forEach(c => c.debugDraw = false)

      const drawingCursor = (p: p5) => {
        p.push()
        p.strokeWeight(10)
        p.stroke(255, 0, 0)
        p.noFill()
        p.circle(p5Mouse.x, p5Mouse.y, 30)
        p.pop()
      }


      type CircleEvent = {x: number, y: number, numCirc: number, radius: number, color: {r: number, g: number, b: number}}

      let evtChop = new EventChop<CircleEvent>()

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
          const color = trueRandRgb()
          evtChop.ramp(5, { x: p5Mouse.x, y: p5Mouse.y, numCirc: 40, radius: 450, color })
        }
      })

      const voronoi = new Voronoi()
      const initialPts = [{ x: 300, y: 300 }, { x: 600, y: 600 }]
      const p5bbox = { xl: 0, xr: 1280, yt: 0, yb: 720 }
      //todo don't need normalizing - bug fixed with noise preventing sites in perfect circles
      const normBbox = { xl: 0, xr: 1, yt: 0, yb: 1 }
      const normInitialPts = initialPts.map(pt => ({ x: pt.x / p5bbox.xr, y: pt.y / p5bbox.yb }))
      let diagram = voronoi.compute(normInitialPts, normBbox)

      let lastPolygons: {x: number, y: number}[][] = [] 
      let lastColors: {r: number, g: number, b: number}[] = []
      
      appState.drawFunctions.push((p: p5) => {
        // console.log("drawing circles", appState.circles.list.length)
        // const circlePts = appState.circles.list.map(c => ({ x: c.x, y: c.y }))

        appState.voronoiSites.splice(0, appState.voronoiSites.length)
        const colors: {r: number, g: number, b: number}[] = []
        evtChop.events.forEach(evt => {
          const circleData = evt.metadata
          const time = evt.evt.val()
          for(let i = 0; i < circleData.numCirc; i++) {

            //add some noise to the angle to avoid too many straight lines, which crashes the voronoi algorithm
            const angle = i * 2 * Math.PI / circleData.numCirc + Math.random() * 0.001

            const x = circleData.x + Math.cos(angle) * circleData.radius * time
            const y = circleData.y + Math.sin(angle) * circleData.radius * time
            appState.voronoiSites.push({ x: x / p5bbox.xr, y: y / p5bbox.yb })
            colors.push(circleData.color)
          }
        })

        try {
          voronoi.recycle(diagram)
          diagram = voronoi.compute(appState.voronoiSites, normBbox)
          //todo api - indicate that compute mutates the input array to have voronoiId
          lastPolygons = getVoronoiPolygons(diagram, appState.voronoiSites)
          lastColors = colors
        } catch (e) {
          console.warn("voronoi compute failed", e)
        }


        const x = 5
        if (drawVoronoi.value) {
          p.push()
          p.stroke(0)
          p.strokeWeight(2)
          lastPolygons.forEach((polygon, i) => {
            const color = lastColors[i]
            try {
              p.fill(color.r, color.g, color.b)
            } catch (e) {
              console.warn("color fill failed", color, e)
            }
            p.beginShape()
            polygon.forEach(pt => p.vertex(pt.x * p5bbox.xr, pt.y * p5bbox.yb))
            p.endShape(p.CLOSE)
          })
          p.pop()
        } else {
          p.push()
          appState.voronoiSites.forEach((site, i) => {
            const color = colors[i]
            p.fill(color.r, color.g, color.b)
            p.noStroke()
            p.circle(site.x * p5bbox.xr, site.y * p5bbox.yb, 10)
          })
          p.pop()
        }
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
  <button @click="drawVoronoi = !drawVoronoi">Draw Voronoi</button>
</template>

<style scoped></style>