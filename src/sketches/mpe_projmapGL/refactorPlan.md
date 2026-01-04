# MPE Projection Mapping - Lean Implementation Plan

## Core Insight

Use the existing patterns:
- **Timing**: `launchBrowser` + `ctx.waitSec()` for all ramping (no separate ADSR class)
- **State**: Simple structs/types, Maps for lookup
- **Bundles**: Extend the existing bundle pattern from `polygonFx.ts`
- **Functions**: Stateless functions that operate on data

---

## Data Structures

### MPE Voice State (what we get from MPEInput)

```typescript
// mpeState.ts

export type MPEVoiceState = {
  channel: number
  noteNum: number
  velocity: number
  pressure: number  // 0-127, updated live
  timbre: number    // 0-127, updated live
  bend: number      // pitch bend value
}

export type MPEAnimBundle = {
  polygonId: string
  voice: MPEVoiceState | null  // null = no active note
  fillProgress: number         // 0-1, driven by animation loop
  spots: Point[]               // pre-computed fill positions
  animLoop: CancelablePromiseProxy<void> | null
}
```

### Maps (the glue)

```typescript
// In LivecodeHolder.vue or a small mpeState.ts

const mpeBundles = new Map<string, MPEAnimBundle>()     // polygonId → bundle
const channelToPolygon = new Map<number, string>()      // MPE channel → polygonId (voice allocation)
const mpeRenderStates = new Map<string, RenderState>()  // for drawing
```

---

## Functions (not classes)

### Voice Allocation

```typescript
// mpeVoiceAlloc.ts

export function allocateVoice(
  channel: number,
  polygonIds: string[],
  channelToPolygon: Map<number, string>,
  bundles: Map<string, MPEAnimBundle>,
  voiceSteal: boolean
): string | null {
  // Find first polygon without an active voice
  for (const id of polygonIds) {
    const bundle = bundles.get(id)
    if (bundle && !bundle.voice) {
      channelToPolygon.set(channel, id)
      return id
    }
  }

  // Voice steal: take the oldest
  if (voiceSteal && polygonIds.length > 0) {
    const id = polygonIds[0]  // or track oldest separately
    const oldBundle = bundles.get(id)
    if (oldBundle?.voice) {
      channelToPolygon.delete(oldBundle.voice.channel)
    }
    channelToPolygon.set(channel, id)
    return id
  }

  return null
}

export function releaseVoice(
  channel: number,
  channelToPolygon: Map<number, string>,
  bundles: Map<string, MPEAnimBundle>
): string | null {
  const polygonId = channelToPolygon.get(channel)
  if (!polygonId) return null
  channelToPolygon.delete(channel)
  return polygonId
}
```

### Fill Spot Generation

```typescript
// mpeFillSpots.ts

export function generateSparseGrid(
  polygon: Point[],
  bbox: BBox,
  step: number
): Point[] {
  const spots: Point[] = []
  let rowNum = 0

  for (let y = bbox.minY; y <= bbox.maxY; y += step) {
    if (rowNum % 2 === 0) { rowNum++; continue }  // skip alternate rows

    const xOffset = (rowNum % 4 === 1) ? 0 : step / 2
    for (let x = bbox.minX + xOffset; x <= bbox.maxX; x += step * 2) {
      if (isPointInsidePolygon({ x, y }, polygon, bbox)) {
        spots.push({ x, y })
      }
    }
    rowNum++
  }

  return spots
}
```

### Color from Pitch

```typescript
// mpeColor.ts

const PITCH_CLASS_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

export function pitchToColor(noteNum: number, bend: number, bendRange = 48): { r: number, g: number, b: number } {
  const pitchClass = noteNum % 12
  const bendSemitones = (bend / 8192) * bendRange
  const hueOffset = bendSemitones * (30 / 12)  // 30° per semitone
  const hue = (PITCH_CLASS_HUES[pitchClass] + hueOffset + 360) % 360

  return hslToRgb(hue, 0.8, 0.6)
}

function hslToRgb(h: number, s: number, l: number): { r: number, g: number, b: number } {
  // standard HSL to RGB conversion
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0

  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }

  return { r: r + m, g: g + m, b: b + m }
}
```

---

## Animation with Timing Library

The key insight: **use `launchBrowser` for the fill animation, not a separate envelope class**.

