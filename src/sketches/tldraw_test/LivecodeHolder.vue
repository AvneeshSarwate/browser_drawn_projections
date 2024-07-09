<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TldrawTestAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { getFreehandShapes, p5FreehandTldrawRender } from './tldrawWrapperPlain';
import { HorizontalBlur, LayerBlend, Transform, VerticalBlur } from '@/rendering/customFX';

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
          if(drawTicks++ % 10 === 0) console.log("rendering tldraw")
          // p5FreehandTldrawRender(appState.tldrawEditor, p5i)

          p5i.push()
          p5i.stroke(255)
          p5i.noFill()
          p5i.strokeWeight(4)

          const shapes = getFreehandShapes(appState.tldrawEditor)
          for (const shape of shapes) {
            p5i.noFill()
            p5i.beginShape()
            for (const pt of shape) {
              p5i.vertex(pt.x, pt.y)
            }
            p5i.endShape()

            p5i.fill(255, 0, 0)
            const shapePt = shape[Math.floor((drawTicks / 4 % shape.length) )]
            p5i.circle(shapePt.x, shapePt.y, 30)
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
</template>

<style scoped></style>