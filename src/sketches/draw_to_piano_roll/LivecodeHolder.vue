<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type DrawToPianoAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, mouseupEvent } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import type { LoopHandle } from '@/channels/base_time_context';
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll'
import { Scale } from '@/music/scale'
import { AbletonClip, quickNote, type AbletonNote } from '@/io/abletonClips';
import * as Tone from 'tone';
import { getPiano, getPianoChain, getSynthChain, TONE_AUDIO_START } from '@/music/synths';
import { m2f } from '@/music/clipPlayback';

const appState = inject<DrawToPianoAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

// ---- Multi-voice / colour configuration ----
const voiceColors = ['#ff5555', '#55ff55', '#5555ff']
const selectedColorIndex = ref(0)

// Returns visible pitch and time span of the piano roll in MIDI notes & beats
function getNoteRange(pr: PianoRoll<{voiceIndex: number}>) {
  // Access underlying SVG viewBox
  const vb = pr.svgRoot.viewbox()

  const startPos = vb.x / pr.quarterNoteWidth //in beats
  const endPos = (vb.x + vb.width) / pr.quarterNoteWidth //in beats

  const maxPitch = pr.svgYtoPitch(vb.y)
  const minPitch = pr.svgYtoPitch(vb.y + vb.height)

  return { minPitch, maxPitch, startPos, endPos }
}

let pianoRoll: PianoRoll<{voiceIndex: number}> = undefined
type SynthInstance = Tone.Sampler | Tone.PolySynth<Tone.Synth>
let synthInstances: SynthInstance[] = []
let onNotes: Set<number>[] = []

const launchQueue: ((ctx: TimeContext) => Promise<any>)[] = []
let playing = ref(false)

let loopPhase = ref(0)
let nextNotePosition = ref(0)
let hotSwapNoteWait = ref(0)

const drawDebugGrid = ref(false)

let drawnMelodyCounter = 0
const pianoRollToClip = (pianoRoll: PianoRoll<{voiceIndex: number}>, voiceIdx?: number) => {
  let notes = pianoRoll.getNoteData()
  if(typeof voiceIdx === 'number') {
    notes = notes.filter(n => n.metadata.voiceIndex === voiceIdx)
  }
  notes.sort((a, b) => a.position - b.position)
  const { startPos, endPos } = getNoteRange(pianoRoll)
  const abletonNotes = notes.map(note => quickNote(note.pitch, note.duration, note.velocity, note.position, note.metadata))
  return new AbletonClip(`pianoRollClip_${voiceIdx ?? 'all'}_${drawnMelodyCounter}`, endPos - startPos, abletonNotes)
}

const turnOffNotes = () => {
  onNotes.forEach((set, vIdx) => {
    const piano = synthInstances[vIdx]
    set.forEach(pitch => piano.triggerRelease(m2f(pitch)))
    set.clear()
  })
}

const playNoteForVoice = (note: AbletonNote, voiceIdx: number, ctx: TimeContext) => {
  const piano = synthInstances[voiceIdx]
  const noteSet = onNotes[voiceIdx]
  const {pitch, duration, velocity} = note
  piano.triggerAttack([m2f(pitch)], Tone.now(), velocity)
  ctx.branch(async ctx => {
    await ctx.wait(duration)
    piano.triggerRelease(m2f(pitch))
    noteSet.add(pitch)
  }).finally(() => {
    piano.triggerRelease(m2f(pitch))
    noteSet.delete(pitch)
  })
}

