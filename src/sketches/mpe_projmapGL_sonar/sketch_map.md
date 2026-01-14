# mpe_projmapGL_sonar Sketch Map

Quick-reference document for understanding the core data flows in this music-graphics mapping sketch.

## Architecture Overview

This sketch combines three visual systems driven by MIDI/music input:
1. **MPE System**: Polygon fills driven by MIDI pressure/timbre from MPE controllers
2. **MelodyMap System**: Visual arcs across polygons synchronized with melody playback
3. **FX System**: Post-processing effects with selectable chain types:
   - `basicBlur`: wobble, blur, pixelation, polygon masking (original)
   - `feedbackBloom`: feedback loop, blur, transform, layer blend, bloom, polygon masking

**Key External Dependencies**:
- **CanvasRoot** (`@/canvas/CanvasRoot.vue`): External component that provides polygon/freehand drawing UI. Shape data flows INTO this sketch via `syncCanvasState()` callback.
- **offline_time_context** (`@/channels/offline_time_context`): Custom timing library providing `TimeContext`, `launchBrowser()`, and `CancelablePromiseProxy`. This is the core timing system, NOT Tone.js.
- **Tone.js**: Only used for audio synthesis triggering (`Tone.now()` for synth attacks), not for logical timing.

---

## Core Files & Responsibilities

### LivecodeHolder.vue (Orchestration Hub)
**Path**: `LivecodeHolder.vue`

The central connection point managing all state and lifecycle:

**Critical State**:
```typescript
const mpeBundles = new Map<string, MPEAnimBundle>()        // polygon -> MPE animation
const channelToPolygon = new Map<number, string>()         // MIDI channel -> polygon ID
const mpeRenderStates = new Map<string, RenderState>()     // polygon -> render data
const melodyMapState: MelodyMapGlobalState                 // global melody tracking
const sliders: number[] = Array(17).fill(0.5)              // combined LPD8 + TouchOSC
const immediateLaunchQueue: Array<(ctx: TimeContext) => Promise<void>> = []
```

**Key Functions**:
- `syncCanvasState()`: Pulls polygon changes, updates all managers
- `syncMPEBundles()`: Allocates/removes MPE bundles for polygons
- `handleNoteStart/Update/End()`: MPE MIDI event handlers
- `createMelodyMapOpts()`: Creates wrappers for polygon allocation during playback
- `triggerOneShotButton(ind)` / `triggerGateButtonDown/Up(ind)`: UI/MIDI button handlers

**Data Flow**:
- IN: CanvasRoot component (polygon shapes + metadata via `syncCanvasState` callback), MIDI inputs, Ableton clips, UI buttons
- OUT: appState, Babylon.js engine, MIDI outputs, p5.js canvas

**Canvas Integration**: The `<CanvasRoot>` component is mounted in the template with `:sync-state="syncCanvasState"`. When shapes are drawn/modified in the canvas UI, `syncCanvasState()` is called with the updated `CanvasStateSnapshot` containing all polygon and freehand data.

---

### melodyMapUtils.ts (Stateful Drawing Logic)
**Path**: `melodyMapUtils.ts`

Manages melody-to-polygon allocation and arc animations.

**Key Functions**:
```typescript
// Allocation
allocateMelodyToPolygon(melodyId, state, polygons): string | null
  // Increments columnCounter (drives left/right alternation)
  // Allocates to target column, fallback to other/middle

releaseMelody(melodyId, state): void

// Arc management
launchArc(melodyId, pitch, velocity, duration, state): ArcAnimation | null
  // Gets two random edge points from polygon
  // Creates arc with startTime = performance.now()

cleanupCompletedArcs(state, currentTime): void
  // Called each frame, removes finished arcs

// Render state generation
getMelodyMapRenderStates(state): Map<string, MelodyMapRenderState>
  // Groups arcs by polygon for rendering

// Note play function wrappers
buildCombinedNotePlayFunction(melodyId, state, audioPlayNote): VisualNotePlayFunc
  // Combines audio + visual playback per note

// Cache maintenance
syncPolygonCache(state, polygons): void
  // Removes stale caches, updates active ones
```

