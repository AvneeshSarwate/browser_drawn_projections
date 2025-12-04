<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from 'vue'
import CanvasRoot from '@/canvas/CanvasRoot.vue'
import { appStateName, engineRef, type TemplateAppState, drawFlattenedStrokeGroup, resolution, textAnimMetadataSchema, textStyleMetadataSchema } from './appState'
import type { CanvasStateSnapshot } from '@/canvas/canvasState'
import { CanvasPaint, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon'
import { clearListeners, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse'
import type p5 from 'p5'
import { sinN } from '@/channels/channels'
import { getPreset } from './presets'
import { DropAndScrollManager } from './dropAndScroll'
import { MatterExplodeManager } from './matterExplode'
import { FONT_FAMILY, FONT_SIZE, getTextStyle, getTextAnim } from './textRegionUtils'

const appState = inject<TemplateAppState>(appStateName)!!
const canvasRootRef = ref<InstanceType<typeof CanvasRoot> | null>(null)
const dropAndScrollManager = new DropAndScrollManager(() => appState.p5Instance)
const matterExplodeManager = new MatterExplodeManager(() => appState.p5Instance)

const metadataSchemas = [textAnimMetadataSchema, textStyleMetadataSchema]

const syncCanvasState = (state: CanvasStateSnapshot) => {
  appState.freehandStateString = state.freehand.serializedState
  appState.freehandRenderData = state.freehand.bakedRenderData
  appState.freehandGroupMap = state.freehand.bakedGroupMap
  appState.polygonStateString = state.polygon.serializedState
  appState.polygonRenderData = state.polygon.bakedRenderData
  const polygonSyncPayload = {
    current: state.polygon.bakedRenderData,
    added: state.added.polygon.bakedRenderData,
    deleted: state.deleted.polygon.bakedRenderData,
    changed: state.changed.polygon.bakedRenderData
  }

  const preManagerTime = performance.now()
  matterExplodeManager.syncPolygons(polygonSyncPayload)
  
  const midManagerTime = performance.now()
  
  dropAndScrollManager.syncPolygons(polygonSyncPayload)
  const postManagerTime = performance.now()
  console.log("manager update", postManagerTime-preManagerTime, postManagerTime-midManagerTime)
}

let glShaderGraph: ShaderEffect | undefined = undefined
const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
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

  while (!engineRef.value) {
    await sleepWait(16)
  }
  const engine = engineRef.value!

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
    const dropStates = dropAndScrollManager.getRenderStates()
    const matterStates = matterExplodeManager.getRenderStates()

    if (appState.polygonRenderData.length > 0) {
      p.push()
      appState.polygonRenderData.forEach((polygon, idx) => {
        const textStyle = getTextStyle(polygon.metadata)
        const textColor = textStyle.textColor
        const to255 = (c: number) => c <= 1 ? c * 255 : c
        const baseColor = textColor
          ? { r: to255(textColor.r), g: to255(textColor.g), b: to255(textColor.b), a: 255 }
          : polygon.metadata?.color
            ? { ...polygon.metadata.color }
            : randColor(idx)
        const color = { ...baseColor, a: baseColor.a ?? 255 }
        const textSize = textStyle.textSize ?? FONT_SIZE
        const fontFamily = textStyle.fontFamily ?? FONT_FAMILY
        const fontStyle = textStyle.fontStyle ?? 'NORMAL'
        const textAnim = getTextAnim(polygon.metadata)
        const fillAnim = textAnim.fillAnim
        const isDropAndScroll = fillAnim === 'dropAndScroll'
        const isMatterExplode = fillAnim === 'matterExplode'
        const renderState = isDropAndScroll
          ? dropStates.get(polygon.id)
          : isMatterExplode
            ? matterStates.get(polygon.id)
            : undefined

        if (isDropAndScroll || isMatterExplode) {
          p.noStroke()
          p.fill(color.r, color.g, color.b, color.a)
          p.textFont(fontFamily)
          p.textSize(textSize)
          // Apply font style (p5 constants: NORMAL, ITALIC, BOLD, BOLDITALIC)
          if (fontStyle === 'NORMAL') p.textStyle(p.NORMAL)
          else if (fontStyle === 'ITALIC') p.textStyle(p.ITALIC)
          else if (fontStyle === 'BOLD') p.textStyle(p.BOLD)
          else if (fontStyle === 'BOLDITALIC') p.textStyle(p.BOLDITALIC)

          if (renderState && renderState.letters.length > 0 && renderState.text.length > 0) {
            renderState.letters.forEach(({ pos, idx: letterIdx }) => {
              const char = renderState.text[(letterIdx + renderState.textOffset) % renderState.text.length]
              p.text(char, pos.x, pos.y)
            })
          } else {
            p.push()
            p.noFill()
            p.stroke(color.r, color.g, color.b, color.a)
            p.beginShape()
            polygon.points.forEach(point => {
              p.vertex(point.x, point.y)
            })
            p.endShape(p.CLOSE)
            p.pop()
          }
        } else {
          p.fill(color.r, color.g, color.b, color.a)
          p.noStroke()
          p.beginShape()
          polygon.points.forEach(point => {
            p.vertex(point.x, point.y)
          })
          p.endShape()
        }
      })
      p.pop()
    }

    if (appState.freehandRenderData.length > 0) {
      drawFlattenedStrokeGroup(p, appState.freehandRenderData)
    }
  })

  // Wire p5 canvas through shader graph to three renderer
  const dpr = window.devicePixelRatio || 1
  const renderWidth = resolution.width * dpr
  const renderHeight = resolution.height * dpr

  const passthru = new PassthruEffect(engine, { src: p5Canvas }, renderWidth, renderHeight, 'linear')
  const canvasPaint = new CanvasPaint(engine, { src: passthru }, renderWidth, renderHeight)
  glShaderGraph = canvasPaint


  appState.shaderDrawFunc = () => {
    const eng = engineRef.value
    if (glShaderGraph && eng) {
      eng.beginFrame()
      glShaderGraph.renderAll(eng)
      eng.endFrame()
    }

  }

  // Pause toggle
  singleKeydownEvent('p', () => { appState.paused = !appState.paused })
})

onUnmounted(() => {
  // Dispose shader graph and input listeners, and clear any registered draw funcs
  glShaderGraph?.disposeAll()
  glShaderGraph = undefined
  appState.shaderDrawFunc = undefined
  dropAndScrollManager.dispose()
  matterExplodeManager.dispose()
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
    :show-timeline="false"
    :show-visualizations="false"
    :metadata-schemas="metadataSchemas"
  />
</template>
