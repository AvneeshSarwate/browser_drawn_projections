<script setup lang="ts">
import { appStateName, type Power2DTestAppState, bypassPostRef, engineRef, shaderGraphEndNodeRef, resolution } from './appState';
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue';
import { CanvasPaint, FeedbackNode, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon';
import { VerticalBlurEffect } from '@/rendering/postFX/verticalBlur.frag.generated';
import { HorizontalBlurEffect } from '@/rendering/postFX/horizontalBlur.frag.generated';
import { LayerBlendEffect } from '@/rendering/postFX/layerBlend.frag.generated';
import { TransformEffect } from '@/rendering/postFX/transform.frag.generated';
import { BloomEffect } from '@/rendering/postFX/bloom.frag.generated';
import * as BABYLON from 'babylonjs';
import { createPower2DScene, RectPts, CirclePts, StyledShape, BatchedStyledShape, CanvasTexture } from '@/rendering/power2d';
import { BasicMaterial } from './basic.material.wgsl.generated';
import { BasicStrokeMaterial } from './basic.strokeMaterial.wgsl.generated';
import { InstancedBasicMaterial } from './instancedBasic.material.wgsl.generated';
import { WebcamPixelMaterial } from './webcamPixel.material.wgsl.generated';
import { RunnerStrokeMaterial } from './runner.strokeMaterial.wgsl.generated';
import * as gridCircleShader from './gridCircleInstances.compute.wgsl.generated';

const TEST_CANVAS_SIZE = { width: 320, height: 200 }
const QUAD_GRID_SIZE = 100
const QUAD_INSTANCE_COUNT = QUAD_GRID_SIZE * QUAD_GRID_SIZE

const appState = inject<Power2DTestAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let engineWatcher: WatchStopHandle | undefined

let powerScene: BABYLON.Scene | undefined
let powerCamera: BABYLON.FreeCamera | undefined
let powerTarget: BABYLON.RenderTargetTexture | undefined
let powerShapes: Array<StyledShape<any, any>> = []
let batchedCircles: BatchedStyledShape<any, any, any> | undefined
let webcamRect: StyledShape<any, any> | undefined
let testCanvasTexture: CanvasTexture | undefined
let bypassCanvasPaint: CanvasPaint | undefined
let computeQuads: BatchedStyledShape<any, any, any> | undefined
let gridCircleSettingsState: gridCircleShader.SettingsUniformState | undefined
let gridCircleShaderState: gridCircleShader.ShaderState | undefined

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
    strokeMaterial: BasicStrokeMaterial,
    strokeThickness: 6,
    canvasWidth: width,
    canvasHeight: height,
  })
  rect.alphaIndex = 1

  const circle = new StyledShape({
    scene: powerScene,
    points: CirclePts({ cx: 700, cy: 380, radius: 120, segments: 48 }),
    bodyMaterial: BasicMaterial,
    strokeMaterial: RunnerStrokeMaterial,
    strokeThickness: 10,
    canvasWidth: width,
    canvasHeight: height,
  })
  circle.alphaIndex = 2

  const instancedCount = 6
  const instancedBasePositions: Array<[number, number]> = [
    [220, 520],
    [320, 560],
    [420, 520],
    [520, 560],
    [620, 520],
    [720, 560],
  ]

  batchedCircles = new BatchedStyledShape({
    scene: powerScene,
    points: CirclePts({ cx: 0, cy: 0, radius: 26, segments: 20 }),
    material: InstancedBasicMaterial,
    instanceCount: instancedCount,
    canvasWidth: width,
    canvasHeight: height,
  })

  for (let i = 0; i < instancedCount; i++) {
    const [x, y] = instancedBasePositions[i]
    batchedCircles.writeInstanceAttr(i, {
      offset: [x, y],
      scale: 1.0,
      rotation: i * 0.2,
      tint: [0.8, 0.9, 1.0],
    })
  }
  batchedCircles.beforeRender()

  computeQuads = new BatchedStyledShape({
    scene: powerScene,
    points: RectPts({ x: -1, y: -1, width: 5, height: 5 }),
    material: InstancedBasicMaterial,
    instanceCount: QUAD_INSTANCE_COUNT,
    canvasWidth: width,
    canvasHeight: height,
  })
  computeQuads.setExternalBufferMode(true)

  const quadCenterX = width * 0.6
  const quadCenterY = height * 0.62
  const quadExtent = Math.min(width, height) * 0.32
  const quadRadius = quadExtent * 0.9

  gridCircleSettingsState = gridCircleShader.createUniformBuffer_settings(engine, {
    time: 0,
    speed: 0.35,
    centerX: quadCenterX,
    centerY: quadCenterY,
    gridExtent: quadExtent,
    circleRadius: quadRadius,
    quadScale: 1.0,
    gridSize: QUAD_GRID_SIZE,
    instanceCount: QUAD_INSTANCE_COUNT,
  })

  gridCircleShaderState = gridCircleShader.createShader(engine, {
    settings: gridCircleSettingsState,
    instanceData: computeQuads.getInstanceBuffer(),
  })

  const webcamAspect = TEST_CANVAS_SIZE.width / TEST_CANVAS_SIZE.height
  const webcamHeight = 240
  const webcamWidth = Math.round(webcamHeight * webcamAspect)
  webcamRect = new StyledShape({
    scene: powerScene,
    points: RectPts({ x: 860, y: 80, width: webcamWidth, height: webcamHeight }),
    bodyMaterial: WebcamPixelMaterial,
    canvasWidth: width,
    canvasHeight: height,
  })
  webcamRect.alphaIndex = 0
  if (webcamRect && powerScene) {
    const canvas = document.createElement('canvas')
    canvas.width = TEST_CANVAS_SIZE.width
    canvas.height = TEST_CANVAS_SIZE.height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      grad.addColorStop(0, '#ff6b6b')
      grad.addColorStop(1, '#4d96ff')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.fillRect(20, 20, 120, 60)
      ctx.fillStyle = '#111'
      ctx.font = '20px sans-serif'
      ctx.fillText('Power2D', 28, 58)
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(240, 120, 40, 0, Math.PI * 2)
      ctx.stroke()
    }
    testCanvasTexture = new CanvasTexture({
      engine,
      scene: powerScene,
      width: canvas.width,
      height: canvas.height,
      samplingMode: BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    })
    testCanvasTexture.update(canvas)
    webcamRect.body.setTexture('webcamTex', testCanvasTexture.texture)
  }

  powerShapes = [rect, circle]
  if (webcamRect) {
    powerShapes.push(webcamRect)
  }

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
  powerTarget.renderList = powerScene.meshes
  powerTarget.activeCamera = powerCamera
  powerTarget.ignoreCameraViewport = true
  powerTarget.clearColor = new BABYLON.Color4(0, 0, 0, 0)

  if (powerCamera) {
    powerCamera.outputRenderTarget = null
  }

  const passthru = new PassthruEffect(engine, { src: powerTarget }, width, height, 'nearest')
  const bypassPassthru = new PassthruEffect(engine, { src: powerTarget }, width, height, 'nearest')
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
  bypassCanvasPaint = new CanvasPaint(engine, { src: bypassPassthru }, width, height)
  shaderGraphEndNode = canvasPaint
  shaderGraphEndNodeRef.value = shaderGraphEndNode

  // Static canvas texture already bound above.

  appState.shaderDrawFunc = () => {
    const time = performance.now() * 0.001

    rect.setCanvasSize(width, height)
    circle.setCanvasSize(width, height)
    rect.body.setUniforms({ time, color: new BABYLON.Vector3(1, 0.4, 0.2) })
    rect.stroke?.setUniforms({ color: new BABYLON.Vector3(1.0, 0.9, 0.0) })
    circle.body.setUniforms({ time: time + 1.2, color: new BABYLON.Vector3(0.2, 0.6, 1.0) })
    circle.stroke?.setUniforms({
      time,
      speed: 0.15,
      segmentLength: 0.18,
      feather: 0.06,
    })

    if (batchedCircles) {
      batchedCircles.setCanvasSize(width, height)
      batchedCircles.setUniforms({ time, color: new BABYLON.Vector3(0.6, 0.9, 0.7) })
      for (let i = 0; i < instancedCount; i++) {
        const [baseX, baseY] = instancedBasePositions[i]
        const offsetX = Math.sin(time * 1.3 + i) * 12
        const offsetY = Math.cos(time * 1.1 + i) * 10
        batchedCircles.writeInstanceAttr(i, {
          offset: [baseX + offsetX, baseY + offsetY],
          rotation: time * 0.6 + i * 0.4,
        })
      }
      batchedCircles.beforeRender()
    }

    if (webcamRect) {
      webcamRect.setCanvasSize(width, height)
      webcamRect.body.setUniforms({
        pixelSize: 8,
        tint: new BABYLON.Vector3(1.0, 1.0, 1.0),
        opacity: 1.0,
      })
    }

    if (computeQuads && gridCircleShaderState && gridCircleSettingsState) {
      computeQuads.setCanvasSize(width, height)
      computeQuads.setUniforms({ time, color: new BABYLON.Vector3(0.9, 0.95, 1.0) })
      gridCircleShader.updateUniformBuffer_settings(gridCircleSettingsState, { time })
      const quadGroups = Math.ceil(QUAD_INSTANCE_COUNT / 256)
      gridCircleShaderState.shader.dispatchWhenReady(quadGroups, 1, 1)
    }

    engine.beginFrame()
    powerTarget?.render()
    engine.restoreDefaultFramebuffer()
    if (bypassPostRef.value) {
      bypassCanvasPaint?.renderAll(engine as any)
      engine.endFrame()
      return
    }
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
  bypassCanvasPaint?.disposeAll()
  bypassCanvasPaint = undefined
  shaderGraphEndNode?.disposeAll()
  shaderGraphEndNode = undefined
  shaderGraphEndNodeRef.value = undefined
  appState.shaderDrawFunc = undefined

  powerShapes.forEach((shape) => shape.dispose())
  powerShapes = []
  batchedCircles?.dispose()
  batchedCircles = undefined
  webcamRect = undefined
  if (testCanvasTexture) {
    testCanvasTexture.dispose()
    testCanvasTexture = undefined
  }
  gridCircleShaderState?.shader.dispose()
  gridCircleShaderState = undefined
  if (gridCircleSettingsState) {
    gridCircleSettingsState.buffer.dispose()
    gridCircleSettingsState = undefined
  }
  computeQuads?.dispose()
  computeQuads = undefined
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
