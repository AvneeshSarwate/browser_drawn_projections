<script setup lang="ts">
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue'
import type * as BABYLON from 'babylonjs'
import { appStateName, engineRef, type FluidReactionAppState } from './appState'
import { CanvasPaint, FeedbackNode, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon'
import { FluidSimulationEffect } from '@/rendering/fluidSimulation'
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
  color: { r: number; g: number; b: number }
}

const fluidPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  down: false,
  color: { r: 120, g: 60, b: 220 },
}

const reactionPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  down: false,
  color: { r: 255, g: 140, b: 40 },
}

let animationHandle: number | undefined
let shaderGraph: ShaderEffect | undefined
let fluidSim: FluidSimulationEffect | undefined
let reactionSim: ReactionDiffusionEffect | undefined
let reactionVisual: ReactionVisualizeEffect | undefined
let reactionFeedback: FeedbackNode | undefined
let reactionInitial: PassthruEffect | undefined
let fluidCanvasPaint: CanvasPaint | undefined
let reactionCanvasPaint: CanvasPaint | undefined

let forceCanvas: HTMLCanvasElement | undefined
let forceCtx: CanvasRenderingContext2D | null = null
let dyeForceCanvas: HTMLCanvasElement | undefined
let dyeForceCtx: CanvasRenderingContext2D | null = null
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
  fluidSim?.dispose()
  fluidSim = undefined
  reactionVisual = undefined
  reactionSim = undefined
  reactionFeedback?.dispose()
  reactionFeedback = undefined
  reactionInitial?.dispose()
  reactionInitial = undefined
  forceCtx = null
  forceCanvas = undefined
  dyeForceCtx = null
  dyeForceCanvas = undefined
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
    pointerState.color = generatePointerColor()
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

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  switch (i % 6) {
    case 0: return { r: v, g: t, b: p }
    case 1: return { r: q, g: v, b: p }
    case 2: return { r: p, g: v, b: t }
    case 3: return { r: p, g: q, b: v }
    case 4: return { r: t, g: p, b: v }
    default: return { r: v, g: p, b: q }
  }
}

function generatePointerColor(): { r: number; g: number; b: number } {
  const hsv = hsvToRgb(Math.random(), 1.0, 1.0)
  return {
    r: Math.floor(hsv.r * 255 * 0.9),
    g: Math.floor(hsv.g * 255 * 0.85),
    b: Math.floor(hsv.b * 255 * 0.8),
  }
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
  forceCtx.save()
  forceCtx.globalCompositeOperation = 'destination-out'
  forceCtx.fillStyle = 'rgba(0, 0, 0, 0.08)'
  forceCtx.fillRect(0, 0, forceCanvas.width, forceCanvas.height)
  forceCtx.restore()
  const hasDyeForces = Boolean(dyeForceCtx && dyeForceCanvas)
  if (hasDyeForces) {
    dyeForceCtx!.save()
    dyeForceCtx!.globalCompositeOperation = 'destination-out'
    dyeForceCtx!.fillStyle = 'rgba(0, 0, 0, 0.12)'
    dyeForceCtx!.fillRect(0, 0, dyeForceCanvas!.width, dyeForceCanvas!.height)
    dyeForceCtx!.restore()
  }

  if (!fluidPointer.down) return

  const px = fluidPointer.x * forceCanvas.width
  const py = fluidPointer.y * forceCanvas.height
  const radius = Math.max(forceCanvas.width, forceCanvas.height) * 0.05
  const vx = clamp(fluidPointer.vx * 0.5 + 0.5, 0, 1)
  const vy = clamp(fluidPointer.vy * 0.5 + 0.5, 0, 1)
  forceCtx.fillStyle = `rgba(${Math.floor(vx * 255)}, ${Math.floor(vy * 255)}, 210, 0.85)`
  forceCtx.beginPath()
  forceCtx.arc(px, py, radius, 0, Math.PI * 2)
  forceCtx.fill()

  if (hasDyeForces) {
    const dyeRadius = Math.max(dyeForceCanvas!.width, dyeForceCanvas!.height) * 0.06
    const gradient = dyeForceCtx!.createRadialGradient(px, py, 0, px, py, dyeRadius)
    gradient.addColorStop(0, `rgba(${fluidPointer.color.r}, ${fluidPointer.color.g}, ${fluidPointer.color.b}, 0.9)`)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    dyeForceCtx!.fillStyle = gradient
    dyeForceCtx!.beginPath()
    dyeForceCtx!.arc(px, py, dyeRadius, 0, Math.PI * 2)
    dyeForceCtx!.fill()
  }
}

