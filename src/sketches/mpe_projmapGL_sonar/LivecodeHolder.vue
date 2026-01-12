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
import { MIDI_READY, getMPEInput, midiInputs, midiOutputs, type MPENoteStart, type MPENoteUpdate, type MPENoteEnd } from '@/io/midi'
import type { MIDIValOutput } from '@midival/core'
import * as Tone from 'tone'
import { m2f } from '@/music/mpeSynth'
import { TONE_AUDIO_START } from '@/music/synths'
import { INITIALIZE_ABLETON_CLIPS } from '@/io/abletonClips'
import { clipData as staticClipData } from '../sonar_sketch/clipData'
import { TimeContext, launchBrowser, CancelablePromiseProxy } from '@/channels/offline_time_context'
import { runLineWithDelay, type MelodyMapOptions } from './utils/playbackUtils'
import type { LoopHandle } from '@/channels/base_time_context'
import { MPEInput } from '@/io/mpe'
import type { MPEAnimBundle } from './mpeState'
import { allocateVoice, releaseVoice, type VoiceRotationState } from './mpeVoiceAlloc'
import { generateSparseGrid } from './mpeFillSpots'
import { startFillAnimation, startReleaseAnimation } from './mpeAnimLoop'
// MelodyMap imports
import { createMelodyMapState, type MelodyMapGlobalState } from './melodyMapState'
import {
  syncPolygonCache,
  allocateMelodyToPolygon,
  releaseMelody,
  cleanupCompletedArcs,
  buildCombinedNotePlayFunction,
  type VisualNotePlayFunc
} from './melodyMapUtils'
import type { ArcRenderData } from './textRegionUtils'

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

// MelodyMap state
const melodyMapState: MelodyMapGlobalState = createMelodyMapState()
const melodyMapRenderStates = new Map<string, RenderState>()

// MIDI playback state
const midiOuts: MIDIValOutput[] = []
let playNote: (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, instInd: number) => void = () => {}
const sliders: number[] = Array(17).fill(0.5) // Local slider state for LPD8/TouchOSC
let timeLoops: CancelablePromiseProxy<any>[] = []
const immediateLaunchQueue: Array<(ctx: TimeContext) => Promise<void>> = []

// Button state for UI buttons
const gateButtonStates = ref<Record<number, boolean>>({})
const gateButtonMelodiesUI: Record<number, LoopHandle> = {}

// Note-off protector: tracks active notes per channel/pitch to prevent premature note-offs
const activeNotes = new Map<string, Set<symbol>>() // key: "channel-pitch", value: set of note IDs

const getNoteKey = (channel: number, pitch: number) => `${channel}-${pitch}`

const playNoteMidi = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, voiceIdx: number) => {
  const inst = midiOuts[voiceIdx % midiOuts.length]
  if (!inst) return

  const noteId = Symbol() // Unique ID for this note instance
  const noteKey = getNoteKey(voiceIdx, pitch)

  // Track this note
  if (!activeNotes.has(noteKey)) {
    activeNotes.set(noteKey, new Set())
  }
  activeNotes.get(noteKey)!.add(noteId)

  inst.sendNoteOn(pitch, velocity)

  ctx.branch(async ctx => {
    await ctx.wait((noteDur ?? 0.1) * 0.98)

    // Remove this note from active set
    const noteSet = activeNotes.get(noteKey)
    if (noteSet) {
      noteSet.delete(noteId)
      // Only send note-off if no other notes of this pitch are active
      if (noteSet.size === 0) {
        inst.sendNoteOff(pitch)
        activeNotes.delete(noteKey)
      }
    }
  }).finally(() => {
    const noteSet = activeNotes.get(noteKey)
    if (noteSet) {
      noteSet.delete(noteId)
      if (noteSet.size === 0) {
        inst.sendNoteOff(pitch)
        activeNotes.delete(noteKey)
      }
    }
  })
}

