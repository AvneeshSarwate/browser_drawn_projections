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
type FluidDebugMode = 'dye' | 'velocity' | 'divergence' | 'pressure' | 'splat'
const fluidDebugModes: FluidDebugMode[] = ['dye', 'velocity', 'divergence', 'pressure', 'splat']
let fluidDebugMode: FluidDebugMode = 'dye'
let reactionSim: ReactionDiffusionEffect | undefined
let reactionVisual: ReactionVisualizeEffect | undefined
let reactionFeedback: FeedbackNode | undefined
let reactionInitial: PassthruEffect | undefined
let fluidCanvasPaint: CanvasPaint | undefined
let reactionCanvasPaint: CanvasPaint | undefined
let velocityDebugEffect: VelocityFieldDebugEffect | undefined
let divergenceDebugEffect: ScalarFieldDebugEffect | undefined
let pressureDebugEffect: ScalarFieldDebugEffect | undefined
let splatDebugEffect: VelocityFieldDebugEffect | undefined

let forceCanvas: HTMLCanvasElement | undefined
let reactionSeedCanvas: HTMLCanvasElement | undefined
let reactionSeedCtx: CanvasRenderingContext2D | null = null
let currentSplatRadius = 0.25
let currentForceStrength = 6000
let currentDyeInjectionStrength = 0.65
const pendingSplats: Array<{
  point: [number, number]
  velocity: [number, number]
  dye: [number, number, number]
  radius: number
}> = []

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
  splatDebugEffect?.dispose()
  splatDebugEffect = undefined
  fluidDebugMode = 'dye'
  pendingSplats.length = 0
  reactionVisual = undefined
  reactionSim = undefined
  reactionFeedback?.dispose()
  reactionFeedback = undefined
  reactionInitial?.dispose()
  reactionInitial = undefined
  forceCanvas = undefined
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
    case 'splat':
      if (splatDebugEffect) {
        splatDebugEffect.setSrcs({ src: fluidSim.splat })
        fluidCanvasPaint.setSrcs({ src: splatDebugEffect })
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
            currentForceStrength = newValue
            fluidSim.setUniforms({ forceStrength: newValue })
            break
          case 'splatRadius':
            // already handled above
            break
          case 'dyeInjectionStrength':
            currentDyeInjectionStrength = newValue
            fluidSim.setUniforms({ dyeInjectionStrength: newValue })
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

function queuePointerSplat(): void {
  if (!forceCanvas) {
    return
  }
  if (!fluidPointer.down || !fluidPointer.moved) {
    return
  }

  const radius = computeNormalizedSplatRadius(forceCanvas)
  const velX = fluidPointer.vx
  const velY = fluidPointer.vy
  const speed = Math.sqrt(velX * velX + velY * velY)
  if (speed < 1e-6) {
    fluidPointer.moved = false
    fluidPointer.vx = 0
    fluidPointer.vy = 0
    return
  }
  const dirX = velX / speed
  const dirY = -velY / speed
  const velocity: [number, number] = [dirX * speed, dirY * speed]
  const dyeScale = currentDyeInjectionStrength * speed
  const dye: [number, number, number] = [
    (fluidPointer.color.r / 255) * dyeScale,
    (fluidPointer.color.g / 255) * dyeScale,
    (fluidPointer.color.b / 255) * dyeScale,
  ]

  pendingSplats.push({
    point: [fluidPointer.x, 1 - fluidPointer.y],
    velocity,
    dye,
    radius,
  })

  fluidPointer.moved = false
  fluidPointer.vx = 0
  fluidPointer.vy = 0
}

function flushPendingSplats(): void {
  if (!fluidSim || pendingSplats.length === 0) {
    return
  }
  for (const splat of pendingSplats) {
    fluidSim.applySplat({
      point: splat.point,
      velocityDelta: splat.velocity,
      dyeColor: splat.dye,
      radius: splat.radius,
    })
  }
  pendingSplats.length = 0
  if (fluidDebugMode === 'splat') {
    updateFluidDisplaySource()
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
    queuePointerSplat()
    updateReactionSeed()
    const shouldRenderFluid = !state.paused || pendingSplats.length > 0
    if (shouldRenderFluid) {
      const now = performance.now()
      const dt = lastFrameTime !== undefined ? Math.min((now - lastFrameTime) / 1000, 1 / 30) : 1 / 60
      lastFrameTime = now
      if (!state.paused) {
        fluidSim?.updateForFrame(dt)
      }
      fluidEngine.beginFrame()
      try {
        flushPendingSplats()
        fluidSim?.renderAll(fluidEngine as unknown as BABYLON.Engine)
        fluidCanvasPaint?.renderAll(fluidEngine as unknown as BABYLON.Engine)
      } finally {
        fluidEngine.endFrame()
      }
    }
    if (!state.paused) {
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
  singleKeydownEvent('5', () => setFluidDebugMode('splat'))
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
  currentForceStrength = getFluidParam('forceStrength') || 6000
  currentDyeInjectionStrength = state.fluidParams?.find(p => p.name === 'dyeInjectionStrength')?.value.value ?? 0.65
  fluidSim = new FluidSimulationEffect(
    fluidEngine,
    undefined,
    {
      simWidth: width,
      simHeight: height,
      pressureIterations: getFluidParam('pressureIterations') || 20,
      pressure: getFluidParam('pressure') || 0.8,
      velocityDissipation: getFluidParam('velocityDissipation') || 0.2,
      dyeDissipation: getFluidParam('densityDissipation') || 1.0,
      forceStrength: currentForceStrength,
      timeStep: 1 / 60,
      enableVorticity: true,
      vorticityStrength: getFluidParam('curl') || 30,
      dyeInjectionStrength: currentDyeInjectionStrength,
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
  splatDebugEffect = new VelocityFieldDebugEffect(
    fluidEngine,
    { src: fluidSim.splat },
    width,
    height,
    'linear',
    'half_float'
  )
  splatDebugEffect.setUniforms({
    vectorScale: 1.0,
    magnitudeScale: 10.0,
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