const startPianoRollLoop = () => {
  launchQueue.push(async (ctx: TimeContext) => {

    console.log('piano roll loop started')

    let clip = pianoRollToClip(pianoRoll)
    let noteBuffer = clip.noteBuffer()
    let noteBufferInd = 0
    const loopStartTime = ctx.beats
    const pianoRollDuration = clip.duration
    let currentMelodyId = drawnMelodyCounter

    ctx.branch(async ctx => {
      while(playing.value) {
        await ctx.wait(0.016)
        const beats = (ctx.beats - loopStartTime) % pianoRollDuration
        // console.log('setting cursor pos', beats)
        pianoRoll.setCursorPos(beats)
      }
      pianoRoll.setCursorPos(0)
    })

    let playNoteLoop = ctx.branch(async ctx => {
        while(playing.value) {
          const note = noteBuffer[noteBufferInd]
          const voiceIdx = note.note.metadata.voiceIndex
          if(!note) debugger
          // console.log('playing note', drawnMelodyCounter, noteBufferInd, ctx.beats, note)
          await ctx.wait(note.preDelta)
          if(!playing.value) break
          playNoteForVoice(note.note, voiceIdx, ctx)
          await ctx.wait(note.postDelta)
          noteBufferInd = (noteBufferInd + 1) % noteBuffer.length
        }
      })

    while(playing.value) {
      await ctx.wait(0.25)
      if(currentMelodyId !== drawnMelodyCounter) {
        playNoteLoop.cancel()
        turnOffNotes()
        playNoteLoop = ctx.branch(async ctx => {
          clip = pianoRollToClip(pianoRoll)
          noteBuffer = clip.noteBuffer()
          
        currentMelodyId = drawnMelodyCounter
          const currentLoopTime = (ctx.beats - loopStartTime) % pianoRollDuration
          
          let newNoteBufferInd = noteBuffer.findIndex(note => note.note.position > currentLoopTime)

          //if we're at the end of the new note buffer, we need to wait until the end of the loop time
          if(newNoteBufferInd === -1) {
            noteBufferInd = 0
            await ctx.wait(pianoRollDuration - currentLoopTime)
            console.log('waiting until end of loop time')
          } else {
            noteBufferInd = newNoteBufferInd

            //wait until the next note is ready to play, play it, and then increment index - it's easier
            //than handling pre-delta logic for the first note of the new buffer
            const nextNote = noteBuffer[noteBufferInd]
            const voiceIdx = nextNote.note.metadata.voiceIndex
            await ctx.wait(nextNote.note.position - currentLoopTime)
            playNoteForVoice(nextNote.note, voiceIdx, ctx)
            await ctx.wait(nextNote.postDelta)
            noteBufferInd = (noteBufferInd + 1) % noteBuffer.length
          }

          playNoteLoop = ctx.branch(async ctx => {
            while(playing.value) {
              const note = noteBuffer[noteBufferInd]
              const voiceIdx = note.note.metadata.voiceIndex
              if(!note) debugger
              // console.log('playing note', drawnMelodyCounter, noteBufferInd, ctx.beats, note)
              await ctx.wait(note.preDelta)
              playNoteForVoice(note.note, voiceIdx, ctx)
              await ctx.wait(note.postDelta)
              noteBufferInd = (noteBufferInd + 1) % noteBuffer.length
            }
          })
          
        })
      }
    }
  })
}

const togglePlay = () => {
  if(playing.value) {
    console.log('stopping piano roll loop')
    playing.value = false
  } else {
    console.log('starting piano roll loop')
    playing.value = true
    startPianoRollLoop()
  }
}

//  NEW: multi-stroke bookkeeping and helpers

type DebugGridInfo = {
  grid: boolean[][]
  totalPitches: number
  totalSixteenths: number
  minPitch: number
  maxPitch: number
  startPos: number
  endPos: number
}

// one entry per completed stroke
const savedDebugGrids: DebugGridInfo[] = []
const drawNotesLists: NoteInfo<{voiceIndex: number}>[][] = []
// Store paths for visualization, keeping colour/voice mapping
type DrawPath = { x: number; y: number }[]
type SavedDraw = { points: DrawPath; colorIndex: number }
const savedDrawPaths: SavedDraw[] = []
const showPaths = ref(true)

