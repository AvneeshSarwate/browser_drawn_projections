<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type DrawToPianoAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, mousedragEvent, mouseupEvent } from '@/io/keyboardAndMouse';
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

      // Determine drawing bounds
      const xs = drawingPath.map(p => p.x)
      const ys = drawingPath.map(p => p.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)

      const totalBeats = endPos - startPos
      const sixteenth = 0.25 // 16th note duration in beats
      const numNotes = Math.floor(totalBeats / sixteenth)
      if (numNotes <= 0) return

      // Helper to interpolate Y at a given X along the drawn path
      const getYforX = (xTarget: number) => {
        // Find segment where x1<=xTarget<=x2
        for (let i = 0; i < drawingPath.length - 1; i++) {
          const p1 = drawingPath[i]
          const p2 = drawingPath[i + 1]
          if ((p1.x <= xTarget && xTarget <= p2.x) || (p2.x <= xTarget && xTarget <= p1.x)) {
            const t = (xTarget - p1.x) / (p2.x - p1.x || 1)
            return p1.y + t * (p2.y - p1.y)
          }
        }
        // Fallback – nearest point
        let nearest = drawingPath[0]
        let minDist = Math.abs(nearest.x - xTarget)
        for (const p of drawingPath) {
          const d = Math.abs(p.x - xTarget)
          if (d < minDist) {
            nearest = p
            minDist = d
          }
        }
        return nearest.y
      }

      const notes: NoteInfo<any>[] = []

      let lastPitch: number | undefined
      let currentNote: NoteInfo<any> | undefined

      for (let i = 0; i < numNotes; i++) {
        const notePos = startPos + i * sixteenth
        const frac = (notePos - startPos) / totalBeats
        const targetX = minX + frac * (maxX - minX)
        const yVal = getYforX(targetX)

        const normY = (yVal - minY) / (maxY - minY || 1)
        const rawPitch = minPitch + (1 - normY) * (maxPitch - minPitch)
        const pitch = snapPitchToScale(Math.round(rawPitch))

        if (pitch === lastPitch && currentNote) {
          currentNote.duration += sixteenth
        } else {
          currentNote = { pitch, position: notePos, duration: sixteenth, velocity: 0.8 }
          notes.push(currentNote)
          lastPitch = pitch
        }
      }

      // Update piano roll display
      pianoRoll.setNoteData(notes)

      // Clear path so it stops rendering
      drawingPath = []
    }

    // ----------  Bind mouse events via helper utilities ----------
    let isDrawing = false

    mousedownEvent(ev => {
      const p5xy = targetToP5Coords(ev, p5i, threeCanvas)
      drawingPath = [p5xy]
      isDrawing = true
    }, threeCanvas)

    mousedragEvent(ev => {
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
        if (drawingPath.length > 1) {
          p.push()
          p.noFill()
          p.stroke(255, 0, 0)
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