```typescript
// mpeAnimLoop.ts

import { launchBrowser, type CancelablePromiseProxy, type BrowserTimeContext } from '@/channels/offline_time_context'

export function startFillAnimation(
  bundle: MPEAnimBundle,
  attackTime: number,
  renderStates: Map<string, RenderState>
): CancelablePromiseProxy<void> {
  // Cancel any existing animation
  bundle.animLoop?.cancel()

  const loop = launchBrowser(async (ctx) => {
    // Attack: ramp fillProgress from current to 1
    const startProgress = bundle.fillProgress
    const attackStart = ctx.time

    while (!ctx.isCanceled && bundle.fillProgress < 1) {
      const elapsed = ctx.time - attackStart
      bundle.fillProgress = Math.min(1, startProgress + (1 - startProgress) * (elapsed / attackTime))
      updateRenderState(bundle, renderStates)
      await ctx.waitSec(0.016)  // ~60fps
    }

    // Sustain: hold at 1, just keep updating render state for MPE modulation
    while (!ctx.isCanceled && bundle.voice) {
      updateRenderState(bundle, renderStates)
      await ctx.waitSec(0.016)
    }
  })

  bundle.animLoop = loop
  return loop
}

export function startReleaseAnimation(
  bundle: MPEAnimBundle,
  releaseTime: number,
  renderStates: Map<string, RenderState>
): CancelablePromiseProxy<void> {
  bundle.animLoop?.cancel()

  const loop = launchBrowser(async (ctx) => {
    const startProgress = bundle.fillProgress
    const releaseStart = ctx.time

    while (!ctx.isCanceled && bundle.fillProgress > 0) {
      const elapsed = ctx.time - releaseStart
      bundle.fillProgress = Math.max(0, startProgress * (1 - elapsed / releaseTime))
      updateRenderState(bundle, renderStates)
      await ctx.waitSec(0.016)
    }

    bundle.fillProgress = 0
    updateRenderState(bundle, renderStates)
  })

  bundle.animLoop = loop
  return loop
}

function updateRenderState(bundle: MPEAnimBundle, renderStates: Map<string, RenderState>) {
  const numSpots = Math.floor(bundle.spots.length * bundle.fillProgress)
  const letters = bundle.spots.slice(0, numSpots).map((pos, idx) => ({ pos, idx }))

  renderStates.set(bundle.polygonId, {
    letters,
    textOffset: 0,
    text: ''  // not using text for MPE mode
  })
}
```

---

## Integration in LivecodeHolder.vue

```typescript
// In LivecodeHolder.vue

import { MPEInput, type MPENoteStart, type MPENoteUpdate, type MPENoteEnd } from '@/io/mpe'
import { MIDI_READY, getMPEInput } from '@/io/midi'
import { allocateVoice, releaseVoice } from './mpeVoiceAlloc'
import { generateSparseGrid } from './mpeFillSpots'
import { pitchToColor } from './mpeColor'
import { startFillAnimation, startReleaseAnimation } from './mpeAnimLoop'

// State
const mpeBundles = new Map<string, MPEAnimBundle>()
const channelToPolygon = new Map<number, string>()
const mpeRenderStates = new Map<string, RenderState>()
let mpeInput: MPEInput | null = null

// Setup in onMounted
onMounted(async () => {
  // ... existing setup ...

  await MIDI_READY
  mpeInput = getMPEInput('Sensel Morph', { zone: 'lower' })

  if (mpeInput) {
    mpeInput.onNoteStart(handleNoteStart)
    mpeInput.onNoteUpdate(handleNoteUpdate)
    mpeInput.onNoteEnd(handleNoteEnd)
  }
})

function handleNoteStart(evt: MPENoteStart) {
  const polygonIds = Array.from(mpeBundles.keys())
  const polygonId = allocateVoice(evt.channel, polygonIds, channelToPolygon, mpeBundles, true)
  if (!polygonId) return

  const bundle = mpeBundles.get(polygonId)!
  bundle.voice = {
    channel: evt.channel,
    noteNum: evt.noteNum,
    velocity: evt.velocity,
    pressure: evt.pressure,
    timbre: evt.timbre,
    bend: evt.bend
  }

  startFillAnimation(bundle, 0.1, mpeRenderStates)  // 100ms attack
}

function handleNoteUpdate(evt: MPENoteUpdate) {
  const polygonId = channelToPolygon.get(evt.channel)
  if (!polygonId) return

  const bundle = mpeBundles.get(polygonId)
  if (!bundle?.voice) return

  // Update voice state - render loop will pick this up
  bundle.voice.pressure = evt.pressure
  bundle.voice.timbre = evt.timbre
  bundle.voice.bend = evt.bend
}

function handleNoteEnd(evt: MPENoteEnd) {
  const polygonId = releaseVoice(evt.channel, channelToPolygon, mpeBundles)
  if (!polygonId) return

  const bundle = mpeBundles.get(polygonId)
  if (!bundle) return

  bundle.voice = null
  startReleaseAnimation(bundle, 0.3, mpeRenderStates)  // 300ms release
}

// Sync bundles when polygons change
function syncMPEBundles(polygonData: PolygonRenderData) {
  const currentIds = new Set(polygonData.map(p => p.id))

  // Remove deleted
  for (const id of mpeBundles.keys()) {
    if (!currentIds.has(id)) {
      const bundle = mpeBundles.get(id)!
      bundle.animLoop?.cancel()
      mpeBundles.delete(id)
      mpeRenderStates.delete(id)
    }
  }

  // Add/update
  for (const poly of polygonData) {
    let bundle = mpeBundles.get(poly.id)
    if (!bundle) {
      const bbox = bboxOfPoints(poly.points)
      bundle = {
        polygonId: poly.id,
        voice: null,
        fillProgress: 0,
        spots: generateSparseGrid(poly.points, bbox, 20),
        animLoop: null
      }
      mpeBundles.set(poly.id, bundle)
    }
  }
}
```

