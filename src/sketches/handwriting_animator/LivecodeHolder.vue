<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from 'vue'
import CanvasRoot from '@/canvas/CanvasRoot.vue'
import StrokeLaunchControls from './StrokeLaunchControls.vue'
import { appStateName, type TemplateAppState, drawFlattenedStrokeGroup, resolution } from './appState'
import { updateGPUStrokes, getDrawingScene } from './strokeLauncher'
import type { CanvasStateSnapshot } from '@/canvas/canvasState'
import { CanvasPaint as GLCanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX'
import { CanvasPaint as BabylonCanvasPaint, PassthruEffect, FeedbackNode } from '@/rendering/shaderFXBabylon'
import { AlphaTimeTagEffect } from '@/rendering/postFX/alphaTimeTag.frag.generated'
import { FloodFillStepEffect } from '@/rendering/postFX/floodFillStep.frag.generated'
import { clearListeners, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse'
import type p5 from 'p5'
import { sinN } from '@/channels/channels'
import type { DrawingScene } from '@/rendering/gpuStrokes/drawingScene'
import { getPreset } from './presets'

const appState = inject<TemplateAppState>(appStateName)!!
const canvasRootRef = ref<InstanceType<typeof CanvasRoot> | null>(null)

const syncCanvasState = (state: CanvasStateSnapshot) => {
  appState.freehandStateString = state.freehand.serializedState
  appState.freehandRenderData = state.freehand.bakedRenderData
  appState.freehandGroupMap = state.freehand.bakedGroupMap
  appState.polygonStateString = state.polygon.serializedState
  appState.polygonRenderData = state.polygon.bakedRenderData
  updateGPUStrokes()
}

let glShaderGraph: ShaderEffect | undefined = undefined
let gpuCanvasPaint: BabylonCanvasPaint | undefined = undefined
let drawingSceneRef: DrawingScene | undefined = undefined
const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

const saveFreehandRenderData = () => {
  const json = JSON.stringify(appState.freehandRenderData, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const downloader = document.createElement('a')
  downloader.href = url
  downloader.download = `freehandRenderData-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  downloader.click()
  URL.revokeObjectURL(url)
}

const sleepWait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  const presetName = params.get('preset')
  
  if (presetName && canvasRootRef.value) {
    const preset = getPreset(presetName)
    if (preset) {
      const canvasState = (canvasRootRef.value as any).canvasState
      if (canvasState) {
        try {
          await preset(canvasState)
        } catch (error) {
          console.error(`Failed to apply preset "${presetName}":`, error)
        }
      }
    }
  }

  // p5/Three canvas elements
  const p5i = appState.p5Instance!!
  const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
  const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

  while (!appState.gpuStrokesReadyPromise) {
    await sleepWait(16)
  }
  const gpuReady = await appState.gpuStrokesReadyPromise

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
  const canvasPaint = new GLCanvasPaint({ src: passthru })
  glShaderGraph = canvasPaint

  if (gpuReady) {
    gpuCanvasPaint?.disposeAll()
    gpuCanvasPaint = undefined
    drawingSceneRef = undefined

    const drawingScene = getDrawingScene()
    const renderTarget = drawingScene?.getRenderTarget()
    if (drawingScene && renderTarget) {
      const size = renderTarget.getSize()
      const width = size.width
      const height = size.height
      const engine = drawingScene.getEngine()
      const sampleMode: 'nearest' | 'linear' = 'nearest'

      const timeTag = new AlphaTimeTagEffect(engine, { src: renderTarget }, width, height, sampleMode)
      timeTag.setUniforms({ drawTime: () => performance.now() * 0.001 })

      const floodFillSeed = new FloodFillStepEffect(engine, { seed: timeTag, feedback: timeTag }, width, height, sampleMode)

      const passThruForFeedback = new PassthruEffect(engine, { src: floodFillSeed }, width, height, sampleMode, 'half_float')

      const feedbackNode = new FeedbackNode(engine, passThruForFeedback, width, height, sampleMode, 'half_float')

      const floodFillFinal = new FloodFillStepEffect(engine, { seed: timeTag, feedback: feedbackNode }, width, height, sampleMode)
      feedbackNode.setFeedbackSrc(floodFillFinal)

      gpuCanvasPaint = new BabylonCanvasPaint(engine, { src: renderTarget }, width, height)
      drawingSceneRef = drawingScene
    } else {
      console.warn('DrawingScene render target unavailable; GPU strokes will not render to canvas')
      gpuCanvasPaint = undefined
      drawingSceneRef = undefined
    }
  } else {
    gpuCanvasPaint?.disposeAll()
    gpuCanvasPaint = undefined
    drawingSceneRef = undefined
  }

  appState.shaderDrawFunc = () => {
    if (glShaderGraph && appState.threeRenderer) {
      glShaderGraph.renderAll(appState.threeRenderer)
    }

    //codex - add  
    if (drawingSceneRef && gpuCanvasPaint) {
      const engine = drawingSceneRef.getEngine()
      engine.beginFrame()
      try {
        drawingSceneRef.renderFrame()
        gpuCanvasPaint.renderAll(engine as any)
      } finally {
        engine.endFrame()
      }
    }
  }

  // Pause toggle
  singleKeydownEvent('p', () => { appState.paused = !appState.paused })
})

onUnmounted(() => {
  // Dispose shader graph and input listeners, and clear any registered draw funcs
  glShaderGraph?.disposeAll()
  glShaderGraph = undefined
  gpuCanvasPaint?.disposeAll()
  gpuCanvasPaint = undefined
  drawingSceneRef = undefined
  appState.shaderDrawFunc = undefined
  clearListeners()
  clearDrawFuncs()
})
</script>

<template>
  <CanvasRoot
    ref="canvasRootRef"
    :sync-state="syncCanvasState"
    :initial-freehand-state="appState.freehandStateString"
    :initial-polygon-state="appState.polygonStateString"
    :width="resolution.width"
    :height="resolution.height"
    :show-timeline="true"
    :show-visualizations="true"
  />
  <button type="button" @click="saveFreehandRenderData">
    Save Freehand JSON
  </button>
  <StrokeLaunchControls />
</template>
