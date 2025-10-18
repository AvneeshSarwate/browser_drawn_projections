<script setup lang="ts">
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue'
import type * as BABYLON from 'babylonjs'
import { appStateName, engineRef, type FluidReactionAppState } from './appState'
import { CanvasPaint, FeedbackNode, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon'
import {
  FluidSimulationEffect,
  ScalarFieldDebugEffect,
  VelocityFieldDebugEffect,
} from '@/rendering/fluidSimulation'
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
  moved: boolean
}

const fluidPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  down: false,
  color: { r: 38, g: 38, b: 38 },
  moved: false,
}

const reactionPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  down: false,
  color: { r: 255, g: 140, b: 40 },
  moved: false,
}

let animationHandle: number | undefined
let shaderGraph: ShaderEffect | undefined
let fluidSim: FluidSimulationEffect | undefined
type FluidDebugMode = 'dye' | 'velocity' | 'divergence' | 'pressure'
const fluidDebugModes: FluidDebugMode[] = ['dye', 'velocity', 'divergence', 'pressure']
let fluidDebugMode: FluidDebugMode = 'pressure'
let reactionSim: ReactionDiffusionEffect | undefined
let reactionVisual: ReactionVisualizeEffect | undefined
let reactionFeedback: FeedbackNode | undefined
let reactionInitial: PassthruEffect | undefined
let fluidCanvasPaint: CanvasPaint | undefined
let reactionCanvasPaint: CanvasPaint | undefined
let velocityDebugEffect: VelocityFieldDebugEffect | undefined
let divergenceDebugEffect: ScalarFieldDebugEffect | undefined
let pressureDebugEffect: ScalarFieldDebugEffect | undefined

let forceCanvas: HTMLCanvasElement | undefined
let forceCtx: CanvasRenderingContext2D | null = null
let dyeForceCanvas: HTMLCanvasElement | undefined
let dyeForceCtx: CanvasRenderingContext2D | null = null
let reactionSeedCanvas: HTMLCanvasElement | undefined
let reactionSeedCtx: CanvasRenderingContext2D | null = null
let currentSplatRadius = 0.25

const pointerBindings = new Map<HTMLCanvasElement, { cancel: (e: PointerEvent) => void; leave: (e: PointerEvent) => void }>()
let engineWatcher: WatchStopHandle | undefined
let fluidParamWatchers: WatchStopHandle[] = []

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
  velocityDebugEffect?.dispose()
  velocityDebugEffect = undefined
  divergenceDebugEffect?.dispose()
  divergenceDebugEffect = undefined
  pressureDebugEffect?.dispose()
  pressureDebugEffect = undefined
  fluidDebugMode = 'dye'
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
  fluidParamWatchers.forEach(stop => stop())
  fluidParamWatchers = []
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
    const aspect = canvas.width / canvas.height
    let deltaX = nx - lastX
    let deltaY = ny - lastY
    if (aspect < 1) {
      deltaX *= aspect
    }
    if (aspect > 1) {
      deltaY /= aspect
    }
    const clampedDx = clamp(deltaX, -1, 1)
    const clampedDy = clamp(deltaY, -1, 1)
    pointerState.vx = clampedDx
    pointerState.vy = clampedDy
    pointerState.moved = pointerState.moved || Math.abs(clampedDx) > 1e-5 || Math.abs(clampedDy) > 1e-5
  }

  const handleMove = (event: PointerEvent) => {
    updateFromEvent(event)
  }
  const handleDown = (event: PointerEvent) => {
    pointerState.down = true
    canvas.setPointerCapture(event.pointerId)
    updateFromEvent(event)
    pointerState.color = generatePointerColor()
    pointerState.moved = true
  }
  const handleUp = (event: PointerEvent) => {
    pointerState.down = false
    pointerState.vx = 0
    pointerState.vy = 0
    pointerState.moved = false
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
  const scale = 0.15
  return {
    r: Math.floor(hsv.r * 255 * scale),
    g: Math.floor(hsv.g * 255 * scale),
    b: Math.floor(hsv.b * 255 * scale),
  }
}

function updateFluidDisplaySource(): void {
  if (!fluidCanvasPaint || !fluidSim) {
    return
  }
  switch (fluidDebugMode) {
    case 'dye':
      fluidCanvasPaint.setSrcs({ src: fluidSim.dye })
      break
    case 'velocity':
      if (velocityDebugEffect) {
        velocityDebugEffect.setSrcs({ src: fluidSim.velocity })
        fluidCanvasPaint.setSrcs({ src: velocityDebugEffect })
      } else {
        fluidCanvasPaint.setSrcs({ src: fluidSim.dye })
      }
      break
    case 'divergence':
      if (divergenceDebugEffect) {
        divergenceDebugEffect.setSrcs({ src: fluidSim.divergence })
        fluidCanvasPaint.setSrcs({ src: divergenceDebugEffect })
      } else {
        fluidCanvasPaint.setSrcs({ src: fluidSim.dye })
      }
      break
    case 'pressure':
      if (pressureDebugEffect) {
        pressureDebugEffect.setSrcs({ src: fluidSim.pressure })
        fluidCanvasPaint.setSrcs({ src: pressureDebugEffect })
      } else {
        fluidCanvasPaint.setSrcs({ src: fluidSim.dye })
      }
      break
    default:
      fluidCanvasPaint.setSrcs({ src: fluidSim.dye })
      break
  }
}