---

## Drawing

```typescript
// In the p5 draw function

const mpeState = mpeRenderStates.get(polygon.id)
const mpeBundle = mpeBundles.get(polygon.id)

if (mpeState && mpeBundle?.voice) {
  const color = pitchToColor(mpeBundle.voice.noteNum, mpeBundle.voice.bend)
  const pressureScale = 0.5 + (mpeBundle.voice.pressure / 127) * 0.5  // 0.5 to 1

  p.push()
  p.noStroke()
  p.fill(color.r * 255, color.g * 255, color.b * 255)

  mpeState.letters.forEach(({ pos }) => {
    const size = 8 * pressureScale
    p.circle(pos.x, pos.y, size)
  })
  p.pop()
} else if (mpeState) {
  // Released note - draw with fixed color, fading
  p.push()
  p.noStroke()
  p.fill(255, 255, 255, mpeBundle?.fillProgress * 255)

  mpeState.letters.forEach(({ pos }) => {
    p.circle(pos.x, pos.y, 8)
  })
  p.pop()
}
```

---

## Shader Modulation (Optional)

If you want pressure/timbre to control shader effects:

```typescript
// In polygonFx.ts syncChainsAndMeshes or renderPolygonFx

const mpeBundle = mpeBundles.get(poly.id)
if (mpeBundle?.voice && chain) {
  const pressureNorm = mpeBundle.voice.pressure / 127
  const timbreNorm = mpeBundle.voice.timbre / 127

  chain.wobble.setUniforms({
    xStrength: pressureNorm * 0.02,
    yStrength: pressureNorm * 0.02,
    time: () => performance.now() / 1000
  })

  chain.hBlur.setUniforms({ pixels: timbreNorm * 10 })
  chain.vBlur.setUniforms({ pixels: timbreNorm * 10 })
}
```

---

## Files

| File | Purpose |
|------|---------|
| `mpeState.ts` | Types: `MPEVoiceState`, `MPEAnimBundle` |
| `mpeVoiceAlloc.ts` | Functions: `allocateVoice`, `releaseVoice` |
| `mpeFillSpots.ts` | Function: `generateSparseGrid` |
| `mpeColor.ts` | Function: `pitchToColor` |
| `mpeAnimLoop.ts` | Functions: `startFillAnimation`, `startReleaseAnimation` |

**Modified:**
- `LivecodeHolder.vue` - wire up MPE handlers, sync bundles, merge render states

---

## What's NOT Needed

- ❌ `ADSREnvelope` class - use timing library directly
- ❌ `MPEAnimationManager` class - just functions + Maps
- ❌ Complex voice tracking - simple channel→polygon Map
- ❌ Separate color utilities module - inline or tiny helper

---

## Summary

~200 lines of new code total:
- ~30 lines types
- ~30 lines voice allocation
- ~20 lines spot generation
- ~20 lines color
- ~60 lines animation loops
- ~40 lines LivecodeHolder integration

The timing library handles all the hard parts (drift-free timing, cancellation). We just call `ctx.waitSec()` in loops.
