<script setup lang="ts">
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue'
import type * as BABYLON from 'babylonjs'
import { appStateName, engineRef, type FluidReactionAppState } from './appState'
import { CanvasPaint, FeedbackNode, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon'
import { FluidSimEffect } from '@/rendering/postFX/fluidSim.frag.generated'
import { FluidVisualizeEffect } from '@/rendering/postFX/fluidVisualize.frag.generated'
import { ReactionDiffusionEffect } from '@/rendering/postFX/reactionDiffusion.frag.generated'
import { ReactionVisualizeEffect } from '@/rendering/postFX/reactionVisualize.frag.generated'
import { clearListeners, pointerdownEvent, pointermoveEvent, pointerupEvent, singleKeydownEvent } from '@/io/keyboardAndMouse'

const state = inject<FluidReactionAppState>(appStateName)!!

interface PointerState {
  x: number
  y: number
  vx: number
  vy: number
  down: boolean
}

const fluidPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  down: false,
}

const reactionPointer: PointerState = {
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
let fluidCanvasPaint: CanvasPaint | undefined
let reactionCanvasPaint: CanvasPaint | undefined

let forceCanvas: HTMLCanvasElement | undefined
let forceCtx: CanvasRenderingContext2D | null = null
let reactionSeedCanvas: HTMLCanvasElement | undefined
let reactionSeedCtx: CanvasRenderingContext2D | null = null

const pointerBindings = new Map<HTMLCanvasElement, { cancel: (e: PointerEvent) => void; leave: (e: PointerEvent) => void }>()
let engineWatcher: WatchStopHandle | undefined

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function disposeGraph(): void {
  animationHandle && cancelAnimationFrame(animationHandle)
  animationHandle = undefined
  releasePointerHandlers()
  shaderGraph?.disposeAll()
  shaderGraph = undefined
  fluidCanvasPaint = undefined
  reactionCanvasPaint = undefined
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

function releasePointerHandlers(): void {
  for (const [canvas, { cancel, leave }] of pointerBindings) {
    canvas.removeEventListener('pointercancel', cancel)
    canvas.removeEventListener('pointerleave', leave)
  }
  pointerBindings.clear()
}

function attachPointerHandlers(canvas: HTMLCanvasElement, pointerState: PointerState): void {
  const updateFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const lastX = pointerState.x
    const lastY = pointerState.y
    pointerState.x = nx
    pointerState.y = ny
    pointerState.vx = clamp((nx - lastX) * 20.0, -1, 1)
    pointerState.vy = clamp((ny - lastY) * 20.0, -1, 1)
  }

  const handleMove = (event: PointerEvent) => {
    updateFromEvent(event)
  }
  const handleDown = (event: PointerEvent) => {
    pointerState.down = true
    canvas.setPointerCapture(event.pointerId)
    updateFromEvent(event)
  }
  const handleUp = (event: PointerEvent) => {
    pointerState.down = false
    pointerState.vx = 0
    pointerState.vy = 0
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    updateFromEvent(event)
  }
  const handleLeave = () => {
    pointerState.down = false
    pointerState.vx = 0
    pointerState.vy = 0
  }

  pointermoveEvent(handleMove, canvas)
  pointerdownEvent(handleDown, canvas)
  pointerupEvent(handleUp, canvas)

  const cancelHandler = (event: PointerEvent) => { handleUp(event) }
  const leaveHandler = handleLeave
  canvas.addEventListener('pointercancel', cancelHandler)
  canvas.addEventListener('pointerleave', leaveHandler)
  pointerBindings.set(canvas, { cancel: cancelHandler, leave: leaveHandler })
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
  if (!fluidPointer.down) return
  const px = fluidPointer.x * forceCanvas.width
  const py = (1.0 - fluidPointer.y) * forceCanvas.height
  const radius = Math.max(forceCanvas.width, forceCanvas.height) * 0.05
  const vx = clamp(fluidPointer.vx * 0.5 + 0.5, 0, 1)
  const vy = clamp(fluidPointer.vy * 0.5 + 0.5, 0, 1)
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
  if (!reactionPointer.down) return
  const px = reactionPointer.x * reactionSeedCanvas.width
  const py = (1.0 - reactionPointer.y) * reactionSeedCanvas.height
  const radius = Math.max(reactionSeedCanvas.width, reactionSeedCanvas.height) * 0.04
  const gradient = reactionSeedCtx.createRadialGradient(px, py, 0, px, py, radius)
  gradient.addColorStop(0, 'rgba(255, 140, 40, 0.65)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  reactionSeedCtx.fillStyle = gradient
  reactionSeedCtx.beginPath()
  reactionSeedCtx.arc(px, py, radius, 0, Math.PI * 2)
  reactionSeedCtx.fill()
}

function startLoop(fluidEngine: BABYLON.WebGPUEngine, reactionEngine: BABYLON.WebGPUEngine): void {
  const render = () => {
    if (!fluidEngine || !reactionEngine) {
      animationHandle = undefined
      return
    }
    const fluidDisposedAccessor = (fluidEngine as any).isDisposed
    const fluidDisposed =
      typeof fluidDisposedAccessor === 'function' ? fluidDisposedAccessor.call(fluidEngine) : Boolean(fluidDisposedAccessor)
    const reactionDisposedAccessor = (reactionEngine as any).isDisposed
    const reactionDisposed =
      typeof reactionDisposedAccessor === 'function' ? reactionDisposedAccessor.call(reactionEngine) : Boolean(reactionDisposedAccessor)
    if (fluidDisposed || reactionDisposed) {
      animationHandle = undefined
      return
    }
    updateForceField()
    updateReactionSeed()
    if (!state.paused) {
      fluidEngine.beginFrame()
      try {
        fluidCanvasPaint?.renderAll(fluidEngine as unknown as BABYLON.Engine)
      } finally {
        fluidEngine.endFrame()
      }
      
      reactionEngine.beginFrame()
      try {
        reactionCanvasPaint?.renderAll(reactionEngine as unknown as BABYLON.Engine)
      } finally {
        reactionEngine.endFrame()
      }
    }
    animationHandle = requestAnimationFrame(render)
  }
  animationHandle = requestAnimationFrame(render)
}

function setupEngine(fluidEngine: BABYLON.WebGPUEngine, reactionEngine: BABYLON.WebGPUEngine): void {
  disposeGraph()
  clearListeners()
  singleKeydownEvent('p', () => {
    state.paused = !state.paused
  })
  const { width, height } = state
  
  const forceCanvasEl = document.getElementById('forceCanvas') as HTMLCanvasElement | null
  if (!forceCanvasEl) {
    console.warn('forceCanvas not found')
    return
  }
  forceCanvas = forceCanvasEl
  forceCanvas.width = width
  forceCanvas.height = height
  forceCtx = forceCanvas.getContext('2d')
  if (forceCtx) {
    forceCtx.fillStyle = 'rgba(0, 0, 0, 1)'
    forceCtx.fillRect(0, 0, width, height)
  }

  const reactionSeedCanvasEl = document.getElementById('reactionSeedCanvas') as HTMLCanvasElement | null
  if (!reactionSeedCanvasEl) {
    console.warn('reactionSeedCanvas not found')
    return
  }
  reactionSeedCanvas = reactionSeedCanvasEl
  reactionSeedCanvas.width = width
  reactionSeedCanvas.height = height
  reactionSeedCtx = reactionSeedCanvas.getContext('2d')
  if (reactionSeedCtx) {
    reactionSeedCtx.fillStyle = 'rgba(0, 0, 0, 1)'
    reactionSeedCtx.fillRect(0, 0, width, height)
  }

  const fluidInitialCanvas = createFluidInitialCanvas(width, height)
  const reactionInitialCanvas = createReactionInitialCanvas(width, height)

  const fluidCanvas = document.getElementById('fluidCanvas') as HTMLCanvasElement | null
  const reactionCanvas = document.getElementById('reactionCanvas') as HTMLCanvasElement | null

  fluidInitial = new PassthruEffect(fluidEngine, { src: fluidInitialCanvas }, width, height, 'linear', 'half_float')
  fluidFeedback = new FeedbackNode(fluidEngine, fluidInitial, width, height, 'linear', 'half_float')
  fluidSim = new FluidSimEffect(fluidEngine, { state: fluidFeedback, forces: forceCanvas! }, width, height, 'linear', 'half_float')
  fluidSim.setUniforms({
    timeStep: 0.016,
    velocityDissipation: 0.985,
    densityDissipation: 0.995,
    swirlStrength: 2.5,
    turbulence: 0.18,
    forceRadius: 0.12,
    forceStrength: 18,
    attraction: 0.35,
    forcePosition: () => [fluidPointer.x, 1.0 - fluidPointer.y],
  })
  fluidFeedback.setFeedbackSrc(fluidSim)
  fluidVisual = new FluidVisualizeEffect(fluidEngine, { state: fluidSim }, width, height, 'linear')

  reactionInitial = new PassthruEffect(reactionEngine, { src: reactionInitialCanvas }, width, height, 'linear', 'half_float')
  reactionFeedback = new FeedbackNode(reactionEngine, reactionInitial, width, height, 'linear', 'half_float')
  reactionSim = new ReactionDiffusionEffect(reactionEngine, { state: reactionFeedback, seed: reactionSeedCanvas! }, width, height, 'linear', 'half_float')
  reactionSim.setUniforms({
    feed: 0.055,
    kill: 0.062,
    diffRateA: 1.0,
    diffRateB: 0.5,
    deltaT: 1.0,
    brushRadius: 0.035,
    brushStrength: 0.85,
    noiseAmount: 0.015,
    brushPosition: () => [reactionPointer.x, 1.0 - reactionPointer.y],
  })
  reactionFeedback.setFeedbackSrc(reactionSim)
  reactionVisual = new ReactionVisualizeEffect(reactionEngine, { state: reactionSim }, width, height, 'linear')

  if (fluidCanvas) {
    fluidCanvas.style.pointerEvents = 'none'
    fluidCanvasPaint = new CanvasPaint(fluidEngine, { src: fluidVisual }, width, height, 'linear', 'half_float')
  }

  if (reactionCanvas) {
    reactionCanvas.style.pointerEvents = 'none'
    reactionCanvasPaint = new CanvasPaint(reactionEngine, { src: reactionVisual }, width, height, 'linear', 'half_float')
  }
  
  if (forceCanvas) {
    attachPointerHandlers(forceCanvas, fluidPointer)
  }
  
  if (reactionSeedCanvas) {
    attachPointerHandlers(reactionSeedCanvas, reactionPointer)
  }

  if (fluidCanvasPaint) {
    shaderGraph = fluidCanvasPaint
  }
  startLoop(fluidEngine, reactionEngine)
}

onMounted(() => {
  const handleEngineChange = (engines: { fluid?: BABYLON.WebGPUEngine; reaction?: BABYLON.WebGPUEngine } | undefined) => {
    if (engines?.fluid && engines?.reaction) {
      setupEngine(engines.fluid, engines.reaction)
    } else {
      disposeGraph()
      clearListeners()
    }
  }

  handleEngineChange(engineRef.value)

  engineWatcher = watch(
    engineRef,
    (engineValue, previousValue) => {
      if (engineValue === previousValue) {
        return
      }
      handleEngineChange(engineValue)
    },
    { immediate: false },
  )
})

onUnmounted(() => {
  engineWatcher?.()
  engineWatcher = undefined
  disposeGraph()
  clearListeners()
})
</script>