function setFluidDebugMode(mode: FluidDebugMode): void {
  if (fluidDebugMode === mode) {
    return
  }
  fluidDebugMode = mode
  updateFluidDisplaySource()
  console.info(`[fluid] display mode: ${mode}`)
}

function cycleFluidDebugMode(direction: number): void {
  const currentIndex = fluidDebugModes.indexOf(fluidDebugMode)
  const nextIndex = (currentIndex + direction + fluidDebugModes.length) % fluidDebugModes.length
  setFluidDebugMode(fluidDebugModes[nextIndex])
}

function computeNormalizedSplatRadius(canvas: HTMLCanvasElement): number {
  const base = Math.max(0.001, currentSplatRadius / 100)
  const aspect = canvas.width / canvas.height
  return aspect > 1 ? base * aspect : base
}

function registerFluidParamWatchers(): void {
  fluidParamWatchers.forEach(stop => stop())
  fluidParamWatchers = []
  const params = state.fluidParams
  if (!params) {
    return
  }
  for (const param of params) {
    const stop = watch(
      () => param.value.value,
      (newValue) => {
        if (param.name === 'splatRadius') {
          currentSplatRadius = newValue
        }
        if (!fluidSim) {
          return
        }
        switch (param.name) {
          case 'densityDissipation':
            fluidSim.setUniforms({ dyeDissipation: newValue })
            break
          case 'velocityDissipation':
            fluidSim.setUniforms({ velocityDissipation: newValue })
            break
          case 'pressure':
            fluidSim.setUniforms({ pressure: newValue })
            break
          case 'pressureIterations':
            fluidSim.setUniforms({ pressureIterations: Math.max(1, Math.round(newValue)) })
            break
          case 'curl':
            fluidSim.setUniforms({ vorticityStrength: newValue })
            break
          case 'forceStrength':
            fluidSim.setUniforms({ forceStrength: newValue })
            break
          case 'splatRadius':
            // already handled above
            break
          default:
            break
        }
      },
      { immediate: true }
    )
    fluidParamWatchers.push(stop)
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

  if (!fluidPointer.down || !fluidPointer.moved) return

  const velX = fluidPointer.vx
  const velY = fluidPointer.vy
  const speed = Math.sqrt(velX * velX + velY * velY)
  if (speed < 1e-6) {
    fluidPointer.moved = false
    fluidPointer.vx = 0
    fluidPointer.vy = 0
    return
  }

  const width = forceCanvas.width
  const height = forceCanvas.height
  const pointerU = fluidPointer.x
  const pointerV = fluidPointer.y
  const aspect = width / height
  const baseRadius = Math.max(0.0002, currentSplatRadius / 100)
  const radius = aspect > 1 ? baseRadius * aspect : baseRadius
  const influenceRadius = baseRadius * 3

  const minU = Math.max(0, pointerU - influenceRadius)
  const maxU = Math.min(1, pointerU + influenceRadius)
  const minV = Math.max(0, pointerV - influenceRadius)
  const maxV = Math.min(1, pointerV + influenceRadius)

  const startX = Math.max(0, Math.floor(minU * width))
  const startY = Math.max(0, Math.floor(minV * height))
  const endX = Math.min(width, Math.ceil(maxU * width))
  const endY = Math.min(height, Math.ceil(maxV * height))
  const regionWidth = Math.max(1, endX - startX)
  const regionHeight = Math.max(1, endY - startY)

  const forceImage = forceCtx.getImageData(startX, startY, regionWidth, regionHeight)
  const forceData = forceImage.data

  let dyeImage: ImageData | undefined
  let dyeData: Uint8ClampedArray | undefined
  if (hasDyeForces) {
    dyeImage = dyeForceCtx!.getImageData(startX, startY, regionWidth, regionHeight)
    dyeData = dyeImage.data
  }

  const dirX = velX / speed
  const dirY = -velY / speed
  const dir01X = clamp(dirX * 0.5 + 0.5, 0, 1)
  const dir01Y = clamp(dirY * 0.5 + 0.5, 0, 1)

  for (let y = 0; y < regionHeight; y++) {
    const pixelY = startY + y
    const v = (pixelY + 0.5) / height
    const dy = v - pointerV
    for (let x = 0; x < regionWidth; x++) {
      const pixelX = startX + x
      const u = (pixelX + 0.5) / width
      const dx = u - pointerU
      const scaledDx = dx * aspect
      const distSq = scaledDx * scaledDx + dy * dy
      const weight = Math.exp(-distSq / Math.max(1e-6, radius))
      const amplitude = weight * speed
      if (amplitude < 1e-5 && (!dyeData || weight < 1e-5)) {
        continue
      }
      const alpha = Math.min(1, amplitude)
      const idx = (y * regionWidth + x) * 4
      if (amplitude >= 1e-5) {
        forceData[idx + 0] = Math.round(clamp(dir01X * alpha, 0, 1) * 255)
        forceData[idx + 1] = Math.round(clamp(dir01Y * alpha, 0, 1) * 255)
        forceData[idx + 2] = 0
        forceData[idx + 3] = Math.round(alpha * 255)
      }

      if (dyeData) {
        const dyeScale = weight
        if (dyeScale > 1e-5) {
          dyeData[idx + 0] = Math.min(255, dyeData[idx + 0] + Math.round(fluidPointer.color.r * dyeScale))
          dyeData[idx + 1] = Math.min(255, dyeData[idx + 1] + Math.round(fluidPointer.color.g * dyeScale))
          dyeData[idx + 2] = Math.min(255, dyeData[idx + 2] + Math.round(fluidPointer.color.b * dyeScale))
          const existingAlpha = dyeData[idx + 3]
          dyeData[idx + 3] = Math.min(255, Math.max(existingAlpha, Math.round(dyeScale * 255)))
        }
      }
    }
  }

  forceCtx.putImageData(forceImage, startX, startY)
  if (hasDyeForces && dyeImage) {
    dyeForceCtx!.putImageData(dyeImage, startX, startY)
  }

  fluidPointer.moved = false
  fluidPointer.vx = 0
  fluidPointer.vy = 0
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
  let lastFrameTime: number | undefined
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
      const now = performance.now()
      const dt = lastFrameTime !== undefined ? Math.min((now - lastFrameTime) / 1000, 1 / 30) : 1 / 60
      lastFrameTime = now
      fluidSim?.updateForFrame(dt)
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
  lastFrameTime = performance.now()
  animationHandle = requestAnimationFrame(render)
}

function setupEngine(fluidEngine: BABYLON.WebGPUEngine, reactionEngine: BABYLON.WebGPUEngine): void {
  disposeGraph()
  clearListeners()
  singleKeydownEvent('p', () => {
    state.paused = !state.paused
  })
  singleKeydownEvent('1', () => setFluidDebugMode('dye'))
  singleKeydownEvent('2', () => setFluidDebugMode('velocity'))
  singleKeydownEvent('3', () => setFluidDebugMode('divergence'))
  singleKeydownEvent('4', () => setFluidDebugMode('pressure'))
  singleKeydownEvent('[', () => cycleFluidDebugMode(-1))
  singleKeydownEvent(']', () => cycleFluidDebugMode(1))
  const { width, height } = state
  fluidPointer.color = generatePointerColor()
  
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
  currentSplatRadius = getFluidParam('splatRadius') || 0.25
  fluidSim = new FluidSimulationEffect(
    fluidEngine,
    { forces: forceCanvas!, dyeForces: dyeForceCanvas },
    {
      simWidth: width,
      simHeight: height,
      pressureIterations: getFluidParam('pressureIterations') || 20,
      pressure: getFluidParam('pressure') || 0.8,
      velocityDissipation: getFluidParam('velocityDissipation') || 0.2,
      dyeDissipation: getFluidParam('densityDissipation') || 1.0,
      forceStrength: getFluidParam('forceStrength') || 6000,
      timeStep: 1 / 60,
      enableVorticity: true,
      vorticityStrength: getFluidParam('curl') || 30,
      dyeInjectionStrength: 0.65,
    }
  )
  fluidDebugMode = 'dye'
  velocityDebugEffect = new VelocityFieldDebugEffect(
    fluidEngine,
    { src: fluidSim.velocity },
    width,
    height,
    'linear',
    'half_float'
  )
  velocityDebugEffect.setUniforms({
    vectorScale: 0.05,
    magnitudeScale: 0.01,
  })
  divergenceDebugEffect = new ScalarFieldDebugEffect(
    fluidEngine,
    { src: fluidSim.divergence },
    width,
    height,
    'linear',
    'half_float'
  )
  divergenceDebugEffect.setUniforms({
    scale: 4.0,
    offset: 0.0,
  })
  pressureDebugEffect = new ScalarFieldDebugEffect(
    fluidEngine,
    { src: fluidSim.pressure },
    width,
    height,
    'linear',
    'half_float'
  )
  pressureDebugEffect.setUniforms({
    scale: 0.5,
    offset: 0.0,
  })
  registerFluidParamWatchers()

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
    updateFluidDisplaySource()
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
