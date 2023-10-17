<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type PulseCircleAppState, PulseCircle } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';

const appState = inject<PulseCircleAppState>('appState')!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined


onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = () => {
      appState.circles.list.forEach(c => c.debugDraw = true)

      const debugDraw = (p: p5) => {
        p.push()
        p.strokeWeight(1)
        p.stroke(255, 0, 0)
        p.noFill()
        p.circle(p5Mouse.x, p5Mouse.y, 10)
        p.pop()
      }

      //todo template - should keyboard events be on the window? can the three canvas be focused?
      singleKeydownEvent('d', (ev) => {
        appState.drawing = !appState.drawing
        if (appState.drawing) {
          appState.drawFuncMap.set("debugDraw", debugDraw)
        } else {
          appState.drawFuncMap.delete("debugDraw")
        }
      })

      mousedownEvent((ev) => {
        if (appState.drawing) {
          const newCircle = new PulseCircle(p5Mouse.x, p5Mouse.y, 100)
          appState.circles.pushItem(newCircle)
        }
      }, threeCanvas)

      


      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      shaderGraphEndNode = canvasPaint
      appState.drawFunctions.push(() => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!))


      
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
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>