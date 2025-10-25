<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, watch, type WatchStopHandle } from 'vue'
import type * as BABYLON from 'babylonjs'
import { appStateName, engineRef, type FluidReactionAppState, type FluidDebugMode } from './appState'
import { CanvasPaint, type ShaderEffect } from '@/rendering/shaderFXBabylon'
import {
  FluidSimulationEffect,
  ScalarFieldDebugEffect,
  VelocityFieldDebugEffect,
} from '@/rendering/fluidSimulationHack'
import { clearListeners, pointerdownEvent, pointermoveEvent, pointerupEvent, singleKeydownEvent } from '@/io/keyboardAndMouse'
import { TimeContext, launch } from '@/channels/base_time_context'
import { type CancelablePromisePoxy } from '@/channels/channels'
import { normalizedMetadata, calculateLineLayout, sampleEntryIndexInLine } from './alphabet_groups'
import { AbletonClip, quickNote, type AbletonNote } from '@/io/abletonClips'
import { getPiano, getPianoChain, TONE_AUDIO_START } from '@/music/synths'
import { m2f } from '@/music/mpeSynth'
import * as Tone from 'tone'

console.log(normalizedMetadata.map(g => [g.metadata!.name, g.metadata!.baseline]).sort())

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

let animationHandle: number | undefined
let shaderGraph: ShaderEffect | undefined
let fluidSim: FluidSimulationEffect | undefined
const fluidDebugModes: FluidDebugMode[] = ['dye', 'velocity', 'divergence', 'pressure', 'splat', 'splatRaw']
let fluidCanvasPaint: CanvasPaint | undefined
let velocityDebugEffect: VelocityFieldDebugEffect | undefined
let divergenceDebugEffect: ScalarFieldDebugEffect | undefined
let pressureDebugEffect: ScalarFieldDebugEffect | undefined
let splatDebugEffect: VelocityFieldDebugEffect | undefined

let fluidCanvas: HTMLCanvasElement | undefined
let currentSplatRadius = 0.25
let currentForceStrength = 6000
let currentDyeInjectionStrength = 0.65
let programmaticSplatActive = false
let programmaticSplatStartTime: number | undefined
let programmaticColorPhase = 0

