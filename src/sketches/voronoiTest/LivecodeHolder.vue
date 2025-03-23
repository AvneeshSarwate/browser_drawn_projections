<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, EventChop } from '@/channels/channels';
import { Voronoi, filterSimilarPoints, getVoronoiPolygons } from '@/creativeAlgs/voronoi';
import { getVoronoiData } from './tdWebsocket';
import seedrandom from 'seedrandom'
import { lerp } from 'three/src/math/MathUtils.js';

const myrng = seedrandom('hello')
console.log("rng", myrng())
console.log("rng", myrng())
console.log("rng", myrng())
console.log("rng", myrng())


const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

let pressedPts: { x: number, y: number }[] = []


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

const randRGB = (seed: number) => {
  const rng = seedrandom(seed.toString())
  return { r: rng() * 255, g: rng() * 255, b: rng() * 255 }
}

const trueRandRgb = () => {
  return { r: Math.random() * 255, g: Math.random() * 255, b: Math.random() * 255 }
}

let drawVoronoi = ref(true)
let useTdVoronoi = ref(true)
let drawSites = ref(false)

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    // const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const initialCiclePos = appState.circles.list.map(c => ({ x: c.x, y: c.y }))

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, p5Canvas)
    }, p5Canvas)

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

      singleKeydownEvent('c', (ev) => {
        if(appState.drawing) {
          pressedPts.push({ x: p5Mouse.x / p5bbox.xr, y: p5Mouse.y / p5bbox.yb })
        }
      })

      singleKeydownEvent('r', (ev) => {
        if(appState.drawing) {
          pressedPts.splice(0, pressedPts.length)
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

      let centroidMap = new Map<number, { x: number, y: number }>()
      let numPtsMap = new Map<number, number[]>()
      Array.from(Array(20).keys()).forEach(i => {
        centroidMap.set(i, { x: 0, y: 0 })
        numPtsMap.set(i, [])
      })
      
      appState.drawFunctions.push((p: p5) => {
        // console.log("drawing circles", appState.circles.list.length)
        // const circlePts = appState.circles.list.map(c => ({ x: c.x, y: c.y }))
        try {
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

          appState.voronoiSites.push(...pressedPts)
          colors.push(...pressedPts.map((pt, i) => randRGB(i)))

          const tdVoronoiData = getVoronoiData()

          //whether to add noise to fix parallel line crashes.
          //noise affects stability of filtered centroid calculations
          const addNoise = false

          const tdSites = tdVoronoiData.x.map((x, i) => ({ x, y: tdVoronoiData.y[i] + (addNoise?Math.random() * 0.00001:0) }))
          const tdColors = tdVoronoiData.r.map((r, i) => ({ r: r * 255, g: tdVoronoiData.g[i] * 255, b: tdVoronoiData.b[i] * 255 }))

          const sites = useTdVoronoi.value ? tdSites : appState.voronoiSites
          const cols = useTdVoronoi.value ? tdColors : colors
          if(sites.length != lastPolygons.length) {
            console.log("sites length changed", sites.length, lastPolygons.length)
          }
          if(sites.length != cols.length) {
            console.log("site col mismatch", sites.length, cols.length)
          }

          try {
            if(diagram) voronoi.recycle(diagram)
            diagram = voronoi.compute(sites, normBbox)
            //todo api - indicate that compute mutates the input array to have voronoiId
            //@ts-ignore
            lastPolygons = getVoronoiPolygons(diagram, sites)
            lastColors = cols
          } catch (e) {
            console.warn("voronoi compute failed", e)
            diagram = null
          }

          if(sites.length != lastPolygons.length || sites.length != lastColors.length) {
            console.log("sites length changed - STILL OFF", sites.length, lastPolygons.length, lastColors.length)
          }


          const x = 5
          if (drawVoronoi.value) {
            p.push()
            const strokeColor = { r: tdVoronoiData.borderR * 255, g: tdVoronoiData.borderG * 255, b: tdVoronoiData.borderB * 255 }
            p.stroke(strokeColor.r, strokeColor.g, strokeColor.b)
            p.strokeWeight(tdVoronoiData.lineThickness)
            lastPolygons.forEach((polygon, i) => {
              const color = lastColors[i]
              if (tdVoronoiData.edgeUsesPalleteCols) {
                p.stroke(color.r, color.g, color.b)
              } 
              if(tdVoronoiData.edgeOnly) {
                p.noFill()
              } else {
                p.fill(color.r, color.g, color.b)
              }
              

              p.beginShape()
              let centroid = { x: 0, y: 0 }
              const filteredPolygon = filterSimilarPoints(polygon, 0.02)
              const poly = filteredPolygon
              poly.forEach(pt => {
                centroid.x += pt.x
                centroid.y += pt.y
              })
              centroid.x /= poly.length
              centroid.y /= poly.length

              centroid.x = sites[i].x
              centroid.y = sites[i].y

              const centroidLerp = tdVoronoiData.centroidLerp

              //todo - need to define numPtsMap with keys equal to actual num polysites
              // let numPtslist = numPtsMap.get(i)!
              // numPtslist.push(poly.length)
              // if (numPtslist.length > 3) numPtslist.shift()

              //if all 3 items in numPtsList are different, then we have a new centroid
              // if(numPtslist[0] !== numPtslist[1] && numPtslist[1] !== numPtslist[2]) {
              //   console.log("thrasing")
              // }


              // if (i == 0) {
              //   console.log("centroid", filteredPolygon.length - polygon.length)
              //   p.endShape(p.CLOSE)
              //   // return
              // }
              // if (filteredPolygon.length > 4) {
              //   const fp = filteredPolygon.map(v => ({x: v.x , y: v.y }))
              //   console.log("filteredPolygon", filteredPolygon.length, "polygon", polygon.length)
              // }

              polygon.forEach(pt => p.vertex(lerp(pt.x, centroid.x, centroidLerp) * p5bbox.xr, lerp(pt.y, centroid.y, centroidLerp) * p5bbox.yb))
              p.endShape(p.CLOSE)
            })
            p.pop()
          } else {
            p.push()
            sites.forEach((site, i) => {
              const color = cols[i]
              p.fill(color.r, color.g, color.b)
              p.noStroke()
              p.circle(site.x * p5bbox.xr, site.y * p5bbox.yb, 10)
            })
            p.pop()
          }

          if(drawSites.value) {
            p.push()
            sites.forEach(site => {
              p.fill(255)
              p.circle(site.x * p5bbox.xr, site.y * p5bbox.yb, 10)
            })
            p.pop()
          }
        } catch (e) {
          console.warn("error in draw", e)
        }
      })

      // const passthru = new Passthru({ src: p5Canvas })
      // const canvasPaint = new CanvasPaint({ src: passthru })

      // shaderGraphEndNode = canvasPaint
      // appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
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
  <span>Draw Voronoi</span>
  <input type="checkbox" v-model="drawVoronoi" />
  <span>Use td Voronoi</span>
  <input type="checkbox" v-model="useTdVoronoi" />
  <span>Draw Sites</span>
  <input type="checkbox" v-model="drawSites" />
</template>

<style scoped></style>