const playNotePiano = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, _pianoIndex = 0) => {
  // Simple Tone.js synth fallback - using a basic synth since we don't have getDriftChain
  const synth = new Tone.Synth().toDestination()
  synth.triggerAttack(m2f(pitch), Tone.now(), velocity / 127)
  ctx.branch(async ctx => {
    await ctx.wait(noteDur * 0.98)
    synth.triggerRelease()
  }).finally(() => {
    synth.triggerRelease()
    synth.dispose()
  })
}

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromiseProxy<any> => {
  const loop = launchBrowser(block)
  timeLoops.push(loop)
  return loop
}

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

  // Sync MelodyMap polygons
  syncMelodyMapPolygons(state.polygon.bakedRenderData)

  if (polygonFxOpts) {
    const dropStates = dropAndScrollManager.getRenderStates()
    const matterStates = matterExplodeManager.getRenderStates()
    const mergedStates = new Map<string, RenderState>()
    dropStates.forEach((v, k) => mergedStates.set(k, v))
    matterStates.forEach((v, k) => mergedStates.set(k, v))
    mpeRenderStates.forEach((v, k) => mergedStates.set(k, v))
    melodyMapRenderStates.forEach((v, k) => mergedStates.set(k, v))

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

// MelodyMap Functions
const MELODY_MAP_LOG = true
const melodyMapLog = (...args: any[]) => MELODY_MAP_LOG && console.log('[MelodyMap]', ...args)

function syncMelodyMapPolygons(polygonData: PolygonRenderData) {
  // Sync the polygon cache with current data
  syncPolygonCache(melodyMapState, polygonData)

  // Update render states for all melodyMap polygons
  updateMelodyMapRenderStates()
}

function updateMelodyMapRenderStates() {
  // Group arcs by polygon
  const arcsByPolygon = new Map<string, ArcRenderData[]>()

  for (const drawInfo of melodyMapState.melodyDrawInfo.values()) {
    const existing = arcsByPolygon.get(drawInfo.polygonId) || []
    // Convert internal arc format to render format
    const arcs: ArcRenderData[] = drawInfo.activeArcs.map(arc => ({
      id: arc.id,
      startPoint: arc.startPoint,
      endPoint: arc.endPoint,
      startTime: arc.startTime,
      duration: arc.duration,
      pitch: arc.pitch,
      velocity: arc.velocity
    }))
    existing.push(...arcs)
    arcsByPolygon.set(drawInfo.polygonId, existing)
  }

  // Update render states
  melodyMapRenderStates.clear()
  for (const [polygonId, arcs] of arcsByPolygon) {
    melodyMapRenderStates.set(polygonId, {
      letters: [],
      textOffset: 0,
      text: '',
      melodyMapArcs: arcs
    })
  }

  // Also ensure melodyMap polygons without arcs have a render state
  for (const polygonId of melodyMapState.polygonColumns.keys()) {
    if (!melodyMapRenderStates.has(polygonId)) {
      melodyMapRenderStates.set(polygonId, {
        letters: [],
        textOffset: 0,
        text: '',
        melodyMapArcs: []
      })
    }
  }
}

function disposeMelodyMap() {
  melodyMapState.melodyToPolygon.clear()
  melodyMapState.melodyDrawInfo.clear()
  melodyMapState.columnCounter = 0
  melodyMapState.polygonColumns.clear()
  melodyMapState.polygonEdgePoints.clear()
  melodyMapRenderStates.clear()
}

// UI Button handlers (shared with MIDI button logic)
const baseClipNames = ['dscale5', 'dscale7', 'd7mel']
const baseTransform = 's_tr s0 dR7 : str s1 : rot s2 : rev s3 : orn s4 dR7 : easeCirc s5 : spread s7 dR7'
const delayTransform = 's_tr s8 dR7 : str s9 : rot s10 : rev s11 : orn s12 dR7 : easeCirc s13'

/**
 * Creates melodyMapOpts for runLineWithDelay.
 * The wrapPlayNote callback is called right before each melody plays,
 * allocating a polygon and creating a combined audio+visual playNote.
 * This ensures proper left/right alternation - counter only increments when melody actually plays.
 */
function createMelodyMapOpts(): MelodyMapOptions {
  return {
    wrapPlayNote: (basePlayNote: VisualNotePlayFunc) => {
      // Generate unique melody ID at the moment the melody is about to play
      const melodyId = `melody_${Date.now()}_${crypto.randomUUID()}`

      // Allocate polygon (this increments the left/right counter)
      const polygonId = allocateMelodyToPolygon(melodyId, melodyMapState, appState.polygonRenderData)

      if (polygonId) {
        melodyMapLog(`Melody ${melodyId} allocated to polygon ${polygonId} (counter: ${melodyMapState.columnCounter})`)
        return buildCombinedNotePlayFunction(melodyId, melodyMapState, basePlayNote)
      } else {
        melodyMapLog(`No melodyMap polygon available for melody ${melodyId}`)
        return basePlayNote
      }
    }
  }
}

function triggerOneShotButton(ind: number) {
  console.log('UI oneShot', ind, baseClipNames[ind % baseClipNames.length])

  immediateLaunchQueue.push((ctx) => {
    const playbackAppState = {
      sliders,
      voices: [{ isPlaying: true, hotSwapCued: false }, { isPlaying: true, hotSwapCued: false }]
    }

    // Pass melodyMapOpts - polygon allocation happens inside runLineWithDelay
    // right before each melody plays (proper left/right alternation)
    runLineWithDelay(
      baseClipNames[ind % baseClipNames.length],
      baseTransform,
      delayTransform,
      ctx,
      playbackAppState,
      playNote,
      createMelodyMapOpts()
    )
    return Promise.resolve()
  })
}

function triggerGateButtonDown(ind: number) {
  if (gateButtonStates.value[ind]) return // Already pressed

  console.log('UI gate down', ind, baseClipNames[(ind - 4) % baseClipNames.length])
  gateButtonStates.value[ind] = true

  immediateLaunchQueue.push((ctx) => {
    const playbackAppState = {
      sliders,
      voices: [{ isPlaying: true, hotSwapCued: false }, { isPlaying: true, hotSwapCued: false }]
    }

    // Pass melodyMapOpts - if gate is released before delay plays,
    // the delay melody's polygon won't be allocated (correct behavior)
    const handle = runLineWithDelay(
      baseClipNames[(ind - 4) % baseClipNames.length],
      baseTransform,
      delayTransform,
      ctx,
      playbackAppState,
      playNote,
      createMelodyMapOpts()
    )
    gateButtonMelodiesUI[ind] = handle
    return Promise.resolve()
  })
}

function triggerGateButtonUp(ind: number) {
  if (!gateButtonStates.value[ind]) return // Already released

  console.log('UI gate up', ind)
  gateButtonStates.value[ind] = false

  const handle = gateButtonMelodiesUI[ind]
  if (handle) {
    handle.cancel()
    delete gateButtonMelodiesUI[ind]
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

    // Cleanup completed arcs each frame
    cleanupCompletedArcs(melodyMapState, performance.now())
    // Update render states for melodyMap (arcs may have changed)
    updateMelodyMapRenderStates()

    // Get fresh render states each frame for animations
    const dropStates = dropAndScrollManager.getRenderStates()
    const matterStates = matterExplodeManager.getRenderStates()
    const mergedStates = new Map<string, RenderState>()
    dropStates.forEach((v, k) => mergedStates.set(k, v))
    matterStates.forEach((v, k) => mergedStates.set(k, v))
    mpeRenderStates.forEach((v, k) => mergedStates.set(k, v))
    melodyMapRenderStates.forEach((v, k) => mergedStates.set(k, v))

    eng.beginFrame()
    renderPolygonFx(eng as any, mergedStates, frameId)
    eng.endFrame()
  }

  // Pause toggle
  singleKeydownEvent('p', () => { appState.paused = !appState.paused })

  // Setup MPE input and MIDI playback
  MIDI_READY.then(async () => {
    // Log all available MIDI inputs
    const availableInputs = Array.from(midiInputs.keys())
    mpeLog(`MIDI READY - Available inputs: [${availableInputs.join(', ')}]`)

    // Setup MIDI outputs for playback
    const iac1 = midiOutputs.get('IAC Driver Bus 1')
    const iac2 = midiOutputs.get('IAC Driver Bus 2')
    const iac3 = midiOutputs.get('IAC Driver Bus 3')
    const iac4 = midiOutputs.get('IAC Driver Bus 4')
    if (iac1) midiOuts.push(iac1)
    if (iac2) midiOuts.push(iac2)
    if (iac3) midiOuts.push(iac3)
    if (iac4) midiOuts.push(iac4)
    console.log('MIDI outputs configured:', midiOuts.length)

    // Initialize Ableton clips
    await INITIALIZE_ABLETON_CLIPS('src/sketches/sonar_sketch/piano_melodies Project/freeze_loop_setup_sonar.als', staticClipData, false)
    console.log('Ableton clips ready')

    // Wait for Tone.js audio to be ready
    await TONE_AUDIO_START
    console.log('Tone.js audio ready')

    // Set playNote to use MIDI output
    playNote = playNoteMidi

    // Setup LPD8 mk2 controller
    const lpd8 = midiInputs.get("LPD8 mk2")
    const lpdButtonMap = [40, 41, 42, 43, 36, 37, 38, 49]
    const midiNorm = (val: number) => Math.floor(val / 127 * 1000) / 1000
    if (lpd8) {
      console.log("LPD8 mk2 connected")
      // Map sliders 0-7 to CC 70-77
      Array.from({ length: 8 }, (_, i) => i).forEach(ind => {
        lpd8.onControlChange(ind + 70, (msg) => {
          sliders[ind] = midiNorm(msg.data2)
        })
      })

      // Setup button triggers for clip playback
      // Note: baseClipNames, baseTransform, delayTransform are defined at module level
      const gateButtonMelodies: Record<number, LoopHandle> = {}

      // Simple appState-like object for runLineWithDelay
      const playbackAppState = {
        sliders,
        voices: [{ isPlaying: true, hotSwapCued: false }, { isPlaying: true, hotSwapCued: false }]
      }

      Array.from({ length: 8 }, (_, i) => i).forEach(ind => {
        if (ind < 4) {
          // One-shot buttons (0-3)
          lpd8.onNoteOn(lpdButtonMap[ind], (_msg) => {
            console.log('oneShot', ind, lpdButtonMap[ind], baseClipNames[ind % baseClipNames.length])
            immediateLaunchQueue.push((ctx) => {
              // Pass melodyMapOpts - polygon allocation happens inside runLineWithDelay
              // right before each melody plays (proper left/right alternation)
              runLineWithDelay(
                baseClipNames[ind % baseClipNames.length],
                baseTransform,
                delayTransform,
                ctx,
                playbackAppState,
                playNote,
                createMelodyMapOpts()
              )
              return Promise.resolve()
            })
          })
        } else {
          // Gate buttons (4-7)
          lpd8.onNoteOn(lpdButtonMap[ind], (_msg) => {
            console.log('gate', ind, lpdButtonMap[ind], baseClipNames[(ind - 4) % baseClipNames.length])
            immediateLaunchQueue.push((ctx) => {
              // Pass melodyMapOpts - if gate is released before delay plays,
              // the delay melody's polygon won't be allocated (correct behavior)
              const handle = runLineWithDelay(
                baseClipNames[(ind - 4) % baseClipNames.length],
                baseTransform,
                delayTransform,
                ctx,
                playbackAppState,
                playNote,
                createMelodyMapOpts()
              )
              gateButtonMelodies[ind] = handle
              return Promise.resolve()
            })
          })
          lpd8.onNoteOff(lpdButtonMap[ind], (_msg) => {
            const handle = gateButtonMelodies[ind]
            if (handle) handle.cancel()
          })
        }
      })
    }

    // Setup TouchOSC Bridge - maps CC 0-8 to sliders 8-16
    const touchOSCBridge = midiInputs.get("TouchOSC Bridge")
    if (touchOSCBridge) {
      console.log("TouchOSC Bridge connected")
      Array.from({ length: 9 }, (_, i) => i).forEach(ind => {
        touchOSCBridge.onControlChange(ind, (msg) => {
          sliders[ind + 8] = midiNorm(msg.data2)
        })
      })
    }

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

    // Start immediate launch queue processing loop
    launchLoop(async (ctx) => {
      ctx.setBpm(120)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        immediateLaunchQueue.forEach(cb => cb(ctx))
        immediateLaunchQueue.length = 0
        await ctx.waitSec(0.016)
      }
    })
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
  disposeMelodyMap()
  disposePolygonFx()
  polygonFxOpts = null
  clearListeners()
  clearDrawFuncs()
  // Cancel all time loops
  timeLoops.forEach(tl => tl.cancel())
  timeLoops = []
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

  <!-- Teleport sliders to SketchHtml.vue -->
  <Teleport to="#slider-controls-target">
    <div class="slider-container">
      <!-- Row 1: Sliders 0-7 (vertical) -->
      <div class="slider-row">
        <div class="slider-label-row">Sliders 0-7 (LPD8)</div>
        <div class="sliders-vertical">
          <div v-for="i in 8" :key="i-1" class="slider-group">
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              :value="sliders[i-1]"
              @input="sliders[i-1] = parseFloat(($event.target as HTMLInputElement).value)"
              orient="vertical"
              class="slider-vertical"
            />
            <span class="slider-value">{{ sliders[i-1].toFixed(3) }}</span>
            <span class="slider-index">{{ i-1 }}</span>
          </div>
        </div>
      </div>

      <!-- Row 2: Sliders 8-15 (vertical) -->
      <div class="slider-row">
        <div class="slider-label-row">Sliders 8-15 (TouchOSC)</div>
        <div class="sliders-vertical">
          <div v-for="i in 8" :key="i+7" class="slider-group">
            <input
              type="range"
              min="0"
              max="1"
              step="0.001"
              :value="sliders[i+7]"
              @input="sliders[i+7] = parseFloat(($event.target as HTMLInputElement).value)"
              orient="vertical"
              class="slider-vertical"
            />
            <span class="slider-value">{{ sliders[i+7].toFixed(3) }}</span>
            <span class="slider-index">{{ i+7 }}</span>
          </div>
        </div>
      </div>

      <!-- Horizontal slider: Slider 16 -->
      <div class="slider-row horizontal">
        <div class="slider-label-row">Slider 16 (Delay)</div>
        <div class="slider-horizontal-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            :value="sliders[16]"
            @input="sliders[16] = parseFloat(($event.target as HTMLInputElement).value)"
            class="slider-horizontal"
          />
          <span class="slider-value">{{ sliders[16].toFixed(3) }}</span>
        </div>
      </div>

      <!-- Button Grid -->
      <div class="button-section">
        <div class="slider-label-row">Melody Triggers</div>

        <!-- Row 1: One-shot buttons (0-3) -->
        <div class="button-row">
          <div class="button-row-label">One-Shot</div>
          <div class="button-grid">
            <button
              v-for="i in 4"
              :key="`oneshot-${i-1}`"
              @click="triggerOneShotButton(i-1)"
              class="trigger-button oneshot"
            >
              {{ i-1 }}
            </button>
          </div>
        </div>

        <!-- Row 2: Gate buttons (4-7) -->
        <div class="button-row">
          <div class="button-row-label">Gate</div>
          <div class="button-grid">
            <button
              v-for="i in 4"
              :key="`gate-${i+3}`"
              @mousedown="triggerGateButtonDown(i+3)"
              @mouseup="triggerGateButtonUp(i+3)"
              @mouseleave="triggerGateButtonUp(i+3)"
              @touchstart.prevent="triggerGateButtonDown(i+3)"
              @touchend.prevent="triggerGateButtonUp(i+3)"
              @touchcancel.prevent="triggerGateButtonUp(i+3)"
              class="trigger-button gate"
              :class="{ active: gateButtonStates[i+3] }"
            >
              {{ i+3 }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.slider-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  user-select: none;
}

.slider-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slider-row.horizontal {
  flex-direction: column;
}

.slider-label-row {
  font-weight: 600;
  font-size: 14px;
  color: #333;
  text-align: left;
}

.sliders-vertical {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.slider-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.slider-vertical {
  writing-mode: bt-lr; /* IE */
  -webkit-appearance: slider-vertical; /* WebKit */
  appearance: slider-vertical;
  width: 8px;
  height: 150px;
  padding: 0;
  margin: 0;
  cursor: pointer;
}

.slider-horizontal-container {
  display: flex;
  align-items: center;
  gap: 16px;
}

.slider-horizontal {
  flex: 1;
  height: 8px;
  cursor: pointer;
}

.slider-value {
  font-size: 11px;
  color: #666;
  font-family: 'Courier New', monospace;
  min-width: 45px;
  text-align: center;
}

.slider-index {
  font-size: 10px;
  color: #999;
  font-weight: 600;
}

/* Custom slider styling */
input[type="range"] {
  background: #ddd;
  border-radius: 4px;
  outline: none;
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
  transition: background 0.15s;
}

input[type="range"]::-webkit-slider-thumb:hover {
  background: #45a049;
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4CAF50;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

input[type="range"]::-moz-range-thumb:hover {
  background: #45a049;
}

/* Button section */
.button-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 10px;
  border-top: 2px solid #ddd;
}

.button-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.button-row-label {
  font-size: 12px;
  font-weight: 600;
  color: #666;
  min-width: 70px;
}

.button-grid {
  display: flex;
  gap: 12px;
}

.trigger-button {
  width: 60px;
  height: 60px;
  border: 2px solid #666;
  border-radius: 8px;
  background: linear-gradient(145deg, #ffffff, #e0e0e0);
  color: #333;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.2);
  user-select: none;
}

.trigger-button:hover {
  background: linear-gradient(145deg, #f0f0f0, #d0d0d0);
  transform: translateY(-2px);
  box-shadow: 3px 3px 8px rgba(0, 0, 0, 0.25);
}

.trigger-button:active {
  transform: translateY(0);
  box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
}

.trigger-button.oneshot:active {
  background: linear-gradient(145deg, #FFD54F, #FFC107);
  border-color: #FF6F00;
}

.trigger-button.gate.active {
  background: linear-gradient(145deg, #81C784, #4CAF50);
  border-color: #2E7D32;
  box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.2);
}
</style>
