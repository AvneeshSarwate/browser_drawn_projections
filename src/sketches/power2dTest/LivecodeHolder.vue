<script setup lang="ts">
import { appStateName, type Power2DTestAppState, engineRef, shaderGraphEndNodeRef, resolution } from './appState';
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue';
import { CanvasPaint, FeedbackNode, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon';
import { VerticalBlurEffect } from '@/rendering/postFX/verticalBlur.frag.generated';
import { HorizontalBlurEffect } from '@/rendering/postFX/horizontalBlur.frag.generated';
import { LayerBlendEffect } from '@/rendering/postFX/layerBlend.frag.generated';
import { TransformEffect } from '@/rendering/postFX/transform.frag.generated';
import { BloomEffect } from '@/rendering/postFX/bloom.frag.generated';
import * as BABYLON from 'babylonjs';
import { createPower2DScene, RectPts, CirclePts, StyledShape } from '@/rendering/power2d';
import { BasicMaterial } from './basic.material.wgsl.generated';

const appState = inject<Power2DTestAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let engineWatcher: WatchStopHandle | undefined

let powerScene: BABYLON.Scene | undefined
let powerCamera: BABYLON.FreeCamera | undefined
let powerTarget: BABYLON.RenderTargetTexture | undefined
let powerShapes: Array<StyledShape<any, any>> = []

const clearDrawFuncs = () => {
  appState.drawFunctions.length = 0
  appState.drawFuncMap.clear()
}

const setupSketch = (engine: BABYLON.WebGPUEngine) => {
  shaderGraphEndNodeRef.value = undefined
  clearDrawFuncs()

  const dpr = window.devicePixelRatio || 1
  const width = resolution.width * dpr
  const height = resolution.height * dpr

  const power2d = createPower2DScene({
    engine,
    canvasWidth: width,
    canvasHeight: height,
    clearColor: new BABYLON.Color4(0, 0, 0, 0),
  })
  powerScene = power2d.scene
  powerCamera = power2d.camera

  const rect = new StyledShape({
    scene: powerScene,
    points: RectPts({ x: 150, y: 120, width: 300, height: 200 }),
    bodyMaterial: BasicMaterial,
    canvasWidth: width,
    canvasHeight: height,
  })
  rect.alphaIndex = 1

  const circle = new StyledShape({
    scene: powerScene,
    points: CirclePts({ cx: 700, cy: 380, radius: 120, segments: 48 }),
    bodyMaterial: BasicMaterial,
    canvasWidth: width,
    canvasHeight: height,
  })
  circle.alphaIndex = 2

  powerShapes = [rect, circle]

  powerTarget = new BABYLON.RenderTargetTexture(
    'power2dRT',
    { width, height },
    powerScene,
    false,
    true,
    BABYLON.Engine.TEXTURETYPE_HALF_FLOAT,
    false,
    BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    false,
  )
  powerTarget.renderList = [rect.body.mesh, circle.body.mesh]
  powerTarget.activeCamera = powerCamera
  powerTarget.ignoreCameraViewport = true
  powerTarget.clearColor = new BABYLON.Color4(0, 0, 0, 0)

  const passthru = new PassthruEffect(engine, { src: powerTarget }, width, height, 'nearest')
  const feedback = new FeedbackNode(engine, passthru, width, height, 'linear', 'half_float')
  const vertBlur = new VerticalBlurEffect(engine, { src: feedback }, width, height)
  const horBlur = new HorizontalBlurEffect(engine, { src: vertBlur }, width, height)
  const transform = new TransformEffect(engine, { src: horBlur }, width, height)
  const layerOverlay = new LayerBlendEffect(engine, { src1: passthru, src2: transform }, width, height)
  feedback.setFeedbackSrc(layerOverlay)

  const bloom = new BloomEffect(engine, { src: layerOverlay }, width, height)

  transform.setUniforms({ rotate: 0, anchor: [0.5, 0.5], translate: [0, 0], scale: [0.995, 0.995] })
  vertBlur.setUniforms({ pixels: 2, resolution: height })
  horBlur.setUniforms({ pixels: 2, resolution: width })

  const canvasPaint = new CanvasPaint(engine, { src: bloom }, width, height)
  shaderGraphEndNode = canvasPaint
  shaderGraphEndNodeRef.value = shaderGraphEndNode

  appState.shaderDrawFunc = () => {
    const time = performance.now() * 0.001

    rect.setCanvasSize(width, height)
    circle.setCanvasSize(width, height)
    rect.body.setUniforms({ time, color: new BABYLON.Vector3(1, 0.4, 0.2) })
    circle.body.setUniforms({ time: time + 1.2, color: new BABYLON.Vector3(0.2, 0.6, 1.0) })

    engine.beginFrame()
    powerTarget?.render()
    engine.restoreDefaultFramebuffer()
    shaderGraphEndNode!.renderAll(engine as any)
    engine.endFrame()
  }
}

onMounted(() => {
  const engine = engineRef.value
  if (engine) {
    setupSketch(engine)
  } else {
    engineWatcher = watch(
      engineRef,
      (engineValue) => {
        if (engineValue) {
          engineWatcher?.()
          engineWatcher = undefined
          setupSketch(engineValue)
        }
      },
      { immediate: true }
    )
  }
})

onUnmounted(() => {
  engineWatcher?.()
  engineWatcher = undefined
  clearDrawFuncs()
  shaderGraphEndNode?.disposeAll()
  shaderGraphEndNode = undefined
  shaderGraphEndNodeRef.value = undefined
  appState.shaderDrawFunc = undefined

  powerShapes.forEach((shape) => shape.dispose())
  powerShapes = []
  powerTarget?.dispose()
  powerTarget = undefined
  powerScene?.dispose()
  powerScene = undefined
  powerCamera = undefined
})
</script>

<template>
  <div></div>
</template>

<style scoped></style>
