<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TldrawTestAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { getEllipseShapes, getFreehandShapes, getMultiSegmentLineShapes, p5FreehandTldrawRender } from './tldrawWrapperPlain';
import { HorizontalBlur, LayerBlend, Transform, VerticalBlur } from '@/rendering/customFX';
import AutoUI from '@/components/AutoUI.vue';
import type { Editor } from 'tldraw';

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
  showCircles: false, 
  showConnectors: false
})

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
        if (appState.tldrawEditor) {
          if(drawTicks++ % 10 === 0){
            // console.log("rendering tldraw")

            // console.log(appState.tldrawEditor.getInstanceState())
          }
          // p5FreehandTldrawRender(appState.tldrawEditor, p5i)

          p5i.push()
          p5i.strokeWeight(4)

          const idOrder = ["shape:Rvhc4yQGjjpnYKY7CFDS-",  "shape:PFsSv12VXFBpTZBL9Q6q2",  "shape:WB4IVPgNV5Z5lDVMAX3Gw", "shape:FI4cdvy-4WCST1lBcXFpj"]

          const shapeMap = getFreehandShapes(appState.tldrawEditor)
      

          const idsNotInOrder = Array.from(shapeMap.keys()).filter(id => !idOrder.includes(id))

          const shapes = idOrder.map(id => shapeMap.get(id)!)

          idsNotInOrder.forEach(id => {
            shapes.push(shapeMap.get(id)!)
          })

          const shapeCirclePts: {x: number, y: number}[] = []
          for (const shape of shapes) {
            p5i.noFill()
            p5i.stroke(255)
            p5i.beginShape()
            if (drawParams.value.showLines) {
              for (const pt of shape) {
                p5i.vertex(pt.x, pt.y)
              }
              p5i.endShape()
            }

            const shapePt = shape[Math.floor((drawTicks / 4 % shape.length) )]
            shapeCirclePts.push(shapePt)

            if (drawParams.value.showCircles) {
              p5i.fill(255, 0, 0)
              p5i.circle(shapePt.x, shapePt.y, 30)
            }
          }

          if(drawParams.value.showConnectors) {
            p5i.stroke(0, 255 * sinN(drawTicks / 400), 255 * cosN(drawTicks / 400))
            for (let i = 0; i < shapeCirclePts.length - 1; i++) {
              p5i.line(shapeCirclePts[i].x, shapeCirclePts[i].y, shapeCirclePts[i + 1].x, shapeCirclePts[i + 1].y)
            }
          }

          const ellipseMap = getEllipseShapes(appState.tldrawEditor)
          const editorCam = appState.tldrawEditor.getCamera()
          for (const [id, ellipse] of ellipseMap) {
            p5i.noFill()
            p5i.stroke(255)
            p5i.ellipseMode(p5i.CORNER)

            p5i.push()
            p5i.translate(ellipse.x, ellipse.y)
            p5i.translate(editorCam.x, editorCam.y)
            p5i.rotate(ellipse.rotation)
            p5i.scale(ellipse.xScale, ellipse.yScale)
            p5i.ellipse(0, 0, ellipse.w, ellipse.h)
            p5i.pop()
          }

          const multiSegmentLineMap = getMultiSegmentLineShapes(appState.tldrawEditor)

          for (const [id, shape] of multiSegmentLineMap) {
            p5i.push()
            p5i.noFill()
            p5i.stroke(255)
            p5i.beginShape()
            for (const pt of shape) {
              p5i.vertex(pt.x, pt.y)
            }
            p5i.endShape()
            p5i.pop()
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