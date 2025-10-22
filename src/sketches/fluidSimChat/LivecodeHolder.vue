<script setup lang="ts">
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue'
import type * as BABYLON from 'babylonjs'
import { appStateName, engineRef, type FluidReactionAppState, type FluidDebugMode } from './appState'
import { CanvasPaint, type ShaderEffect } from '@/rendering/shaderFXBabylon'
import {
  FluidSimulationEffect,
  ScalarFieldDebugEffect,
  VelocityFieldDebugEffect,
} from '@/rendering/fluidSimulationHack'
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
  state.debugMode.value = 'dye'
  fluidCanvas = undefined
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

    // Apply direct pointer splat if needed
    if (fluidPointer.down && fluidPointer.moved && fluidSim) {
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

      fluidPointer.moved = false
      fluidPointer.vx = 0
      fluidPointer.vy = 0
    }

    const shouldRenderFluid = !state.paused || (fluidPointer.down && fluidPointer.moved)
    if (shouldRenderFluid) {
      const now = performance.now()
      const dt = lastFrameTime !== undefined ? Math.min((now - lastFrameTime) / 1000, 1 / 30) : 1 / 60
      lastFrameTime = now
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
  lastFrameTime = performance.now()
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

  // Preserve exact aspect ratio like Pavel's getResolution()
  function getResolution(resolution: number, canvasWidth: number, canvasHeight: number) {
    let aspectRatio = canvasWidth / canvasHeight
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio

    const min = Math.round(resolution)
    const max = Math.round(resolution * aspectRatio)

    if (canvasWidth > canvasHeight)
      return { width: max, height: min }
    else
      return { width: min, height: max }
  }

  // Split resolutions: low-res physics, higher-res dye visuals
  const simRes = getResolution(128, width, height)  // Base 128 like Pavel
  const dyeRes = getResolution(512, width, height)  // Base 512 (4x sim)
  const simWidth = simRes.width
  const simHeight = simRes.height
  const dyeWidth = dyeRes.width
  const dyeHeight = dyeRes.height

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

onMounted(() => {
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
})

onUnmounted(() => {
  engineWatcher?.()
  engineWatcher = undefined
  disposeGraph()
  clearListeners()
})
</script>

<template>
  <div />
</template>
