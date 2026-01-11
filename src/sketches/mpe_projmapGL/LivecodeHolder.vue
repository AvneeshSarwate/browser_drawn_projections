<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from 'vue'
import * as BABYLON from 'babylonjs'
import CanvasRoot from '@/canvas/CanvasRoot.vue'
import { appStateName, engineRef, type TemplateAppState, drawFlattenedStrokeGroup, resolution, textAnimMetadataSchema, textStyleMetadataSchema, fxChainMetadataSchema } from './appState'
import type { CanvasStateSnapshot, PolygonRenderData } from '@/canvas/canvasState'
import { clearListeners, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse'
import type p5 from 'p5'
import { getPreset } from './presets'
import { DropAndScrollManager } from './dropAndScroll'
import { MatterExplodeManager } from './matterExplode'
import { syncChainsAndMeshes, renderPolygonFx, disposePolygonFx, type PolygonFxSyncOptions } from './polygonFx'
import { getTextStyle, getTextAnim, type RenderState, type Point } from './textRegionUtils'
import { runAllTimingTests } from '@/channels/timing_tests'
// MPE imports
import { MIDI_READY, getMPEInput, midiInputs, type MPENoteStart, type MPENoteUpdate, type MPENoteEnd } from '@/io/midi'
import { MPEInput } from '@/io/mpe'
import type { MPEAnimBundle } from './mpeState'
import { allocateVoice, releaseVoice, type VoiceRotationState } from './mpeVoiceAlloc'
import { generateSparseGrid } from './mpeFillSpots'
import { startFillAnimation, startReleaseAnimation } from './mpeAnimLoop'

const appState = inject<TemplateAppState>(appStateName)!!
const canvasRootRef = ref<InstanceType<typeof CanvasRoot> | null>(null)
const dropAndScrollManager = new DropAndScrollManager(() => appState.p5Instance)
const matterExplodeManager = new MatterExplodeManager(() => appState.p5Instance)
let polygonFxOpts: PolygonFxSyncOptions | null = null
let frameCounter = 0

// MPE state
const mpeBundles = new Map<string, MPEAnimBundle>()
const channelToPolygon = new Map<number, string>()
const mpeRenderStates = new Map<string, RenderState>()
let mpeInput: MPEInput | null = null
const voiceRotation: VoiceRotationState = { nextIndex: 0 }

// async function runTimingTests() {
//   console.log('Running timing tests...')
//   try {
//     await runAllTimingTests()
//   } catch (err) {
//     console.error(err)
//   }
//   console.log('Timing tests completed')
// }
// runTimingTests()


const metadataSchemas = [textAnimMetadataSchema, textStyleMetadataSchema, fxChainMetadataSchema]

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

  // Sync MPE bundles
  syncMPEBundles(state.polygon.bakedRenderData)

  if (polygonFxOpts) {
    const dropStates = dropAndScrollManager.getRenderStates()
    const matterStates = matterExplodeManager.getRenderStates()
    const mergedStates = new Map<string, RenderState>()
    dropStates.forEach((v, k) => mergedStates.set(k, v))
    matterStates.forEach((v, k) => mergedStates.set(k, v))
    mpeRenderStates.forEach((v, k) => mergedStates.set(k, v))

    syncChainsAndMeshes(polygonSyncPayload, { ...polygonFxOpts, renderStates: mergedStates })
  }
  const postManagerTime = performance.now()
  console.log("manager update", postManagerTime-preManagerTime, postManagerTime-midManagerTime)
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

const sleepWait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// MPE Logging
const MPE_LOG = true
const mpeLog = (...args: any[]) => MPE_LOG && console.log('[MPE]', ...args)

// MPE Functions
function syncMPEBundles(polygonData: PolygonRenderData) {
  const currentIds = new Set(polygonData.map(p => p.id))
  const mpePolygons = polygonData.filter(p => getTextAnim(p.metadata).fillAnim === 'mpe')

  // Remove deleted polygons from MPE bundles
  for (const id of mpeBundles.keys()) {
    if (!currentIds.has(id)) {
      mpeLog(`BUNDLE REMOVE (deleted) - polygon: ${id}`)
      const bundle = mpeBundles.get(id)!
      bundle.animLoop?.cancel()
      mpeBundles.delete(id)
      mpeRenderStates.delete(id)
    }
  }

  // Add/update polygons
  for (const poly of polygonData) {
    const anim = getTextAnim(poly.metadata)
    if (anim.fillAnim !== 'mpe') {
      // If polygon is no longer MPE type, remove its bundle
      if (mpeBundles.has(poly.id)) {
        mpeLog(`BUNDLE REMOVE (fillAnim changed) - polygon: ${poly.id}`)
        const bundle = mpeBundles.get(poly.id)!
        bundle.animLoop?.cancel()
        mpeBundles.delete(poly.id)
        mpeRenderStates.delete(poly.id)
      }
      continue
    }

    let bundle = mpeBundles.get(poly.id)
    if (!bundle) {
      const gridStep = anim.gridStep ?? 20
      const spots = generateSparseGrid(poly.points as Point[], gridStep)
      mpeLog(`BUNDLE CREATE - polygon: ${poly.id}, gridStep: ${gridStep}, spots: ${spots.length}, points: ${poly.points.length}`)
      bundle = {
        polygonId: poly.id,
        voice: null,
        fillProgress: 0,
        spots,
        animLoop: null
      }
      mpeBundles.set(poly.id, bundle)
      // Initialize empty render state
      mpeRenderStates.set(poly.id, { letters: [], textOffset: 0, text: '' })
    } else {
      // Update spots if polygon shape changed
      const gridStep = anim.gridStep ?? 20
      bundle.spots = generateSparseGrid(poly.points as Point[], gridStep)
    }
  }

  // Log summary
  if (mpePolygons.length > 0 || mpeBundles.size > 0) {
    mpeLog(`SYNC SUMMARY - total polygons: ${polygonData.length}, mpe polygons: ${mpePolygons.length}, bundles: ${mpeBundles.size}`)
  }
}

function handleNoteStart(evt: MPENoteStart) {
  mpeLog(`NOTE START - ch: ${evt.channel}, note: ${evt.noteNum}, vel: ${evt.velocity}, pressure: ${evt.pressure}, timbre: ${evt.timbre}, bend: ${evt.bend}`)

  // Get list of MPE polygon IDs
  const polygonIds = Array.from(mpeBundles.keys())
  mpeLog(`  -> Available polygons: ${polygonIds.length} [${polygonIds.join(', ')}]`)

  const polygonId = allocateVoice(evt.channel, polygonIds, channelToPolygon, mpeBundles, true, voiceRotation)
  if (!polygonId) {
    mpeLog(`  -> NO POLYGON ALLOCATED (no MPE polygons available)`)
    return
  }

  mpeLog(`  -> Allocated to polygon: ${polygonId}`)

  const bundle = mpeBundles.get(polygonId)!

  // If stealing a voice, trigger release on the old note first
  if (bundle.voice) {
    mpeLog(`  -> Voice steal from note: ${bundle.voice.noteNum}`)
    bundle.voice = null
  }

  bundle.voice = {
    channel: evt.channel,
    noteNum: evt.noteNum,
    velocity: evt.velocity,
    pressure: evt.pressure,
    timbre: evt.timbre,
    bend: evt.bend
  }

  // Get attack time from polygon metadata
  const polygon = appState.polygonRenderData.find(p => p.id === polygonId)
  const anim = polygon ? getTextAnim(polygon.metadata) : { attackTime: 0.1 }
  const attackTime = anim.attackTime ?? 0.1

  mpeLog(`  -> Starting attack animation, attackTime: ${attackTime}s, spots: ${bundle.spots.length}`)
  startFillAnimation(bundle, attackTime, mpeRenderStates)
}

function handleNoteUpdate(evt: MPENoteUpdate) {
  const polygonId = channelToPolygon.get(evt.channel)
  if (!polygonId) return

  const bundle = mpeBundles.get(polygonId)
  if (!bundle?.voice) return

  // Update voice state - the animation loop will pick this up for rendering
  bundle.voice.pressure = evt.pressure
  bundle.voice.timbre = evt.timbre
  bundle.voice.bend = evt.bend

  // Log occasionally (throttled by checking if values changed significantly)
  mpeLog(`NOTE UPDATE - ch: ${evt.channel}, polygon: ${polygonId}, pressure: ${evt.pressure}, timbre: ${evt.timbre}, bend: ${evt.bend}`)
}

function handleNoteEnd(evt: MPENoteEnd) {
  mpeLog(`NOTE END - ch: ${evt.channel}, note: ${evt.noteNum}, vel: ${evt.velocity}`)

  const polygonId = releaseVoice(evt.channel, channelToPolygon)
  if (!polygonId) {
    mpeLog(`  -> No polygon found for channel ${evt.channel}`)
    return
  }

  mpeLog(`  -> Releasing polygon: ${polygonId}`)

  const bundle = mpeBundles.get(polygonId)
  if (!bundle) {
    mpeLog(`  -> Bundle not found for polygon ${polygonId}`)
    return
  }

  bundle.voice = null

  // Get release time from polygon metadata
  const polygon = appState.polygonRenderData.find(p => p.id === polygonId)
  const anim = polygon ? getTextAnim(polygon.metadata) : { releaseTime: 0.3 }
  const releaseTime = anim.releaseTime ?? 0.3

  mpeLog(`  -> Starting release animation, releaseTime: ${releaseTime}s, currentProgress: ${bundle.fillProgress}`)
  startReleaseAnimation(bundle, releaseTime, mpeRenderStates)
}

function disposeMPE() {
  // Cancel all animation loops
  for (const bundle of mpeBundles.values()) {
    bundle.animLoop?.cancel()
  }
  mpeBundles.clear()
  channelToPolygon.clear()
  mpeRenderStates.clear()
  voiceRotation.nextIndex = 0

  // Close MPE input
  if (mpeInput) {
    mpeInput.close()
    mpeInput = null
  }
}

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

  // Main p5 drawing function for this sketch
  appState.drawFunctions.push((p: p5) => {
    const dropStates = dropAndScrollManager.getRenderStates()
    const matterStates = matterExplodeManager.getRenderStates()

    if (appState.polygonRenderData.length > 0) {
      p.push()
      appState.polygonRenderData.forEach((polygon) => {
        const textStyle = getTextStyle(polygon.metadata)
        const textColor = textStyle.textColor
        const to255 = (c: number) => c <= 1 ? c * 255 : c
        const color = {
          r: to255(textColor.r),
          g: to255(textColor.g),
          b: to255(textColor.b),
          a: 255
        }
        const textSize = textStyle.textSize
        const fontFamily = textStyle.fontFamily
        const fontStyle = textStyle.fontStyle
        const textAnim = getTextAnim(polygon.metadata)
        const fillAnim = textAnim.fillAnim
        const isDropAndScroll = fillAnim === 'dropAndScroll'
        const isMatterExplode = fillAnim === 'matterExplode'
        const isMPE = fillAnim === 'mpe'
        const renderState = isDropAndScroll
          ? dropStates.get(polygon.id)
          : isMatterExplode
            ? matterStates.get(polygon.id)
            : undefined

        if (isDropAndScroll || isMatterExplode) {
          // console.log("draw polygon")
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
            // console.log("draw polygon 0")
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
            // console.log("draw polygon 1")
          }
        } else if (isMPE) {
          // MPE mode: rendering handled by polygonFx.ts through shader pipeline
          // Don't draw anything here - the actual circles are drawn in redrawGraphics
        } else {
          p.fill(color.r, color.g, color.b, color.a)
          p.noStroke()
          p.beginShape()
          polygon.points.forEach(point => {
            p.vertex(point.x, point.y)
          })
          p.endShape()
          // console.log("draw polygon 2")
        }
      })
      p.pop()
    }

    if (appState.freehandRenderData.length > 0) {
      drawFlattenedStrokeGroup(p, appState.freehandRenderData)
    }
  })

  // Babylon overlay uses p5 canvas as source; no full-screen canvas paint
  const dpr = window.devicePixelRatio || 1
  const renderWidth = resolution.width * dpr
  const renderHeight = resolution.height * dpr

  polygonFxOpts = {
    engine,
    p5Canvas,
    dpr,
    mainP5: appState.p5Instance!!,
    renderStates: new Map(),
  }

  appState.shaderDrawFunc = () => {
    const eng = engineRef.value
    if (!eng) return
    const frameId = `f${frameCounter++}`

    // Get fresh render states each frame for animations
    const dropStates = dropAndScrollManager.getRenderStates()
    const matterStates = matterExplodeManager.getRenderStates()
    const mergedStates = new Map<string, RenderState>()
    dropStates.forEach((v, k) => mergedStates.set(k, v))
    matterStates.forEach((v, k) => mergedStates.set(k, v))
    mpeRenderStates.forEach((v, k) => mergedStates.set(k, v))

    eng.beginFrame()
    renderPolygonFx(eng as any, mergedStates, frameId)
    eng.endFrame()
  }

  // Pause toggle
  singleKeydownEvent('p', () => { appState.paused = !appState.paused })

  // Setup MPE input
  MIDI_READY.then(() => {
    // Log all available MIDI inputs
    const availableInputs = Array.from(midiInputs.keys())
    mpeLog(`MIDI READY - Available inputs: [${availableInputs.join(', ')}]`)

    // Try to connect to common MPE controllers - adjust device name as needed
    const mpeDeviceNames = ['LinnStrument MIDI', 'IAC Driver Bus 2', 'Sensel Morph', 'Seaboard', 'Continuum']
    for (const name of mpeDeviceNames) {
      mpeLog(`  -> Trying to connect to: ${name}`)
      const input = getMPEInput(name, { zone: 'lower' })
      if (input) {
        mpeInput = input
        mpeInput.onNoteStart(handleNoteStart)
        mpeInput.onNoteUpdate(handleNoteUpdate)
        mpeInput.onNoteEnd(handleNoteEnd)
        mpeLog(`CONNECTED to ${name}`)
        break
      }
    }
    if (!mpeInput) {
      mpeLog(`NO MPE CONTROLLER FOUND in preferred list. Trying first available input...`)
      // Try the first available MIDI input as fallback
      if (availableInputs.length > 0) {
        const firstName = availableInputs[0]
        mpeLog(`  -> Trying fallback: ${firstName}`)
        const input = getMPEInput(firstName, { zone: 'lower' })
        if (input) {
          mpeInput = input
          mpeInput.onNoteStart(handleNoteStart)
          mpeInput.onNoteUpdate(handleNoteUpdate)
          mpeInput.onNoteEnd(handleNoteEnd)
          mpeLog(`CONNECTED to fallback: ${firstName}`)
        }
      }
    }
    if (!mpeInput) {
      mpeLog(`NO MIDI INPUT AVAILABLE - check browser MIDI permissions`)
    }
  }).catch(err => {
    console.error('[MPE] MIDI initialization failed:', err)
  })
})

onUnmounted(() => {
  // Dispose shader graph and input listeners, and clear any registered draw funcs
  appState.shaderDrawFunc = undefined
  dropAndScrollManager.dispose()
  matterExplodeManager.dispose()
  disposeMPE()
  disposePolygonFx()
  polygonFxOpts = null
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
    :show-snapshots="true"
    :metadata-schemas="metadataSchemas"
  />
</template>
