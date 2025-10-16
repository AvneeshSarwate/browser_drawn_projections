<script setup lang="ts">
import { inject, onMounted, onUnmounted, watch } from 'vue'
import type * as BABYLON from 'babylonjs'
import { appStateName, type FluidReactionAppState } from './appState'
import { CanvasPaint, FeedbackNode, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon'
import { FluidSimEffect } from '@/rendering/postFX/fluidSim.frag.generated'
import { FluidVisualizeEffect } from '@/rendering/postFX/fluidVisualize.frag.generated'
import { ReactionDiffusionEffect } from '@/rendering/postFX/reactionDiffusion.frag.generated'
import { ReactionVisualizeEffect } from '@/rendering/postFX/reactionVisualize.frag.generated'
import { DualViewEffect } from '@/rendering/postFX/dualView.frag.generated'
import { singleKeydownEvent, clearListeners } from '@/io/keyboardAndMouse'

const state = inject<FluidReactionAppState>(appStateName)!!

interface PointerState {
  x: number
  y: number
  vx: number
  vy: number
  down: boolean
}

const pointer: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  down: false,
}

let animationHandle: number | undefined
let shaderGraph: ShaderEffect | undefined
let fluidSim: FluidSimEffect | undefined
let fluidVisual: FluidVisualizeEffect | undefined
let fluidFeedback: FeedbackNode | undefined
let fluidInitial: PassthruEffect | undefined
let reactionSim: ReactionDiffusionEffect | undefined
let reactionVisual: ReactionVisualizeEffect | undefined
let reactionFeedback: FeedbackNode | undefined
let reactionInitial: PassthruEffect | undefined
let dualView: DualViewEffect | undefined
let canvasPaint: CanvasPaint | undefined

let forceCanvas: HTMLCanvasElement | undefined
let forceCtx: CanvasRenderingContext2D | null = null
let reactionSeedCanvas: HTMLCanvasElement | undefined
let reactionSeedCtx: CanvasRenderingContext2D | null = null

const pointerListeners: Array<{ type: string; listener: EventListenerOrEventListenerObject }> = []

function detachPointerHandlers(): void {
  const canvas = document.getElementById('simulationCanvas') as HTMLCanvasElement | null
  if (canvas) {
    pointerListeners.forEach(({ type, listener }) => canvas.removeEventListener(type, listener))
  }
  pointerListeners.length = 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function disposeGraph(): void {
  animationHandle && cancelAnimationFrame(animationHandle)
  animationHandle = undefined
  detachPointerHandlers()
  shaderGraph?.disposeAll()
  shaderGraph = undefined
  canvasPaint = undefined
  dualView = undefined
  fluidVisual = undefined
  fluidSim = undefined
  fluidFeedback?.dispose()
  fluidFeedback = undefined
  fluidInitial?.dispose()
  fluidInitial = undefined
  reactionVisual = undefined
  reactionSim = undefined
  reactionFeedback?.dispose()
  reactionFeedback = undefined
  reactionInitial?.dispose()
  reactionInitial = undefined
  forceCtx = null
  forceCanvas = undefined
  reactionSeedCtx = null
  reactionSeedCanvas = undefined
}

function attachPointerHandlers(canvas: HTMLCanvasElement): void {
  const updateFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const lastX = pointer.x
    const lastY = pointer.y
    pointer.x = nx
    pointer.y = ny
    pointer.vx = clamp((nx - lastX) * 20.0, -1, 1)
    pointer.vy = clamp((ny - lastY) * 20.0, -1, 1)
  }

  const handleMove = (event: PointerEvent) => {
    updateFromEvent(event)
  }
  const handleDown = (event: PointerEvent) => {
    pointer.down = true
    canvas.setPointerCapture(event.pointerId)
    updateFromEvent(event)
  }
  const handleUp = (event: PointerEvent) => {
    pointer.down = false
    pointer.vx = 0
    pointer.vy = 0
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    updateFromEvent(event)
  }
  const handleLeave = () => {
    pointer.down = false
    pointer.vx = 0
    pointer.vy = 0
  }

  canvas.addEventListener('pointermove', handleMove)
  canvas.addEventListener('pointerdown', handleDown)
  canvas.addEventListener('pointerup', handleUp)
  canvas.addEventListener('pointercancel', handleUp)
  canvas.addEventListener('pointerleave', handleLeave)

  pointerListeners.push({ type: 'pointermove', listener: handleMove })
  pointerListeners.push({ type: 'pointerdown', listener: handleDown })
  pointerListeners.push({ type: 'pointerup', listener: handleUp })
  pointerListeners.push({ type: 'pointercancel', listener: handleUp })
  pointerListeners.push({ type: 'pointerleave', listener: handleLeave })
}

function createFluidInitialCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const dx = (x / width) - 0.5
      const dy = (y / height) - 0.5
      const radius = Math.sqrt(dx * dx + dy * dy)
      const density = radius < 0.22 ? 90 : 0
      image.data[index + 0] = 0
      image.data[index + 1] = 0
      image.data[index + 2] = density
      image.data[index + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function createReactionInitialCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(width, height)
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) * 0.08
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const dx = x - cx
      const dy = y - cy
      const distSq = dx * dx + dy * dy
      const inside = distSq < radius * radius
      image.data[index + 0] = 255
      image.data[index + 1] = inside ? 200 : 0
      image.data[index + 2] = 0
      image.data[index + 3] = 255
      if (Math.random() < 0.002) {
        image.data[index + 1] = 160
      }
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function updateForceField(): void {
  if (!forceCtx || !forceCanvas) {
    return
  }
  forceCtx.fillStyle = 'rgba(0, 0, 0, 0.08)'
  forceCtx.fillRect(0, 0, forceCanvas.width, forceCanvas.height)
  if (!pointer.down) {
    return
  }
  const px = pointer.x * forceCanvas.width
  const py = pointer.y * forceCanvas.height
  const radius = Math.max(forceCanvas.width, forceCanvas.height) * 0.05
  const vx = clamp(pointer.vx * 0.5 + 0.5, 0, 1)
  const vy = clamp(pointer.vy * 0.5 + 0.5, 0, 1)
  forceCtx.fillStyle = `rgba(${Math.floor(vx * 255)}, ${Math.floor(vy * 255)}, 210, 0.85)`
  forceCtx.beginPath()
  forceCtx.arc(px, py, radius, 0, Math.PI * 2)
  forceCtx.fill()
}