**State Mutation Model**: Direct Map mutation, arcs grow/shrink each frame.

---

### playbackUtils.ts (Playback Entry Point)
**Path**: `utils/playbackUtils.ts`

The main playback execution engine.

**Key Types**:
```typescript
type MelodyMapOptions = {
  wrapPlayNote: (basePlayNote: PlayNoteFunc) => PlayNoteFunc
  // Called right before melody plays, allocates polygon
}
```

**Key Functions**:
```typescript
playClipSimple(clip, ctx, voiceIndex, playNoteF)
  // Simple clip playback loop

runLineClean(lineText, ctx, voiceIndex, sliders, voices, ...)
  // Parses livecode line, plays with parameter automation

runLineWithDelay(baseClipName, baseTransform, delayTransform, ctx, appState, playNote, melodyMapOpts)
  // MAIN FUNCTION: plays base melody + delayed melody
  // Wraps playNote TWICE (base, then delay after slider-controlled delay)
```

**Critical Timing in runLineWithDelay**:
```typescript
// Base melody - allocation happens here (increments counter)
const basePlayNote = melodyMapOpts?.wrapPlayNote(playNote) ?? playNote
playClipSimple(delayRootClip!, ctx, 0, basePlayNote)

await ctx.wait(appState.sliders[DELAY_SLIDER]**2 * 8)  // delay slider

// Delayed melody - allocation happens here (increments counter again)
const delayPlayNote = melodyMapOpts?.wrapPlayNote(playNote) ?? playNote
runLineClean(delayLine, ctx, 1, ..., delayPlayNote, ...)
```

This ensures left/right column alternation happens only when melodies actually play.

---

### polygonFx.ts (Rendering Pipeline)
**Path**: `polygonFx.ts`

Babylon.js shader pipeline for all visual animations. Supports two selectable chain types via `fx.chain` metadata.

**Key Functions**:
```typescript
syncChainsAndMeshes(payload, opts): void
  // Removes chains for deleted polygons
  // Creates/updates shader pipelines based on fx.chain setting
  // Creates Babylon meshes with shader output as texture

createBasicBlurChain(engine, p5Canvas, graphics, bboxPx, bboxLogical, poly, fx): BasicBlurBundle
  // Original chain with wobble and pixelate effects

createFeedbackBloomChain(engine, p5Canvas, graphics, bboxPx, bboxLogical, poly, fx): FeedbackBloomBundle
  // New chain with feedback loop and bloom effects

renderPolygonFx(engine, renderStates, frameId): void
  // Per-frame: calls redrawGraphics, updates uniforms, renders chains
  // Updates pixelate only for basicBlur chains

redrawGraphics(g, poly, bboxLogical, renderState): void
  // Drawing logic varies by fillAnim mode:
  // - dropAndScroll/matterExplode: Draw letters at positions
  // - mpe: Draw circles at spots, colored by pitch, sized by pressure
  // - melodyMap: Draw traveling circles along arcs with trails

disposePolygonFx(): void
```

**Chain Types**:

**basicBlur** (default):
1. Passthru (pulls from p5.Graphics)
2. Wobble (sine distortion, controlled by fx.wobbleX/Y)
3. HBlur/VBlur (gaussian blur, controlled by fx.blurX/Y)
4. Pixelate (pixel grid, controlled by MPE timbre)
5. AlphaThreshold (cleanup)
6. PolygonMask (crop to polygon)
7. FlipY (WebGL correction)

**feedbackBloom**:
1. Passthru (pulls from p5.Graphics)
2. FeedbackNode (creates feedback loop)
3. VBlur/HBlur (gaussian blur, hardcoded 2px)
4. Transform (scale 0.995 for feedback shrinking)
5. LayerBlend (blends fresh source with transformed feedback)
6. Bloom (glow effect)
7. AlphaThreshold (cleanup)
8. PolygonMask (crop to polygon)
9. FlipY (WebGL correction)