const pointerBindings = new Map<HTMLCanvasElement, { cancel: (e: PointerEvent) => void; leave: (e: PointerEvent) => void }>()
let engineWatcher: WatchStopHandle | undefined
let fluidParamWatchers: WatchStopHandle[] = []
let syntheticPointerPrimed = false

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function disposeGraph(): void {
  animationHandle && cancelAnimationFrame(animationHandle)
  animationHandle = undefined
  releasePointerHandlers()
  shaderGraph?.disposeAll()
  shaderGraph = undefined
  fluidCanvasPaint = undefined
  fluidSim?.dispose()
  fluidSim = undefined
  state.shaderDrawFunc = undefined
  velocityDebugEffect?.dispose()
  velocityDebugEffect = undefined
  divergenceDebugEffect?.dispose()
  divergenceDebugEffect = undefined
  pressureDebugEffect?.dispose()
  pressureDebugEffect = undefined
  splatDebugEffect?.dispose()
  splatDebugEffect = undefined
  state.debugMode.value = 'dye'
  fluidCanvas = undefined
  programmaticSplatActive = false
  programmaticSplatStartTime = undefined
  programmaticColorPhase = 0
  state.programmaticSplat.active.value = false
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

function applyNormalizedPointerUpdate(pointerState: PointerState, nx: number, ny: number, canvas: HTMLCanvasElement): void {
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

function applyCanvasSpacePointerUpdate(pointerState: PointerState, canvasX: number, canvasY: number, canvas: HTMLCanvasElement): void {
  const nx = clamp(canvasX / canvas.width, 0, 1)
  const ny = clamp(canvasY / canvas.height, 0, 1)
  if (!syntheticPointerPrimed) {
    pointerState.x = nx
    pointerState.y = ny
    pointerState.vx = 0
    pointerState.vy = 0
    pointerState.moved = true
    syntheticPointerPrimed = true
    return
  }
  applyNormalizedPointerUpdate(pointerState, nx, ny, canvas)
}

function resetSyntheticPointer(pointerState: PointerState): void {
  syntheticPointerPrimed = false
  pointerState.down = false
  pointerState.vx = 0
  pointerState.vy = 0
  pointerState.moved = false
}

function updateSyntheticPointerFrame(params: {
  canvasX: number
  canvasY: number
  down?: boolean
  color?: { r: number; g: number; b: number }
}): void {
  if (!fluidCanvas) {
    return
  }

  const { canvasX, canvasY, down, color } = params
  const nx = clamp(canvasX / fluidCanvas.width, 0, 1)
  const ny = clamp(canvasY / fluidCanvas.height, 0, 1)

  if (color) {
    fluidPointer.color = color
  }

  if (down === false) {
    if (syntheticPointerPrimed) {
      applyNormalizedPointerUpdate(fluidPointer, nx, ny, fluidCanvas)
    } else {
      fluidPointer.x = nx
      fluidPointer.y = ny
    }
    fluidPointer.down = false
    fluidPointer.vx = 0
    fluidPointer.vy = 0
    fluidPointer.moved = false
    syntheticPointerPrimed = false
    return
  }

  fluidPointer.down = true
  applyCanvasSpacePointerUpdate(fluidPointer, canvasX, canvasY, fluidCanvas)
}

function attachPointerHandlers(canvas: HTMLCanvasElement, pointerState: PointerState): void {
  const updateFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const nx = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const ny = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    applyNormalizedPointerUpdate(pointerState, nx, ny, canvas)
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

function beginProgrammaticSplat(): void {
  programmaticSplatStartTime = now()
  programmaticSplatActive = true
  programmaticColorPhase = Math.random() * Math.PI * 2
}

function updateProgrammaticSplat(elapsedSeconds: number): void {
  if (!fluidSim) {
    return
  }
  const colorPhase = programmaticColorPhase + elapsedSeconds * 0.6
  const dyeStrength = currentDyeInjectionStrength
  const dyeColor = [
    clamp(0.55 + 0.45 * Math.sin(colorPhase), 0, 1) * dyeStrength,
    clamp(0.45 + 0.45 * Math.sin(colorPhase + 2.094395102), 0, 1) * dyeStrength,
    clamp(0.6 + 0.4 * Math.sin(colorPhase + 4.188790205), 0, 1) * dyeStrength,
  ] as [number, number, number]

  const radius = Math.max(0.0025, computeNormalizedSplatRadius())
  const halfWidth = 0.28
  const halfHeight = 0.06
  const softness = 0.12
  const rotationSpeed = Math.PI * 0.75
  const pulseAmount = 0.01
  const pulseFrequency = 1.1

  // Drive a directional force from the shader by modulating a signed
  // procedural velocity scale. The WGSL splat computes the tangential
  // push from this scalar so both sides of the rectangle impart equal
  // and opposite momentum as it spins.
  const wavePhase = Math.sin(elapsedSeconds * pulseFrequency + Math.PI * 0.5)
  const velocityMagnitude = pulseAmount * wavePhase
  const velocityDelta = [0, 0] as [number, number]

  fluidSim.applySplat({
    point: [0.5, 0.5],
    velocityDelta,
    dyeColor,
    radius,
    time: elapsedSeconds,
    splatType: 1,
    shapeParams0: [halfWidth, halfHeight, 0, softness],
    shapeParams1: [rotationSpeed, pulseAmount, pulseFrequency, 0],
    proceduralVelocityScale: velocityMagnitude,
  })
}

function updateFluidDisplaySource(): void {
  if (!fluidCanvasPaint || !fluidSim) {
    return
  }
  switch (state.debugMode.value) {
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
    case 'splatRaw':
      if (splatDebugEffect && fluidSim.splatDelta) {
        splatDebugEffect.setSrcs({ src: fluidSim.splatDelta })
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
  if (state.debugMode.value === mode) {
    return
  }
  state.debugMode.value = mode
  updateFluidDisplaySource()
  console.info(`[fluid] display mode: ${mode}`)
}

function cycleFluidDebugMode(direction: number): void {
  const currentIndex = fluidDebugModes.indexOf(state.debugMode.value)
  const nextIndex = (currentIndex + direction + fluidDebugModes.length) % fluidDebugModes.length
  setFluidDebugMode(fluidDebugModes[nextIndex])
}

function computeNormalizedSplatRadius(): number {
  // Pavel divides by 100 to normalize the slider value
  // The aspect ratio correction happens in the shader via offset.x *= aspectRatio
  // So we DON'T multiply by aspect here
  return Math.max(0.001, currentSplatRadius / 100)
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

  const programmatic = state.programmaticSplat
  if (programmatic) {
    const stopActive = watch(programmatic.active, (isActive) => {
      if (!isActive) {
        programmaticSplatActive = false
        programmaticSplatStartTime = undefined
        return
      }
      beginProgrammaticSplat()
    }, { immediate: true })
    const stopRestart = watch(programmatic.restartToken, () => {
      if (!programmatic.active.value) {
        return
      }
      beginProgrammaticSplat()
    })
    fluidParamWatchers.push(stopActive, stopRestart)
  }
}

function startLoop(fluidEngine: BABYLON.WebGPUEngine): void {
  let lastFrameTime: number | undefined
  const render = () => {
    if (!fluidEngine) {
      animationHandle = undefined
      return
    }
    const fluidDisposedAccessor = (fluidEngine as any).isDisposed
    const fluidDisposed =
      typeof fluidDisposedAccessor === 'function' ? fluidDisposedAccessor.call(fluidEngine) : Boolean(fluidDisposedAccessor)
    if (fluidDisposed) {
      animationHandle = undefined
      return
    }

    const frameNow = now()

    if (programmaticSplatActive && fluidSim) {
      if (programmaticSplatStartTime === undefined) {
        programmaticSplatStartTime = frameNow
        programmaticColorPhase = Math.random() * Math.PI * 2
      }
      const startTime = programmaticSplatStartTime ?? frameNow
      programmaticSplatStartTime = startTime
      const elapsedSeconds = Math.max(0, (frameNow - startTime) / 1000)
      updateProgrammaticSplat(elapsedSeconds)
      if (state.debugMode.value === 'splat') {
        updateFluidDisplaySource()
      }
    }

    const pointerTriggered = fluidPointer.down && fluidPointer.moved
    // Apply direct pointer splat if needed
    if (pointerTriggered && fluidSim) {
      const radius = computeNormalizedSplatRadius()
      const velX = fluidPointer.vx
      const velY = fluidPointer.vy
      const speed = Math.sqrt(velX * velX + velY * velY)

      if (speed >= 1e-6) {
        const dirX = velX / speed
        const dirY = -velY / speed
        const velocity: [number, number] = [dirX * speed, dirY * speed]
        // Dye color is NOT scaled by speed (unlike velocity), just by injection strength
        const dye: [number, number, number] = [
          (fluidPointer.color.r / 255) * currentDyeInjectionStrength,
          (fluidPointer.color.g / 255) * currentDyeInjectionStrength,
          (fluidPointer.color.b / 255) * currentDyeInjectionStrength,
        ]

        fluidSim.applySplat({
          point: [fluidPointer.x, 1 - fluidPointer.y],
          velocityDelta: velocity,
          dyeColor: dye,
          radius,
        })

        if (state.debugMode.value === 'splat') {
          updateFluidDisplaySource()
        }
      }

    }

    if (pointerTriggered) {
      fluidPointer.moved = false
      fluidPointer.vx = 0
      fluidPointer.vy = 0
    }

    const shouldRenderFluid = !state.paused || pointerTriggered || programmaticSplatActive
    if (shouldRenderFluid) {
      const dt = lastFrameTime !== undefined ? Math.min((frameNow - lastFrameTime) / 1000, 1 / 30) : 1 / 60
      lastFrameTime = frameNow
      if (!state.paused) {
        fluidSim?.updateForFrame(dt)
      }
      fluidEngine.beginFrame()
      try {
        fluidSim?.renderAll(fluidEngine as unknown as BABYLON.Engine)
        fluidCanvasPaint?.renderAll(fluidEngine as unknown as BABYLON.Engine)
      } finally {
        fluidEngine.endFrame()
      }
    }
    animationHandle = requestAnimationFrame(render)
  }
  lastFrameTime = now()
  animationHandle = requestAnimationFrame(render)
}

function setupEngine(fluidEngine: BABYLON.WebGPUEngine): void {
  disposeGraph()
  clearListeners()
  const shouldBlockShortcut = (event: KeyboardEvent): boolean => {
    const active = document.activeElement as HTMLElement | null
    const target = (event.target as HTMLElement | null) ?? active
    if (!target) {
      return false
    }
    if (target.isContentEditable) {
      return true
    }
    const tagName = target.tagName
    return tagName === 'INPUT' || tagName === 'TEXTAREA'
  }

  const createNumberShortcutHandler = (mode: FluidDebugMode) => {
    return (event: KeyboardEvent) => {
      if (shouldBlockShortcut(event)) {
        return
      }
      setFluidDebugMode(mode)
    }
  }
  // singleKeydownEvent('p', () => {
  //   state.paused = !state.paused
  // })
  singleKeydownEvent('1', createNumberShortcutHandler('dye'))
  singleKeydownEvent('2', createNumberShortcutHandler('velocity'))
  singleKeydownEvent('3', createNumberShortcutHandler('divergence'))
  singleKeydownEvent('4', createNumberShortcutHandler('pressure'))
  singleKeydownEvent('5', createNumberShortcutHandler('splat'))
  singleKeydownEvent('6', createNumberShortcutHandler('splatRaw'))
  singleKeydownEvent('[', () => cycleFluidDebugMode(-1))
  singleKeydownEvent(']', () => cycleFluidDebugMode(1))
  const { width, height } = state
  fluidPointer.color = generatePointerColor()

  const fluidCanvasEl = document.getElementById('fluidCanvas') as HTMLCanvasElement | null
  if (!fluidCanvasEl) {
    console.warn('fluidCanvas not found')
    return
  }
  fluidCanvas = fluidCanvasEl
  fluidCanvas.width = width
  fluidCanvas.height = height

  const getFluidParam = (name: string) => state.fluidParams?.find(p => p.name === name)?.value.value ?? 0
  currentSplatRadius = getFluidParam('splatRadius') || 0.25
  currentForceStrength = getFluidParam('forceStrength') || 6000
  currentDyeInjectionStrength = state.fluidParams?.find(p => p.name === 'dyeInjectionStrength')?.value.value ?? 0.65

  // Compute sim resolution as 1/4 of canvas, dye at full canvas resolution
  const simWidth = Math.round(width / 4)
  const simHeight = Math.round(height / 4)
  const dyeWidth = width
  const dyeHeight = height

  console.log('Resolution debug:', {
    canvas: { width, height, ar: width / height },
    sim: { width: simWidth, height: simHeight, ar: simWidth / simHeight },
    dye: { width: dyeWidth, height: dyeHeight, ar: dyeWidth / dyeHeight }
  })

  fluidSim = new FluidSimulationEffect(
    fluidEngine,
    undefined,
    {
      simWidth,
      simHeight,
      displayWidth: dyeWidth,
      displayHeight: dyeHeight,
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
  state.debugMode.value = 'dye'
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

  if (fluidCanvas) {
    fluidCanvasPaint = new CanvasPaint(fluidEngine, { src: fluidSim.dye }, width, height, 'linear', 'half_float')
    updateFluidDisplaySource()
    attachPointerHandlers(fluidCanvas, fluidPointer)
  }

  if (fluidCanvasPaint) {
    shaderGraph = fluidCanvasPaint
  }

  state.shaderDrawFunc = () => {
    if (!fluidEngine) {
      return
    }
    fluidEngine.beginFrame()
    try {
      fluidSim?.renderAll(fluidEngine as unknown as BABYLON.Engine)
      fluidCanvasPaint?.renderAll(fluidEngine as unknown as BABYLON.Engine)
    } finally {
      fluidEngine.endFrame()
    }
  }

  // Prime the fluid simulation with one initial render to show the initial dye blob
  if (fluidSim) {
    fluidEngine.beginFrame()
    try {
      fluidSim.renderAll(fluidEngine as unknown as BABYLON.Engine)
      fluidCanvasPaint?.renderAll(fluidEngine as unknown as BABYLON.Engine)
    } finally {
      fluidEngine.endFrame()
    }
  }

  startLoop(fluidEngine)
}

let timeLoops: CancelablePromisePoxy<any>[] = []
const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

//todo - need some kind of checking to line up notes and syllables for non-haiku input or syllable miscount from claude
const haiku = ref(`A world of soft dew,
And within every dewdrop
A world of struggle.`)

const apiKey = ref('')

const testHaikuMetadata = {
  "mood": "Contemplative melancholy with underlying resilience",
  "wordAnalysis": [
    [
      {"word": "A", "syllables": 1, "accentSyllables": [0]},
      {"word": "world", "syllables": 1, "accentSyllables": [0]},
      {"word": "of", "syllables": 1, "accentSyllables": [] },
      {"word": "soft", "syllables": 1, "accentSyllables": [0]},
      {"word": "dew,", "syllables": 1, "accentSyllables": [0]}
    ],
    [
      {"word": "And", "syllables": 1, "accentSyllables": []},
      {"word": "within", "syllables": 2, "accentSyllables": [1]},
      {"word": "every", "syllables": 2, "accentSyllables": [0]},
      {"word": "dewdrop", "syllables": 2, "accentSyllables": [0]}
    ],
    [
      {"word": "A", "syllables": 1, "accentSyllables": [0]},
      {"word": "world", "syllables": 1, "accentSyllables": [0]},
      {"word": "of", "syllables": 1, "accentSyllables": []},
      {"word": "struggle.", "syllables": 2, "accentSyllables": [0]}
    ]
  ],
  "pitches": [60, 62, 64, 65, 60],
  "lineByLineMoodTransitions": [
    "Delicate wonder and pristine beauty",
    "Introspective deepening, zooming inward",
    "Poignant realization of hidden difficulty"
  ],
  "colorByLine": [
    {"r": 200, "g": 220, "b": 255},
    {"r": 150, "g": 180, "b": 220},
    {"r": 120, "g": 100, "b": 180}
  ]
}

function cleanupLine(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

type HaikuMetadataBase = {
  mood: string
  wordAnalysis: {word: string, syllables: number, accentSyllables: number[]}[][]
  lineByLineMoodTransitions: string[]
}

type HaikuCreativeMetadata = {
  pitches: number[]
  colorByLine: {r: number, g: number, b: number}[]
}

type HaikuMetadata = HaikuMetadataBase & HaikuCreativeMetadata

function wordAnalysisToRhythm(lineInfo: { word: string, syllables: number, accentSyllables: number[] }[]) {
  const dur: number[] = []
  const vel: number[] = []
  const pos: number[] = []
  let runningLength = 0

  const randBi = (n: number) => Math.floor(Math.random() * 2 * n) - n
  
  lineInfo.forEach(wordInfo => {
    const accents = new Set(wordInfo.accentSyllables)
    const syllables = Math.max(1, Math.floor(wordInfo.syllables))
    const duration = 1 / syllables
    for (let i = 0; i < syllables; i++) {
      pos.push(runningLength)
      dur.push(duration)
      if (accents.has(i)) {
        vel.push(110 + randBi(10))
      } else {
        vel.push(70 + randBi(10))
      }
      runningLength += duration
    }
  })

  return { dur, vel, pos, runningLength}
}

function pitchSeqToMelodies(pitchSeq: number[], rhythmInfo:  ReturnType<typeof wordAnalysisToRhythm>[]) {
  const base5 = [...pitchSeq]
  const repeatWindow = Math.max(0, base5.length - 1)
  const doublePickStart = repeatWindow > 0 ? Math.floor(Math.random() * repeatWindow) : 0
  const pickedNotes = base5.slice(doublePickStart, doublePickStart + 2)
  const insertInd = Math.floor(Math.random() * (base5.length + 1))
  const sevenPitches = [...base5]
  sevenPitches.splice(insertInd, 0, ...pickedNotes)
  const end5 = [...base5].reverse()

  const ri = rhythmInfo

  const notes0 = base5.map((p, i) => quickNote(p, ri[0].dur[i], ri[0].vel[i], ri[0].pos[i]))
  const clip0 = new AbletonClip('c0', ri[0].runningLength, notes0)

  const notes1 = sevenPitches.map((p, i) => quickNote(p, ri[1].dur[i], ri[1].vel[i], ri[1].pos[i]))
  const clip1 = new AbletonClip('c1', ri[1].runningLength, notes1)

  const notes2 = end5.map((p, i) => quickNote(p, ri[2].dur[i], ri[2].vel[i], ri[2].pos[i]))
  const clip2 = new AbletonClip('c2', ri[2].runningLength, notes2)

  return [clip0, clip1, clip2]
}

function haikuMetadataToMelodies(metadata: HaikuMetadata) {
  const rhytmInfo = metadata.wordAnalysis.map(wa => wordAnalysisToRhythm(wa))
  const melodies = pitchSeqToMelodies(metadata.pitches, rhytmInfo)
  return melodies
}

async function requestClaudeJson<T>(prompt: string, temperature = 0): Promise<T> {
  if (!apiKey.value) {
    throw new Error('API key is required')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey.value,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature,
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const contentText = data.content[0].text
  const jsonMatch = contentText.match(/\{[\s\S]*\}/)
  
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response')
  }

  return JSON.parse(jsonMatch[0])
}

async function analyzeHaikuWithClaude(): Promise<HaikuMetadata> {
  const basePrompt = `For the following haiku, return a JSON object of the following format:

{
  mood: string
  wordAnalysis: {word: string, syllables: number, accentSyllables: number[]}[][]
  lineByLineMoodTransitions: string[]
}

mood - a short description of the overall mood of the haiku 
wordAnalysis - a per-line, per-word analysis of the words in the haiku 
lineByLineMoodTransitions - the emotional arc of the poem by line - short descriptions

ignore any punctuation in the analysis - for the purpose of word groupings, group punctuation with its previous word

below is the haiku:

${haiku.value}`

  const creativePrompt = `For the following haiku, respond with a JSON object of the following format:

{
  pitches: number[]
  colorByLine: {r: number, g: number, b: number}[]
}

pitches - an array of exactly five midi pitch numbers (integers, 0-127) that capture the emotional character of the poem. be expressive and adventurous with your note choice and cadencees, but keep things diatonic unless the poem mood suggests otherwise
colorByLine - one RGB color (0-255 per channel) for each line, expressive but not gaudy; avoid near-white unless strongly justified

Return only the JSON object with no additional commentary.

Haiku:

${haiku.value}`

  const [baseMetadata, creativeMetadata] = await Promise.all([
    requestClaudeJson<HaikuMetadataBase>(basePrompt, 0),
    requestClaudeJson<HaikuCreativeMetadata>(creativePrompt, 1),
  ])

  if (!Array.isArray(creativeMetadata.pitches) || creativeMetadata.pitches.length !== 5) {
    throw new Error('Claude pitch response did not contain exactly five pitches')
  }

  if (!Array.isArray(creativeMetadata.colorByLine) || creativeMetadata.colorByLine.some(c =>
    typeof c?.r !== 'number' || typeof c?.g !== 'number' || typeof c?.b !== 'number'
  )) {
    throw new Error('Claude color response was not in the expected RGB array format')
  }

  console.log('colors', creativeMetadata.colorByLine)

  return {
    ...baseMetadata,
    ...creativeMetadata,
  }
}

// const piano = getPiano()
const pianoChain = getPianoChain()
pianoChain.paramFuncs.gain(1)
pianoChain.paramFuncs.delayMix(0.5)
pianoChain.paramFuncs.delayTime(0.75)
pianoChain.paramFuncs.chorusWet(0.8)
pianoChain.paramFuncs.chorusDepth(0.4)
pianoChain.paramFuncs.chorusRate(1.2)
// pianoChain.paramFuncs.reverb(0.7)
const piano = pianoChain.instrument

const playNote = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number) => {
  // console.log('note', pitch, velocity, noteDur)
  // piano.triggerAttack(m2f(pitch), undefined, velocity / 127)
  // ctx.branch(async ctx => {
  //   await ctx.wait(noteDur)
  //   piano.triggerRelease(m2f(pitch))
  // }).finally(() => {
  //   piano.triggerRelease(m2f(pitch))
  // })
  piano.triggerAttackRelease(m2f(pitch), noteDur * 2, Tone.now(), velocity/127)
}

async function startPipeline(skipMusic: boolean = false, useTestData: boolean = false) {

  const haikuMetadata = useTestData ? testHaikuMetadata : await analyzeHaikuWithClaude()
  const melodies = haikuMetadataToMelodies(haikuMetadata)
  launchProgrammaticPointer(melodies, haikuMetadata.colorByLine, skipMusic)
}

function launchProgrammaticPointer(melodies: AbletonClip[], colors: {readonly r: number, readonly g: number, readonly b: number}[], skipMusic: boolean = false) {
  launchLoop(async (ctx) => {
    if (!fluidCanvas) {
      console.warn('[fluid] launchProgrammaticPointer: fluid canvas not ready')
      return
    }

    resetSyntheticPointer(fluidPointer)

    const text = haiku.value
    const lines = text.split('\n')
      .map(cleanupLine)
      .filter(line => line.length > 0)
    const spaceWidth = 60
    const kernWidth = 16
    const width = fluidCanvas.width
    const height = fluidCanvas.height
    const scale = 2

    const runTime = 12

    for (const [i, line] of lines.entries()) {
      console.log('line', line)
      const layout = calculateLineLayout(line, {
        scale,
        spaceWidth,
        kernWidth,
        maxLineWidth: width * 0.7,
        canvasWidth: width,
        canvasHeight: height,
        horizontalAlign: 'center',
        verticalAlign: 'middle',
      })

      if (layout.positions.length === 0) {
        console.warn('[fluid] launchProgrammaticPointer: no glyph data available for line')
        continue
      }

      
      const startTime = ctx.time

      if (melodies && melodies[i] && !skipMusic) {
        launchLoop(async ctx => {
          const durBeats = melodies[i].duration
          const durSec = durBeats * ctx.bpm / 60
          const stretchFactor = runTime / durSec
          const newClip = melodies[i].scale(stretchFactor)
          for (const note of newClip.noteBuffer()) {
            // console.log('times', note.preDelta, note.postDelta ?? 0)
            await ctx.wait(note.preDelta)
            playNote(note.note.pitch, note.note.velocity, ctx, note.note.duration)
            await ctx.wait(note.postDelta ?? 0)
          }
        })
      }

      while (ctx.time - startTime < runTime) {
        const t = Math.min((ctx.time - startTime) / runTime, 1)
        const sample = sampleEntryIndexInLine(line, t, layout)
        const canvasX = sample.x
        const canvasY = sample.y
        updateSyntheticPointerFrame({
          canvasX,
          canvasY,
          down: true,
          color: colors[i] ?? { r: 255, g: 0, b: 0 },
        })
        await ctx.waitSec(0.016)
      }

      const finalSample = sampleEntryIndexInLine(line, 1, layout)
      updateSyntheticPointerFrame({
        canvasX: finalSample.x,
        canvasY: finalSample.y,
        down: false,
      })

      const densityParam = state.fluidParams?.find(p => p.name === 'densityDissipation')!

      //ramp density disappation up to 1
      const rampUpTime = 0.5
      const upStartTime = ctx.time
      while (ctx.time - upStartTime < rampUpTime) {
        const rampProgress = (ctx.time - upStartTime) / rampUpTime
        // fluidSim?.setUniforms({dyeDissipation: 0.18 + rampProgress*0.82})
        densityParam.value.value = 0.18 + rampProgress * 1.3
        await ctx.waitSec(0.016)
      }

      await ctx.waitSec(4)

      
      //ramp density dissapation down to 0.18
      const rampDownTime = 0.5
      const downStartTime = ctx.time
      while (ctx.time - downStartTime < rampDownTime) {
        const rampProgress = (ctx.time - downStartTime) / rampDownTime
        // fluidSim?.setUniforms({dyeDissipation: 0.18 + (1-rampProgress)*0.82})
        densityParam.value.value = 0.18 + (1 - rampProgress) * 1.3
        await ctx.waitSec(0.016)
      }
    }

    updateSyntheticPointerFrame({
      canvasX: width * 0.5,
      canvasY: height * 0.5,
      down: false,
    })
  })
}

onMounted(async () => {
  const handleEngineChange = (engines: { fluid?: BABYLON.WebGPUEngine; reaction?: BABYLON.WebGPUEngine } | undefined) => {
    if (engines?.fluid) {
      setupEngine(engines.fluid)
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

  await TONE_AUDIO_START
})

onUnmounted(() => {
  timeLoops.forEach(loop => loop.cancel())
  engineWatcher?.()
  engineWatcher = undefined
  disposeGraph()
  clearListeners()
})
</script>

<template>
  <div />
  <input v-model="apiKey" type="password" placeholder="Claude API Key" />
  <button @click="() => startPipeline(false, false)">Analyze & Run</button>
  <button @click="() => startPipeline(true, true)">test data graphics</button>
  <textarea v-model="haiku" placeholder="Enter haiku here" />
</template>
