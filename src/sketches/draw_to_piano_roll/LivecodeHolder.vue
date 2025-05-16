<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type DrawToPianoAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, mouseupEvent } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll'
import { Scale } from '@/music/scale'
import { AbletonClip, quickNote, type AbletonNote } from '@/io/abletonClips';
import * as Tone from 'tone';
import { getPiano, TONE_AUDIO_START } from '@/music/synths';
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

// Returns visible pitch and time span of the piano roll in MIDI notes & beats
function getNoteRange(pr: PianoRoll<any>) {
  // Access underlying SVG viewBox
  const vb = (pr as any).svgRoot.viewbox()

  const startPos = vb.x / pr.quarterNoteWidth //in beats
  const endPos = (vb.x + vb.width) / pr.quarterNoteWidth //in beats

  const maxPitch = pr.svgYtoPitch(vb.y)
  const minPitch = pr.svgYtoPitch(vb.y + vb.height)

  return { minPitch, maxPitch, startPos, endPos }
}

let pianoRoll: PianoRoll<any> = undefined
let piano: Tone.Sampler = undefined

const launchQueue: ((ctx: TimeContext) => Promise<any>)[] = []
let playing = ref(false)

let loopPhase = ref(0)
let nextNotePosition = ref(0)
let hotSwapNoteWait = ref(0)

let drawnMelodyCounter = 0
const pianoRollToClip = (pianoRoll: PianoRoll<any>) => {
  const notes = pianoRoll.getNoteData()
  notes.sort((a, b) => a.position - b.position)
  const { startPos, endPos } = getNoteRange(pianoRoll)
  const abletonNotes = notes.map(note => {
    return quickNote(note.pitch, note.duration, note.velocity, note.position)
  })
  return new AbletonClip(`pianoRollClip_${drawnMelodyCounter}`, endPos - startPos, abletonNotes)
}


const onNotes = new Set<number>()

const turnOffNotes = () => {
  for(const pitch of onNotes) {
    piano.triggerRelease(m2f(pitch))
  }
  onNotes.clear()
}

const playNote = (note: AbletonNote, ctx: TimeContext) => {
  const {pitch, duration, velocity} = note
  piano.triggerAttack([m2f(pitch)], Tone.now(), velocity)
  ctx.branch(async ctx => {
    await ctx.wait(duration)
    piano.triggerRelease(m2f(pitch))
    onNotes.add(pitch)
  }).finally(() => {
    piano.triggerRelease(m2f(pitch))
    onNotes.delete(pitch)
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
      while(true) {
        await ctx.wait(0.016)
        const beats = (ctx.beats - loopStartTime) % pianoRollDuration
        // console.log('setting cursor pos', beats)
        pianoRoll.setCursorPos(beats)
      }
    })

    let playNoteLoop = ctx.branch(async ctx => {
      while(playing.value) {
        const note = noteBuffer[noteBufferInd]
        if(!note) debugger
        // console.log('playing note', drawnMelodyCounter, noteBufferInd, ctx.beats, note)
        await ctx.wait(note.preDelta)
        playNote(note.note, ctx)
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
            await ctx.wait(nextNote.note.position - currentLoopTime)
            playNote(nextNote.note, ctx)
            await ctx.wait(nextNote.postDelta)
            noteBufferInd = (noteBufferInd + 1) % noteBuffer.length
          }

          playNoteLoop = ctx.branch(async ctx => {
            while(playing.value) {
              const note = noteBuffer[noteBufferInd]
              if(!note) debugger
              // console.log('playing note', drawnMelodyCounter, noteBufferInd, ctx.beats, note)
              await ctx.wait(note.preDelta)
              playNote(note.note, ctx)
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
const drawNotesList: NoteInfo<any>[][] = []

const updatePianoRollNotes = () => {
  const allNotes = drawNotesList.flat()
  pianoRoll.setNoteData(allNotes)
}

onMounted(async () => {
  try {

    pianoRoll = new PianoRoll<any>('pianoRollHolder', () => {}, () => {})

    await TONE_AUDIO_START
    piano = getPiano()

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement



    // ----------  Path capture state  ----------
    let drawingPath: { x: number; y: number }[] = []

    // Store the most recent grid for visualization
    let savedDebugGrid: { 
      grid: boolean[][],
      totalPitches: number,
      totalSixteenths: number, 
      minPitch: number, 
      maxPitch: number,
      startPos: number,
      endPos: number
    } | null = null

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
      const rawNotes: NoteInfo<any>[] = []
      
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
              velocity: 0.8
            })
          }
        }
      }
      
      // 5. Consolidate adjacent notes with the same pitch
      // Group notes by pitch
      const notesByPitch: Map<number, NoteInfo<any>[]> = new Map()
      
      for (const note of rawNotes) {
        if (!notesByPitch.has(note.pitch)) {
          notesByPitch.set(note.pitch, [])
        }
        notesByPitch.get(note.pitch)!.push(note)
      }
      
      // Create final notes array with proper consolidation
      const notes: NoteInfo<any>[] = []

      const noteTolerance = 0.001 // tolerance for floating comparisons

      for (const [pitch, pitchNotes] of notesByPitch.entries()) {
        // Sort by start position
        pitchNotes.sort((a, b) => a.position - b.position)

        // Consolidate sequentially
        const consolidated: NoteInfo<any>[] = []

        for (const note of pitchNotes) {
          if (consolidated.length === 0) {
            consolidated.push({ ...note })
            continue
          }

          const last = consolidated[consolidated.length - 1]
          const lastEnd = last.position + last.duration
          const noteStart = note.position
          const noteEnd = note.position + note.duration

          // If the note starts before or at the end of the last note (adjacent or overlapping)
          if (noteStart - lastEnd <= noteTolerance) {
            // Extend the last note's duration to cover the new note
            last.duration = Math.max(lastEnd, noteEnd) - last.position
          } else {
            // Non-overlapping, push as a new note
            consolidated.push({ ...note })
          }
        }

        notes.push(...consolidated)
      }

      // Update piano roll display
      pianoRoll.setNoteData(notes)
      drawnMelodyCounter++

      // Save this stroke and update roll
      savedDebugGrids.push(debugGrid)
      drawNotesList.push(notes)
      updatePianoRollNotes()

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
      if (savedDebugGrids.length > 0) {
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
      
      // Then draw the current path on top
      if (drawingPath.length > 1) {
        p.push()
        p.noFill()
        p.stroke(255, 0, 0)
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
  drawNotesList.pop()
  updatePianoRollNotes()
  drawnMelodyCounter++
}

const clearDraws = () => {
  if (savedDebugGrids.length === 0) return
  savedDebugGrids.length = 0
  drawNotesList.length = 0
  updatePianoRollNotes()
  drawnMelodyCounter++
  if (playing.value) togglePlay()
  turnOffNotes()
}

</script>

<template>
  <div id="debugDiv">
    <div>loop phase: {{ loopPhase }}</div>
    <div>next note position: {{ nextNotePosition }}</div>
    <div>hot swap note wait: {{ hotSwapNoteWait }}</div>
  </div>
  <button @click="togglePlay">{{ playing ? 'Stop' : 'Play' }}</button>
  <button @click="undoDraw">Undo</button>
  <button @click="clearDraws">Clear</button>
  <div id="pianoRollHolder"></div>
</template>

<style scoped></style>