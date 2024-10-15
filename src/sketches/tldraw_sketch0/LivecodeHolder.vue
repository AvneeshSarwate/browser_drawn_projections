<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TldrawTestAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, now } from '@/channels/channels';
import { getEllipseShapes, getFreehandShapes, getMultiSegmentLineShapes, p5FreehandTldrawRender } from './tldrawWrapperPlain';
import { HorizontalBlur, LayerBlend, Transform, VerticalBlur } from '@/rendering/customFX';
import AutoUI from '@/components/AutoUI.vue';
import { lerp, type Editor } from 'tldraw';
import earcut from 'earcut';

const appState = inject<TldrawTestAppState>(appStateName)!!
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

const drawParams = ref({
  showLines: true,
  showCircles: true, 
  showConnectors: true
})

const rand = (n: number) => sinN(n*123.23)

const randColor = (seed: number) => {
  return {
    r: rand(seed) * 255,
    g: rand(seed + 1) * 255,
    b: rand(seed + 2) * 255,
    a: 1
  }
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
      
      let drawTicks = 0
      appState.drawFuncMap.set('tldrawRender', () => {
        
        //@ts-ignore
        const tldrawEditor: Editor = window.tldrawEditor

        if (tldrawEditor) {
          if(drawTicks++ % 10 === 0){
            // console.log("rendering tldraw")

            // console.log(appState.tldrawEditor.getInstanceState())
          }
          // p5FreehandTldrawRender(appState.tldrawEditor, p5i)

          p5i.push()
          p5i.strokeWeight(4)


          const multiSegmentLineMap = getMultiSegmentLineShapes(tldrawEditor)

          for (const [id, shape] of multiSegmentLineMap) {
            const modulatedPoints = shape.points.map((pt, i) => {
              return {
                x: pt.x + Math.sin(now()*(1+rand(i))) * 50,
                y: pt.y + Math.cos(now()*(1+rand(i))) * 50
              }
            })

            const lerpVal = sinN(now()*0.1)
            const lerpedModulatedPoints = shape.points.map((pt, i) => {
              return {
                x: lerp(pt.x, modulatedPoints[i].x, lerpVal),
                y: lerp(pt.y, modulatedPoints[i].y, lerpVal)
              }
            })

            const flatPoints = shape.points.flatMap(pt => [pt.x, pt.y])
            const indices = earcut(flatPoints)
            //draw triangles
            for (let i = 0; i < indices.length; i += 3) {
              const col = randColor(i)
              p5i.push()
              p5i.fill(col.r, col.g, col.b)
              p5i.noStroke()
              const a = indices[i]
              const b = indices[i + 1]
              const c = indices[i + 2]
              p5i.triangle(lerpedModulatedPoints[a].x, lerpedModulatedPoints[a].y, lerpedModulatedPoints[b].x, lerpedModulatedPoints[b].y, lerpedModulatedPoints[c].x, lerpedModulatedPoints[c].y)
              p5i.pop()
            }




            p5i.push()
            p5i.noFill()
            p5i.stroke(255)
            p5i.beginShape()

            if(shape.spline === 'spline'){
              p5i.curveVertex(shape.points[0].x, shape.points[0].y)
              for (const pt of shape.points) {
                p5i.curveVertex(pt.x, pt.y)
              }
              if(shape.closed){
                p5i.curveVertex(shape.points[0].x, shape.points[0].y)
                p5i.curveVertex(shape.points[1].x, shape.points[1].y)
              } else {
                p5i.curveVertex(shape.points[shape.points.length - 1].x, shape.points[shape.points.length - 1].y)
              }
            } else {
              for (const pt of shape.points) {
                p5i.vertex(pt.x, pt.y)
              }
              if(shape.closed){
                p5i.vertex(shape.points[0].x, shape.points[0].y)
              }
            }
            
            p5i.endShape()
          }

          p5i.pop()
        }
      })

      const p5Passthru = new Passthru({ src: p5Canvas })
      const feedback = new FeedbackNode(p5Passthru)
      const vertBlur = new VerticalBlur({ src: feedback })
      const horBlur = new HorizontalBlur({ src: vertBlur })
      const transform = new Transform({ src: horBlur })
      const layerOverlay = new LayerBlend({ src1: p5Passthru, src2: transform })
      feedback.setFeedbackSrc(layerOverlay)
      const canvasPaint = new CanvasPaint({ src: layerOverlay })
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
  <AutoUI :object-to-edit="drawParams"/>
</template>

<style scoped></style>