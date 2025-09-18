<script setup lang="ts">
import { inject, onMounted, onUnmounted } from 'vue'
import CanvasRoot from '@/canvas/CanvasRoot.vue'
import StrokeLaunchControls from './StrokeLaunchControls.vue'
import { appStateName, type TemplateAppState, drawFlattenedStrokeGroup, resolution } from './appState'
import { updateGPUStrokes } from './strokeLauncher'
import type { CanvasStateSnapshot } from '@/canvas/canvasState'
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX'
import { clearListeners, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse'
import type p5 from 'p5'
import { sinN } from '@/channels/channels'

const appState = inject<TemplateAppState>(appStateName)!!

const syncCanvasState = (state: CanvasStateSnapshot) => {
  appState.freehandStateString = state.freehand.serializedState
  appState.freehandRenderData = state.freehand.bakedRenderData
  appState.freehandGroupMap = state.freehand.bakedGroupMap
  appState.polygonStateString = state.polygon.serializedState
  appState.polygonRenderData = state.polygon.bakedRenderData
  updateGPUStrokes()
}

let shaderGraphEndNode: ShaderEffect | undefined = undefined
const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

onMounted(() => {
  // p5/Three canvas elements
  const p5i = appState.p5Instance!!
  const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
  const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

  // Track mouse in p5 coordinates (available for future use)
  let p5Mouse = { x: 0, y: 0 }
  mousemoveEvent((ev) => {
    p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
  }, threeCanvas)

  // Simple deterministic color helper
  const rand = (n: number) => sinN(n * 123.23)
  const randColor = (seed: number) => ({
    r: rand(seed) * 255,
    g: rand(seed + 1) * 255,
    b: rand(seed + 2) * 255,
    a: 1
  })

  // Main p5 drawing function for this sketch
  appState.drawFunctions.push((p: p5) => {
    if (appState.polygonRenderData.length > 0) {
      p.push()
      appState.polygonRenderData.forEach((polygon, idx) => {
        const polygonMetadataColor = polygon.metadata?.color
        const color = polygonMetadataColor ?? randColor(idx)
        p.fill(color.r, color.g, color.b, color.a)
        p.noStroke()
        p.beginShape()
        polygon.points.forEach(point => {
          p.vertex(point.x, point.y)
        })
        p.endShape()
      })
      p.pop()
    }

    if (appState.freehandRenderData.length > 0) {
      drawFlattenedStrokeGroup(p, appState.freehandRenderData)
    }
  })

  // Wire p5 canvas through shader graph to three renderer
  const passthru = new Passthru({ src: p5Canvas })
  const canvasPaint = new CanvasPaint({ src: passthru })
  shaderGraphEndNode = canvasPaint
  appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)

  // Pause toggle
  singleKeydownEvent('p', () => { appState.paused = !appState.paused })
})

onUnmounted(() => {
  // Dispose shader graph and input listeners, and clear any registered draw funcs
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
})
</script>

<template>
  <CanvasRoot
    :sync-state="syncCanvasState"
    :initial-freehand-state="appState.freehandStateString"
    :initial-polygon-state="appState.polygonStateString"
    :width="resolution.width"
    :height="resolution.height"
    :show-timeline="true"
    :show-visualizations="true"
  />
  <StrokeLaunchControls />
</template>