---

## Key Data Types

### MelodyMapState (melodyMapState.ts)
```typescript
type ArcAnimation = {
  id: string
  startPoint: Point, endPoint: Point  // polygon edges
  startTime: number, duration: number
  pitch: number, velocity: number
}

type MelodyDrawInfo = {
  melodyId: string
  polygonId: string
  activeArcs: ArcAnimation[]
}

type MelodyMapGlobalState = {
  melodyToPolygon: Map<string, string>
  melodyDrawInfo: Map<string, MelodyDrawInfo>
  columnCounter: number                    // drives left/right alternation
  polygonColumns: Map<string, PolygonColumn>
  polygonEdgePoints: Map<string, Point[]>
}
```

### RenderState (textRegionUtils.ts)
```typescript
type RenderState = {
  letters: { pos: Point; idx: number }[]
  textOffset: number
  text: string
  mpeVoice?: MPEVoiceRenderData
  mpeFillProgress?: number
  melodyMapArcs?: ArcRenderData[]
}
```

### MPEAnimBundle (mpeState.ts)
```typescript
type MPEAnimBundle = {
  polygonId: string
  voice: MPEVoiceState | null
  fillProgress: number         // 0-1, driven by attack/release
  spots: Point[]              // sparse grid of fill positions
  animLoop: CancelablePromiseProxy<void> | null
}
```

---

## Data Flow Diagrams

### MelodyMap Flow
```
Button Press (oneShot/gate)
  │
  ▼
runLineWithDelay() in playbackUtils.ts
  │
  ├─ wrapPlayNote() called (allocates polygon, increments counter)
  │    │
  │    └─ allocateMelodyToPolygon() in melodyMapUtils.ts
  │         └─ getTargetColumn(counter) → 'left' or 'right'
  │
  ├─ playClipSimple() plays base melody
  │    │
  │    └─ For each note: buildCombinedNotePlayFunction()
  │         ├─ launchArc() → adds to activeArcs
  │         └─ playNote() → MIDI output
  │
  ├─ await delay (slider-controlled)
  │
  └─ wrapPlayNote() called again (increments counter, now opposite column)
       └─ runLineClean() plays delayed/transformed melody
```

### Rendering Flow
```
Each Animation Frame:
  │
  ├─ cleanupCompletedArcs(state, performance.now())
  │    └─ Removes arcs where elapsed > duration
  │
  ├─ getMelodyMapRenderStates(state)
  │    └─ Groups arcs by polygon → Map<polygonId, RenderState>
  │
  ├─ syncChainsAndMeshes() - updates shader pipelines
  │
  └─ renderPolygonFx()
       │
       └─ For each polygon with melodyMap fillAnim:
            └─ redrawGraphics() draws:
                 ├─ Circle or stroke at arc positions (based on noteDrawStyle)
                 └─ Polygon outline (when no arcs active)
```

### MPE Flow
```
MIDI Note On
  │
  ▼
allocateVoice() → assigns channel to polygon
  │
  ▼
startFillAnimation()
  ├─ Ramps fillProgress 0→1 over attackTime
  └─ updateRenderState() generates letters[] from spots[]
       │
       ▼
     renderPolygonFx() draws circles at letter positions

MIDI Note Off
  │
  ▼
releaseVoice() + startReleaseAnimation()
  └─ Ramps fillProgress 1→0 over releaseTime
```

---

## Metadata Schema (appState.ts)

Polygons have metadata controlling their behavior:

```typescript
fillAnim: 'dropAndScroll' | 'matterExplode' | 'mpe' | 'melodyMap'

// For melodyMap:
column: 'left' | 'middle' | 'right'  // allocation target
circleSize: number                    // arc circle radius
arcType: 'linear' | 'catmulRom' | 'spiral'  // arc path type
noteDrawStyle: 'circle' | 'stroke'   // how to draw notes
phaserEdge: number                    // stroke stagger width (small=sequential, large=overlapping)

// For mpe:
attackTime: number                    // fill ramp duration
releaseTime: number                   // fade ramp duration
gridStep: number                      // spot density
circleSize: number

// FX chain (all modes):
chain: 'basicBlur' | 'feedbackBloom'  // selects post-processing pipeline
enabled: boolean
pad: number                           // bounding box padding

// For basicBlur chain:
wobbleX: number                       // horizontal wobble strength
wobbleY: number                       // vertical wobble strength
blurX: number                         // horizontal blur pixels
blurY: number                         // vertical blur pixels
// pixelate controlled by MPE timbre
```

---

## Supporting Files Quick Reference

| File | Purpose |
|------|---------|
| `arcPaths.ts` | Arc path functions (linear, catmulRom, spiral), phaser formula, stroke generation |
| `mpeAnimLoop.ts` | Attack/release animation loops for MPE |
| `mpeVoiceAlloc.ts` | MIDI channel → polygon allocation |
| `mpeFillSpots.ts` | Sparse/dense grid generation inside polygons |
| `mpeColor.ts` | MIDI pitch → color mapping (12-color palette) |
| `melodyMapState.ts` | Type definitions + helper functions |
| `mpeState.ts` | MPE bundle type definitions |
| `textRegionUtils.ts` | RenderState type, metadata extraction, geometry utils |
| `dropAndScroll.ts` | Alternative text animation manager |

---

## Common Modification Patterns

### Adding a new arc visual property
1. Add to `ArcAnimation` type in `melodyMapState.ts`
2. Populate in `launchArc()` in `melodyMapUtils.ts`
3. Use in `redrawGraphics()` in `polygonFx.ts`

### Adding a new polygon metadata field
1. Add to Zod schema in `appState.ts`
2. Extract in `getTextAnim()` in `textRegionUtils.ts`
3. Use in relevant render/allocation code

### Changing allocation logic
1. Modify `allocateMelodyToPolygon()` in `melodyMapUtils.ts`
2. Adjust `createMelodyMapOpts()` in `LivecodeHolder.vue` if wrapper behavior changes

### Adding a new arc path type
1. Add to `ArcType` union in `arcPaths.ts`
2. Implement path function with signature `(startPt, endPt, progress, geometry) => Point`
3. Add to `arcPathRegistry` in `arcPaths.ts`
4. Add to `arcType` enum in melodyMap schema in `appState.ts`

### Adding a new note draw style
1. Add to `NoteDrawStyle` union in `arcPaths.ts`
2. Add to `noteDrawStyle` enum in melodyMap schema in `appState.ts`
3. Add rendering branch in `redrawGraphics()` melodyMap section in `polygonFx.ts`
4. Use `phaser()` + `generateStrokePoints()` for multi-point styles

### Adding a new shader effect to existing chain
1. Create shader in `src/rendering/babylonGL/postFX/` directory
2. Add to pipeline in appropriate `createXxxChain()` function in `polygonFx.ts`
3. Add uniforms update in `renderPolygonFx()` if needed

### Adding a new FX chain type
1. Add to `chain` enum in `fxChainSchema` in `appState.ts`
2. Create new bundle type (e.g., `NewChainBundle`) in `polygonFx.ts`
3. Add to `ChainBundle` union type
4. Create `createNewChain()` function with shader pipeline
5. Add branching in `syncChainsAndMeshes()` to select chain based on `fx.chain`
6. Add any per-frame uniform updates in `renderPolygonFx()` with chain type check

---

## MelodyMap Color System

The melodyMap system uses a two-parameter color scheme that creates visual continuity across melodies while differentiating between different root notes.

### Color Parameters

**`melodyRootBlend`** (0-1): Based on the first note's pitch class
- D (pitch class 2) = 0
- D# = 1/11
- E = 2/11
- ... continuing through the octave ...
- C# (pitch class 1) = 1

**`melodyProgBlend`** (0-1): Time-based position within the melody
- First note = 0
- Notes later in the melody approach 1
- Normalized over `DEFAULT_MELODY_DURATION_MS` (3000ms)