function updateReactionSeed(): void {
  if (!reactionSeedCtx || !reactionSeedCanvas) {
    return
  }
  reactionSeedCtx.fillStyle = 'rgba(0, 0, 0, 0.015)'
  reactionSeedCtx.fillRect(0, 0, reactionSeedCanvas.width, reactionSeedCanvas.height)
  if (!reactionPointer.down) return
  const px = reactionPointer.x * reactionSeedCanvas.width
  const py = reactionPointer.y * reactionSeedCanvas.height
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
        fluidSim?.renderAll(fluidEngine as unknown as BABYLON.Engine)
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
    forceCtx.clearRect(0, 0, width, height)
  }

  dyeForceCanvas = document.createElement('canvas')
  dyeForceCanvas.width = width
  dyeForceCanvas.height = height
  dyeForceCtx = dyeForceCanvas.getContext('2d')
  if (dyeForceCtx) {
    dyeForceCtx.fillStyle = 'rgba(0, 0, 0, 1)'
    dyeForceCtx.fillRect(0, 0, width, height)
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

  const reactionInitialCanvas = createReactionInitialCanvas(width, height)

  const fluidCanvas = document.getElementById('fluidCanvas') as HTMLCanvasElement | null
  const reactionCanvas = document.getElementById('reactionCanvas') as HTMLCanvasElement | null

  const getFluidParam = (name: string) => state.fluidParams?.find(p => p.name === name)?.value.value ?? 0
  fluidSim = new FluidSimulationEffect(
    fluidEngine,
    { forces: forceCanvas!, dyeForces: dyeForceCanvas },
    {
      simWidth: width,
      simHeight: height,
      pressureIterations: 20,
      velocityDissipation: getFluidParam('velocityDissipation') || 0.98,
      dyeDissipation: getFluidParam('densityDissipation') || 0.995,
      forceStrength: getFluidParam('forceStrength') || 6000,
      timeStep: 0.016,
      enableVorticity: true,
      vorticityStrength: getFluidParam('vorticityStrength') || 30,
      dyeInjectionStrength: 0.65,
    }
  )

  reactionInitial = new PassthruEffect(reactionEngine, { src: reactionInitialCanvas }, width, height, 'linear', 'half_float')
  reactionFeedback = new FeedbackNode(reactionEngine, reactionInitial, width, height, 'linear', 'half_float')
  reactionSim = new ReactionDiffusionEffect(reactionEngine, { state: reactionFeedback, seed: reactionSeedCanvas! }, width, height, 'linear', 'half_float')
  const getReactionParam = (name: string) => state.reactionParams?.find(p => p.name === name)?.value.value ?? 0
  reactionSim.setUniforms({
    feed: () => getReactionParam('feed'),
    kill: () => getReactionParam('kill'),
    diffRateA: () => getReactionParam('diffRateA'),
    diffRateB: () => getReactionParam('diffRateB'),
    deltaT: () => getReactionParam('deltaT'),
    brushRadius: 0.035,
    brushStrength: () => reactionPointer.down ? 0.85 : 0,
    noiseAmount: 0.015,
    brushPosition: () => [reactionPointer.x, 1.0 - reactionPointer.y],
  })
  reactionFeedback.setFeedbackSrc(reactionSim)
  reactionVisual = new ReactionVisualizeEffect(reactionEngine, { state: reactionSim }, width, height, 'linear')

  if (fluidCanvas) {
    fluidCanvas.style.pointerEvents = 'none'
    fluidCanvasPaint = new CanvasPaint(fluidEngine, { src: fluidSim.dye }, width, height, 'linear', 'half_float')
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
