<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type PolygonFillAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref, type Ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, mouseupEvent } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';

const appState = inject<PolygonFillAppState>(appStateName)!!
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

type CursorState = 'drawNewPolygon' | 'addPointToPolygon' | 'selectPoint'| 'selectPolygon' 
const cursorState: Ref<CursorState> = ref('drawNewPolygon')
let isMouseDown = false

/*

interactions:

mode : drawNewPolygon
- first click starts the polygon
- subsequent clicks add points in order

mode : addPointToPolygon
- if no polygon selected, click finds the nearest edge and selects that polygon
- clicks with selected polygon adds a point to the nearest edge, half way along the edge

mode : selectPoint
- click selects the closest point
- drag moves the selected point

mode : selectPolygon
- click selects the closest polygon
- drag moves the selected polygon

keyboard keys 1/2/3/4 swap between modes

by default draw polygons in white, points in grey. draw selected polygon in green, selected point in green

after a mouse up event occurs, save the polygons to polygonHistory

*/


onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    mousedownEvent((ev) => {
      switch (cursorState.value) {
        case 'drawNewPolygon':
          break
        case 'addPointToPolygon':
          break
        case 'selectPoint':
          break
        case 'selectPolygon':
          break
      }
      isMouseDown = true
    }, threeCanvas)

    mouseupEvent((ev) => {
      isMouseDown = false
    }, threeCanvas)

    
    appState.drawFunctions.push((p: p5) => {
      // console.log("drawing circles", appState.circles.list.length)

    })

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })

  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <label>Cursor State</label>
  <select v-model="cursorState">
    <option value="drawNewPolygon">Draw New Polygon</option>
    <option value="addPointToPolygon">Add Point To Polygon</option>
    <option value="selectPolygon">Select Polygon</option>
  </select>
</template>

<style scoped></style>