function updateReactionSeed(): void {
  if (!reactionSeedCtx || !reactionSeedCanvas) {
    return
  }
  reactionSeedCtx.fillStyle = 'rgba(0, 0, 0, 0.015)'
  reactionSeedCtx.fillRect(0, 0, reactionSeedCanvas.width, reactionSeedCanvas.height)
  if (!pointer.down) {
    return
  }
  const px = pointer.x * reactionSeedCanvas.width
  const py = pointer.y * reactionSeedCanvas.height
  const radius = Math.max(reactionSeedCanvas.width, reactionSeedCanvas.height) * 0.04
  const gradient = reactionSeedCtx.createRadialGradient(px, py, 0, px, py, radius)
  gradient.addColorStop(0, 'rgba(255, 140, 40, 0.65)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  reactionSeedCtx.fillStyle = gradient
  reactionSeedCtx.beginPath()
  reactionSeedCtx.arc(px, py, radius, 0, Math.PI * 2)
  reactionSeedCtx.fill()
}

function startLoop(engine: BABYLON.WebGPUEngine): void {
  const render = () => {
    if (!engine || engine.isDisposed()) {
      animationHandle = undefined
      return
    }
    updateForceField()
    updateReactionSeed()
    if (!state.paused) {
      engine.beginFrame()
      try {
        shaderGraph?.renderAll(engine)
      } finally {
        engine.endFrame()
      }
    }
    animationHandle = requestAnimationFrame(render)
  }
  animationHandle = requestAnimationFrame(render)
}

function setupEngine(engine: BABYLON.WebGPUEngine): void {
  disposeGraph()
  const { width, height } = state
  forceCanvas = document.createElement('canvas')
  forceCanvas.width = width
  forceCanvas.height = height
  forceCtx = forceCanvas.getContext('2d')
  if (forceCtx) {
    forceCtx.fillStyle = 'rgba(0, 0, 0, 1)'
    forceCtx.fillRect(0, 0, width, height)
  }

  reactionSeedCanvas = document.createElement('canvas')
  reactionSeedCanvas.width = width
  reactionSeedCanvas.height = height
  reactionSeedCtx = reactionSeedCanvas.getContext('2d')
  if (reactionSeedCtx) {
    reactionSeedCtx.fillStyle = 'rgba(0, 0, 0, 1)'
    reactionSeedCtx.fillRect(0, 0, width, height)
  }

  const fluidInitialCanvas = createFluidInitialCanvas(width, height)
  const reactionInitialCanvas = createReactionInitialCanvas(width, height)

  fluidInitial = new PassthruEffect(engine, { src: fluidInitialCanvas }, width, height, 'linear', 'half_float')
  fluidFeedback = new FeedbackNode(engine, fluidInitial, width, height, 'linear', 'half_float')
  fluidSim = new FluidSimEffect(engine, { state: fluidFeedback, forces: forceCanvas! }, width, height, 'linear', 'half_float')
  fluidSim.setUniforms({
    timeStep: 0.016,
    velocityDissipation: 0.985,
    densityDissipation: 0.995,
    swirlStrength: 2.5,
    turbulence: 0.18,
    forceRadius: 0.12,
    forceStrength: 18,
    attraction: 0.35,
    forcePosition: () => [pointer.x, pointer.y],
  })
  fluidFeedback.setFeedbackSrc(fluidSim)
  fluidVisual = new FluidVisualizeEffect(engine, { state: fluidSim }, width, height, 'linear')

  reactionInitial = new PassthruEffect(engine, { src: reactionInitialCanvas }, width, height, 'linear', 'half_float')
  reactionFeedback = new FeedbackNode(engine, reactionInitial, width, height, 'linear', 'half_float')
  reactionSim = new ReactionDiffusionEffect(engine, { state: reactionFeedback, seed: reactionSeedCanvas! }, width, height, 'linear', 'half_float')
  reactionSim.setUniforms({
    feed: 0.055,
    kill: 0.062,
    diffRateA: 1.0,
    diffRateB: 0.5,
    deltaT: 1.0,
    brushRadius: 0.035,
    brushStrength: 0.85,
    noiseAmount: 0.015,
    brushPosition: () => [pointer.x, pointer.y],
  })
  reactionFeedback.setFeedbackSrc(reactionSim)
  reactionVisual = new ReactionVisualizeEffect(engine, { state: reactionSim }, width, height, 'linear')

  dualView = new DualViewEffect(engine, { left: fluidVisual, right: reactionVisual }, width, height, 'linear')
  canvasPaint = new CanvasPaint(engine, { src: dualView }, width, height, 'linear', 'half_float')
  shaderGraph = canvasPaint

  const canvas = document.getElementById('simulationCanvas') as HTMLCanvasElement | null
  if (canvas) {
    attachPointerHandlers(canvas)
  }
  startLoop(engine)
}

onMounted(() => {
  singleKeydownEvent('p', () => {
    state.paused = !state.paused
  })

  watch(
    () => state.engine,
    (engine) => {
      if (engine) {
        setupEngine(engine)
      } else {
        disposeGraph()
      }
    },
    { immediate: true },
  )
})

onUnmounted(() => {
  detachPointerHandlers()
  clearListeners()
  disposeGraph()
})
</script>

<template>
  <div />
</template>