### Color Function (`mpeColor.ts`)

```typescript
function pitchToColor2(melodyRootBlend: number, melodyProgBlend: number): RGB {
  const colorA = sampleGradient(gradient1, melodyProgBlend)
  const colorB = sampleGradient(gradient3, melodyProgBlend)
  return lerpRgb(colorA, colorB, melodyRootBlend)
}
```

The function:
1. Samples two gradient ramps at `melodyProgBlend` position
2. Interpolates between them using `melodyRootBlend`

This creates a 2D color space where:
- Horizontal axis (melodyProgBlend): Colors evolve as melody progresses
- Vertical axis (melodyRootBlend): Different root notes get different color trajectories

### Data Flow

```
allocateMelodyToPolygon() [melodyMapUtils.ts]
  │
  └─ Initializes: melodyRootBlend: null, melodyStartTime: null
       │
       ▼
launchArc() [melodyMapUtils.ts] - First note
  │
  ├─ melodyStartTime = performance.now()
  ├─ melodyRootBlend = calculateMelodyRootBlend(pitch)
  │     └─ Formula: ((pitchClass - 2 + 12) % 12) / 11
  └─ melodyProgBlend = 0 (first note)
       │
       ▼
launchArc() [melodyMapUtils.ts] - Subsequent notes
  │
  ├─ elapsedMs = currentTime - melodyStartTime
  └─ melodyProgBlend = min(1, elapsedMs / 3000)
       │
       ▼
ArcAnimation stored with both blend values
       │
       ▼
updateMelodyMapRenderStates() [LivecodeHolder.vue]
  │
  └─ Converts to ArcRenderData (preserves blend values)
       │
       ▼
redrawGraphics() [polygonFx.ts]
  │
  └─ pitchToColor2(arc.melodyRootBlend, arc.melodyProgBlend)
       └─ Note color is FIXED at launch time
          (does not change as note travels along arc)
```

### Key Behavior

1. **Per-melody consistency**: All notes in a melody share the same `melodyRootBlend` (based on first note)
2. **Temporal progression**: Notes launched later have higher `melodyProgBlend` values
3. **Fixed note color**: Each note's color is calculated once at launch and remains constant throughout its arc animation
4. **Root-based variation**: Melodies starting on different pitches get different color trajectories

### Type Changes

**ArcAnimation** (`melodyMapState.ts`):
```typescript
type ArcAnimation = {
  // ... existing fields ...
  melodyRootBlend: number   // Set from first note, shared by melody
  melodyProgBlend: number   // Set at launch, unique per note
}
```

**MelodyDrawInfo** (`melodyMapState.ts`):
```typescript
type MelodyDrawInfo = {
  // ... existing fields ...
  melodyRootBlend: number | null   // Calculated from first note
  melodyStartTime: number | null   // Timestamp of first note
}
```

**ArcRenderData** (`textRegionUtils.ts`):
```typescript
type ArcRenderData = {
  // ... existing fields ...
  melodyRootBlend: number
  melodyProgBlend: number
}
```

### Gradients (`mpeColor.ts`)

The color system uses configurable gradient ramps:

```typescript
// gradient1: Green → Dark red → Purple
const gradient1: GradientStop[] = [
  { s: 0,   rgb: [0.74, 0.87, 0.37] },   // lime green
  { s: 0.5, rgb: [0.55, 0.27, 0.27] },   // dark red
  { s: 1,   rgb: [0.26, 0.18, 0.67] },   // purple
]

// gradient3: White → Magenta → Dark green
const gradient3: GradientStop[] = [
  { s: 0,   rgb: [0.96, 0.93, 0.93] },   // near white
  { s: 0.5, rgb: [0.64, 0.19, 0.41] },   // magenta
  { s: 1,   rgb: [0.06, 0.35, 0.08] },   // dark green
]
```

To modify colors, edit these gradients. The `s` value is the position (0-1) along the gradient.
