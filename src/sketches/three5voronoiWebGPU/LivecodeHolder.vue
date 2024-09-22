<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, now } from '@/channels/channels';
import { Three5 } from '@/rendering/three5';
import * as THREE from 'three/tsl';
import { Voronoi, getVoronoiPolygons } from '@/creativeAlgs/voronoi';
import { directionSweep } from '@/creativeAlgs/shapeHelpers';
import { HorizontalBlur, LayerBlend, Transform, VerticalBlur } from '@/rendering/customFX';
import { If, select, uv, vec3 } from 'three/tsl';

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

let three5outer: Three5 | undefined = undefined

let polyFracVal = ref(0.5)
let polyFractDir = ref('top')

const nodeExpr = select(uv().x.lessThan(0.5), vec3(1, 0, 0), vec3(0, 0, 1))

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    three5outer = new Three5(resolution.width, resolution.height)
    const three5i = three5outer
    const voronoi = new Voronoi()
    const initialPts = [{ x: 300, y: 300 }, { x: 600, y: 600 }]
    const p5bbox = { xl: 0, xr: resolution.width, yt: 0, yb: resolution.height }
    let diagram = voronoi.compute(initialPts, p5bbox)

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?
      
      const voronoiPoints: THREE.Vector2[] = []

      //sketchTodo - make all of these listen on threeCanvas
      singleKeydownEvent('d', (ev) => {
        voronoiPoints.push(new THREE.Vector2(p5Mouse.x, resolution.height - p5Mouse.y))
        console.log("voronoiPoints", voronoiPoints)
      })

      singleKeydownEvent('s', (ev) => {
        
      })

      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const redMat = new THREE.MeshBasicMaterial({ color: 0xff0000 })
      const nodeMat = new THREE.MeshBasicNodeMaterial()
      nodeMat.colorNode = nodeExpr
      let randColorMats = []
      for(let i = 0; i < 100; i++) {
        randColorMats.push(new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff }))
      }
      
      appState.drawFunctions.push((p: p5) => {
        // console.log("drawing circles", appState.circles.list.length)
        if(diagram) voronoi.recycle(diagram)
        diagram = voronoi.compute(voronoiPoints, p5bbox)
        const polygons = getVoronoiPolygons(diagram, voronoiPoints)
        const lerpFactor = sinN(now()/5)
        const centerLerpedPolygons = polygons.map((polygon, index) => {
          const avgCenter = polygon.reduce((acc, pt) => ({ x: acc.x + pt.x/polygon.length, y: acc.y + pt.y/polygon.length }), { x: 0, y: 0 })
          const siteCenter = voronoiPoints[index]
          const center = siteCenter
          return polygon.map(pt => ({ x: pt.x + (center.x - pt.x) * lerpFactor, y: pt.y + (center.y - pt.y) * lerpFactor }))
        })

        const topHalf = polygons.map(polygon => directionSweep(polygon, polyFracVal.value, polyFractDir.value as any).polygon)

        three5i.setMaterial(nodeMat)
        topHalf.forEach((polygon, i) => {
          // three5i.setMaterial(randColorMats[i])
          three5i.polygon(polygon)
        })

        three5i.setMaterial(redMat)

        voronoiPoints.forEach(pt => {
          three5i.circle(pt.x, pt.y, 10)
        })

        three5i.render(appState.threeRenderer!!, true)
      })

      // const three5passthru = new Passthru({ src: three5i.output })
      // const feedback = new FeedbackNode(three5passthru)
      // const vertBlur = new VerticalBlur({ src: feedback })
      // const horBlur = new HorizontalBlur({ src: vertBlur })
      // const transform = new Transform({ src: horBlur })
      // const layerOverlay = new LayerBlend({ src1: three5passthru, src2: transform })
      // feedback.setFeedbackSrc(layerOverlay)
      // const canvasPaint = new CanvasPaint({ src: layerOverlay })
      // shaderGraphEndNode = canvasPaint

      // transform.setUniforms({ scale: [0.995, 0.995] })
      // vertBlur.setUniforms({ pixels: 2 })
      // horBlur.setUniforms({ pixels: 2 })


      // appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)

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
  three5outer?.dispose()
})

</script>

<template>
  <div></div>
  <label>Poly Fract Dir</label>
  <select v-model="polyFractDir">
    <option value="top">Top</option>
    <option value="bottom">Bottom</option>
    <option value="left">Left</option>
    <option value="right">Right</option>
  </select>
  <br />
  <label>Poly Fract Val</label>
  <input type="range" v-model="polyFracVal" min="0" max="1" step="0.01" />
</template>

<style scoped></style>