<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type DrawToPianoAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, mouseupEvent } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll'
import { Scale } from '@/music/scale'

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

  const startPos = vb.x / pr.quarterNoteWidth
  const endPos = (vb.x + vb.width) / pr.quarterNoteWidth

  const maxPitch = pr.svgYtoPitch(vb.y)
  const minPitch = pr.svgYtoPitch(vb.y + vb.height)

  return { minPitch, maxPitch, startPos, endPos }
}

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    // ----------  Piano roll setup  ----------
    const pianoRoll = new PianoRoll<any>('pianoRollHolder', () => {}, () => {})

    // make the piano roll initially show a sensible viewport
    // pianoRoll.setViewportToShowAllNotes()

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
      
      // 4. Convert grid to notes, joining horizontally adjacent cells
      const notes: NoteInfo<any>[] = []
      
      // For each pitch row in the grid
      for (let pitchIdx = 0; pitchIdx < totalPitches; pitchIdx++) {
        const actualPitch = snapPitchToScale(minPitch + pitchIdx)
        let noteStart = -1
        let noteLength = 0
        
        // Scan across the row looking for filled cells
        for (let col = 0; col < totalSixteenths; col++) {
          if (grid[pitchIdx][col]) {
            // Found a filled cell
            if (noteStart === -1) {
              // Start a new note
              noteStart = col
              noteLength = 1
            } else {
              // Extend current note
              noteLength++
            }
          } else if (noteStart !== -1) {
            // Found an empty cell after a note, finalize the note
            const position = startPos + (noteStart * 0.25) // convert to beats
            const duration = noteLength * 0.25
            notes.push({
              pitch: actualPitch,
              position,
              duration,
              velocity: 0.8
            })
            
            // Reset note tracking
            noteStart = -1
            noteLength = 0
          }
        }
        
        // Finalize any note that goes to the end of the grid
        if (noteStart !== -1) {
          const position = startPos + (noteStart * 0.25)
          const duration = noteLength * 0.25
          notes.push({
            pitch: actualPitch,
            position,
            duration,
            velocity: 0.8
          })
        }
      }

      // Update piano roll display
      pianoRoll.setNoteData(notes)

      // Clear path so it stops rendering
      // drawingPath = []

      // Keep the debug grid for visualization
      savedDebugGrid = debugGrid
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

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?
      
      
      appState.drawFunctions.push((p: p5) => {
        // First draw the debug grid if available
        if (savedDebugGrid) {
          const { grid, totalPitches, totalSixteenths } = savedDebugGrid
          
          // Calculate cell dimensions
          const cellWidth = p.width / totalSixteenths
          const cellHeight = p.height / totalPitches
          
          // Draw grid cells as rectangles
          p.push()
          p.noStroke()
          p.fill(0, 100, 200, 80) // Semi-transparent blue
          
          for (let row = 0; row < totalPitches; row++) {
            for (let col = 0; col < totalSixteenths; col++) {
              if (grid[row][col]) {
                // Convert from grid to canvas coordinates
                // Invert y since rows count from top pitch
                const x = col * cellWidth
                const y = (1 - (row + 1) / totalPitches) * p.height
                
                p.rect(x, y, cellWidth, cellHeight)
              }
            }
          }
          
          // Draw grid lines for reference
          p.stroke(100, 100, 100, 100)
          p.strokeWeight(0.5)
          
          // Vertical (time) lines
          for (let col = 0; col <= totalSixteenths; col++) {
            const x = col * cellWidth
            p.line(x, 0, x, p.height)
          }
          
          // Horizontal (pitch) lines
          for (let row = 0; row <= totalPitches; row++) {
            const y = row * cellHeight
            p.line(0, y, p.width, y)
          }
          
          p.pop()
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

      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      shaderGraphEndNode = canvasPaint
      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    code() 
  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <div id="pianoRollHolder"></div>
</template>

<style scoped></style>