// Consolidate adjacent or overlapping notes across all strokes
const consolidateNotes = (input: NoteInfo<{voiceIndex: number}>[]): NoteInfo<{voiceIndex: number}>[] => {
  // Group by pitch AND voiceIndex first
  const byKey: Map<string, NoteInfo<{voiceIndex: number}>[]> = new Map()
  input.forEach(note => {
    const vIdx = note.metadata.voiceIndex
    const key = `${vIdx}-${note.pitch}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push({ ...note })
  })

  const output: NoteInfo<{voiceIndex: number}>[] = []
  const tolerance = 0.001

  for (const [_key, arr] of byKey.entries()) {
    // sort by start position
    arr.sort((a, b) => a.position - b.position)

    for (const note of arr) {
      if (output.length === 0 || output[output.length - 1].pitch !== note.pitch) {
        output.push({ ...note })
        continue
      }

      const last = output[output.length - 1]
      const lastEnd = last.position + last.duration
      if (note.position - lastEnd <= tolerance) {
        // merge/extend
        last.duration = Math.max(lastEnd, note.position + note.duration) - last.position
      } else {
        output.push({ ...note })
      }
    }
  }
  // keep overall order by start time
  output.sort((a, b) => a.position - b.position)
  return output
}

const updatePianoRollNotes = () => {
  const allNotes = drawNotesLists.flat()
  const consolidated = consolidateNotes(allNotes)
  pianoRoll.setNoteData(consolidated)
}

onMounted(async () => {
  try {

    pianoRoll = new PianoRoll<{voiceIndex: number}>('pianoRollHolder', () => {}, () => {}, true)

    await TONE_AUDIO_START

    // initialise per-voice piano samplers once audio context is ready
    const pianoChain = getPianoChain()
    pianoChain.paramFuncs.delayMix(0.3)
    pianoChain.paramFuncs.delayTime(0.45)
    pianoChain.paramFuncs.delayFeedback(0.65)
    pianoChain.paramFuncs.filterFreq(0.15)
    const synthChain = getSynthChain()
    synthInstances = [getPiano(), pianoChain.piano, synthChain.synth]
    onNotes = synthInstances.map(() => new Set<number>())

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement



    // ----------  Path capture state  ----------
    let drawingPath: { x: number; y: number }[] = []

    // Utility to fit an arbitrary MIDI pitch to the nearest note in a scale
    const scale = new Scale(undefined, 60) // C major root by default
    const snapPitchToScale = (pitch: number) => {
      // Rough approach – round to nearest chroma degree in the scale
      const indApprox = Math.round(scale.getIndFromPitch(pitch))
      return scale.getByIndex(indApprox)
    }

    const finalizeMelodyFromPath = () => {
      if (drawingPath.length < 2) return

      // Get current visible ranges from piano roll
      const { minPitch, maxPitch, startPos, endPos } = getNoteRange(pianoRoll)
      
      // 1. Normalize drawing coordinates to [0-1] range
      // Find the bounds of the drawing
      const canvas = { width: p5i.width, height: p5i.height }
      
      // 2. Create a boolean grid matching piano roll dimensions
      const totalSixteenths = Math.ceil((endPos - startPos) * 4) // 4 sixteenths per beat
      const totalPitches = maxPitch - minPitch + 1
      
      // Create a grid[pitch][time] = boolean
      const grid: boolean[][] = Array(totalPitches)
        .fill(null)
        .map(() => Array(totalSixteenths).fill(false))
      
      // Keep reference to grid in component scope for drawing
      const debugGrid = {
        grid,
        totalPitches,
        totalSixteenths,
        minPitch,
        maxPitch,
        startPos,
        endPos
      }
      
      // 3. Fill the grid based on drawing points
      for (const point of drawingPath) {
        // Normalize coordinates to [0-1]
        const nx = point.x / canvas.width
        const ny = point.y / canvas.height
        
        // Map to grid coordinates
        const col = Math.floor(nx * totalSixteenths)
        // y is inverted (0 at top in canvas, but higher pitches are higher numbers)
        const row = Math.floor((1 - ny) * totalPitches)
        
        // Ensure we're in bounds
        if (col >= 0 && col < totalSixteenths && row >= 0 && row < totalPitches) {
          grid[row][col] = true
        }
      }
      
      // 4. First, convert grid to individual 16th notes
      const rawNotes: NoteInfo<{voiceIndex: number}>[] = []
      
      // Generate individual 16th notes from the grid
      for (let pitchIdx = 0; pitchIdx < totalPitches; pitchIdx++) {
        const rawPitch = minPitch + pitchIdx
        
        for (let col = 0; col < totalSixteenths; col++) {
          if (grid[pitchIdx][col]) {
            const position = startPos + (col * 0.25) // convert to beats
            const duration = 0.25 // 16th note
            
            // Apply scale snapping here
            const actualPitch = snapPitchToScale(rawPitch)
            
            rawNotes.push({
              pitch: actualPitch,
              position,
              duration,
              velocity: 0.8,
              metadata: { voiceIndex: selectedColorIndex.value }
            })
          }
        }
      }
      
      // 5. Consolidate adjacent notes with the same pitch
      // Use the same consolidation logic used for all notes
      const notes = consolidateNotes(rawNotes)

      // Save this stroke and update roll (consolidation happens inside helper)
      savedDebugGrids.push(debugGrid)
      drawNotesLists.push(notes)
      // Save the path for visualization
      savedDrawPaths.push({ points: [...drawingPath], colorIndex: selectedColorIndex.value })
      updatePianoRollNotes()
      drawnMelodyCounter++

      // Clear path to start new stroke
      drawingPath = []
    }

    // ----------  Bind mouse events via helper utilities ----------
    let isDrawing = false

    mousedownEvent(ev => {
      const p5xy = targetToP5Coords(ev, p5i, threeCanvas)
      drawingPath = [p5xy]
      isDrawing = true
    }, threeCanvas)

    mousemoveEvent(ev => {
      if (!isDrawing) return
      const p5xy = targetToP5Coords(ev, p5i, threeCanvas)
      drawingPath.push(p5xy)
    }, threeCanvas)

    mouseupEvent(ev => {
      if (!isDrawing) return
      const p5xy = targetToP5Coords(ev, p5i, threeCanvas)
      drawingPath.push(p5xy)
      isDrawing = false
      finalizeMelodyFromPath()
    }, threeCanvas)

    // ------------------------------------------
    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

      
      
    appState.drawFunctions.push((p: p5) => {
      // First draw the debug grid if available
      if (savedDebugGrids.length > 0 && drawDebugGrid.value) {
        savedDebugGrids.forEach(({ grid, totalPitches, totalSixteenths }) => {
          const cellWidth = p.width / totalSixteenths
          const cellHeight = p.height / totalPitches
          p.push()
          p.noStroke()
          p.fill(0, 100, 200, 80)
          for (let row = 0; row < totalPitches; row++) {
            for (let col = 0; col < totalSixteenths; col++) {
              if (grid[row][col]) {
                const x = col * cellWidth
                const y = (1 - (row + 1) / totalPitches) * p.height
                p.rect(x, y, cellWidth, cellHeight)
              }
            }
          }
          p.stroke(100, 100, 100, 100)
          p.strokeWeight(0.5)
          for (let col = 0; col <= totalSixteenths; col++) {
            const x = col * cellWidth
            p.line(x, 0, x, p.height)
          }
          for (let row = 0; row <= totalPitches; row++) {
            const y = row * cellHeight
            p.line(0, y, p.width, y)
          }
          p.pop()
        })
      }
      
      // Draw all saved paths
      if (savedDrawPaths.length > 0 && showPaths.value) {
        p.push()
        p.noFill()
        p.strokeWeight(2)
        savedDrawPaths.forEach(saved => {
          if (saved.points.length > 1) {
            const col = voiceColors[saved.colorIndex % voiceColors.length]
            const c = p.color(col)
            p.stroke(c)
            p.beginShape()
            saved.points.forEach(pt => p.vertex(pt.x, pt.y))
            p.endShape()
          }
        })
        p.pop()
      }
      
      // Then draw the current path on top
      if (drawingPath.length > 1) {
        p.push()
        p.noFill()
        p.stroke(voiceColors[selectedColorIndex.value])
        p.strokeWeight(2)
        p.beginShape()
        drawingPath.forEach(pt => p.vertex(pt.x, pt.y))
        p.endShape()
        p.pop()
      }
    })

    launchLoop(async (ctx: TimeContext) => {
      while(true) {
        await ctx.wait(0.5)
        launchQueue.forEach(f => {
          console.log('launching loop')
          ctx.branch(f)
        })
        launchQueue.length = 0
      }
    })

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    
  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
  clearDrawFuncs()
})

// Add Undo / Clear helpers
const undoDraw = () => {
  if (savedDebugGrids.length === 0) return
  savedDebugGrids.pop()
  drawNotesLists.pop()
  savedDrawPaths.pop()
  updatePianoRollNotes()
  drawnMelodyCounter++
}

const clearDraws = () => {
  if (savedDebugGrids.length === 0) return
  savedDebugGrids.length = 0
  drawNotesLists.length = 0
  savedDrawPaths.length = 0
  updatePianoRollNotes()
  drawnMelodyCounter++
  if (playing.value) togglePlay()
  turnOffNotes()
}

</script>

<template>
  <div class="livecode-container">
    <div class="controls-container">
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="drawDebugGrid" class="checkbox" />
          <span class="checkmark"></span>
          Draw debug grid
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="showPaths" class="checkbox" />
          <span class="checkmark"></span>
          Show paths
        </label>
      </div>
      
      <div class="voice-selector">
        <label class="select-label">Voice / Colour</label>
        <div class="select-wrapper">
          <select v-model="selectedColorIndex" class="voice-select">
            <option v-for="(c,idx) in voiceColors" :key="idx" :value="idx">
              Voice {{ idx+1 }}
            </option>
          </select>
          <div class="color-indicator" :style="{ backgroundColor: voiceColors[selectedColorIndex] }"></div>
        </div>
      </div>
      
      <div class="button-group">
        <button @click="togglePlay" class="btn btn-primary">
          <span class="btn-icon">{{ playing ? '⏹' : '▶' }}</span>
          {{ playing ? 'Stop' : 'Play' }}
        </button>
        <button @click="undoDraw" class="btn btn-secondary">
          <span class="btn-icon">↶</span>
          Undo
        </button>
        <button @click="clearDraws" class="btn btn-danger">
          <span class="btn-icon">🗑</span>
          Clear
        </button>
      </div>
    </div>
    
    <div class="piano-roll-wrapper">
      <div id="pianoRollHolder" class="piano-roll-container"></div>
    </div>
  </div>
</template>

<style scoped>
.livecode-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
}

.controls-container {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0;
  flex-wrap: wrap;
  justify-content: center;
}

.piano-roll-wrapper {
  display: flex;
  justify-content: center;
  width: 100%;
}

.checkbox-group {
  display: flex;
  gap: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #2d3748;
  font-size: 0.85rem;
  cursor: pointer;
  position: relative;
  user-select: none;
  font-weight: 500;
}

.checkbox {
  appearance: none;
  width: 16px;
  height: 16px;
  border: 2px solid #cbd5e0;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.checkbox:checked {
  background: linear-gradient(45deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
}

.checkmark {
  position: absolute;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  pointer-events: none;
}

.checkbox:checked + .checkmark::after {
  content: '✓';
  color: white;
  font-size: 10px;
  font-weight: bold;
  position: absolute;
  left: -1px;
  top: -2px;
}

.voice-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.select-label {
  color: #2d3748;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
}

.select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.voice-select {
  background: #f7fafc;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  color: #2d3748;
  padding: 0.3rem 0.5rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.voice-select:hover {
  background: #edf2f7;
  border-color: #cbd5e0;
}

.voice-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
}

.color-indicator {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #e2e8f0;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.button-group {
  display: flex;
  gap: 0.4rem;
}

.btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.8rem;
  border: none;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: relative;
  overflow: hidden;
}

.btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.btn:hover::before {
  left: 100%;
}

.btn-icon {
  font-size: 0.8rem;
}

.btn-primary {
  background: linear-gradient(45deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(102, 126, 234, 0.3);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: linear-gradient(45deg, #4a5568 0%, #2d3748 100%);
  color: #e0e0e0;
  box-shadow: 0 2px 6px rgba(74, 85, 104, 0.3);
}

.btn-secondary:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(74, 85, 104, 0.4);
  background: linear-gradient(45deg, #5a6578 0%, #3d4758 100%);
}

.btn-danger {
  background: linear-gradient(45deg, #e53e3e 0%, #c53030 100%);
  color: white;
  box-shadow: 0 2px 6px rgba(229, 62, 62, 0.3);
}

.btn-danger:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(229, 62, 62, 0.4);
}

.btn:active {
  transform: translateY(0);
}

.piano-roll-container {
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  min-height: 250px;
  width: fit-content;
  max-width: 100%;
}

/* Responsive design */
@media (max-width: 768px) {
  .controls-container {
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  
  .checkbox-group {
    gap: 0.5rem;
  }
  
  .voice-selector {
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  
  .button-group {
    justify-content: center;
  }
  
  .btn {
    flex: 1;
    min-width: 0;
    justify-content: center;
  }
}

/* Dark theme adjustments */
@media (prefers-color-scheme: dark) {
  .voice-select option {
    background: #2d3748;
    color: #e0e0e0;
  }
}
</style>