<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type DevelopmentAppState } from './developmentAppState';
import p5 from 'p5';
import * as THREE from 'three'
import { inject, onMounted, onUnmounted } from 'vue';
import * as a from './planeAnimations'
import { groupedAnimation0 } from './modularizedTransforms';
import { xyZip, sinN, cosN, EventChop, steps, now, launch, Ramp, sin, cos } from '@/channels/channels';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { MediaAudioAnalyzer } from '@/rendering/VideoAudioAnalyzer';
import WaveSurfer from 'wavesurfer.js'
import { FeedbackZoom, Wobble } from '@/rendering/customFX';
import { midiInputs } from '@/io/midi';
import { Three5 } from '@/rendering/three5';
import { FPS } from '@/rendering/fps';
import { LineStyle } from '@/rendering/three5Style';
import { Scale } from '@/music/scale';
import { clipToDeltas, listToClip, note } from '@/music/clipPlayback';
import { sampler } from '@/music/synths';
import { clearListeners, mousedownEvent, targetToP5Coords } from '@/io/keyboardAndMouse';

const fps = new FPS()

const appState = inject<DevelopmentAppState>('appState')!!

const reg = (i: number) => appState.regions.list[i] 

const norm  = ({x, y}: {x: number, y: number}) => ({x: x * appState.p5Instance!!.width, y: y * appState.p5Instance!!.height})

const aseq = (animations: a.AnimationSegment[]) => {
  return new a.AnimationSeq(animations)
}

let shaderGraphEndNode: ShaderEffect | undefined = undefined

let three5i: Three5 | undefined = undefined

const reset = () => {
  appState.regions.list.forEach(r => {
    r.resetDrawState()

    /**
     * todo deep design - should there even be any "persistent state" at all wrt animations, or should all 
     *        behaviors be specified via "pure" function calls in a draw callback?
     *        probably want some retained state, but have to be conginzant about
     *        keeping the "visibile code <=> running animation state" invariant true.
     *        It is trivially true on page load, but can be violated by livecoding, 
     *        so need to think about what the "persistent" objects are and maybe have
     *        some formal opt-in/out auto-reset functionality for all of them
     */
    r.animationSeq = undefined
  })
  appState.drawFunctions = []
}

//todo hotreload - figure out how to initialize MeadiaAudioAnalyzers in a hot-reloadable way
// const vidAudioBands = new MediaAudioAnalyzer(document.getElementById("video") as HTMLVideoElement)

// const wavesurfer = WaveSurfer.create({
//   container: '#wavesurferHolder',
//   waveColor: '#4F4A85',
//   progressColor: '#383351',
//   url: 'block_rocking.mp3',
// })
// document.querySelector('#wavesurferPlay')?.addEventListener('click', () => {
//   console.log('play/pause')
//   wavesurfer.playPause()
// })

// const waveAudioBands = new MediaAudioAnalyzer(wavesurfer.getMediaElement() as HTMLVideoElement)


let scale = new Scale()
//@ts-ignore
window.scaleInst = new Scale()

let neg1 = scale.getByIndex(-1)
let negOct = scale.getByIndex(-8)

let x = 5

let vec2 = (x: number, y: number | undefined) => 5
let vec3 = (x: number, y: number | undefined, z: number | undefined) => 5 
let gl_fragCoord = vec2(0, 0)

const shaderFunc = () => {
  gl_fragCoord = vec2(0, 0) + 5 * vec2(1, 1) 
}

console.log("shaderFunc", shaderFunc.toString())


onMounted(() => {
  try {
    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById("threeCanvas")!!
    three5i = new Three5(1280, 720)


    if (appState.p5Instance && appState.regions.list.length > 0) {

      const scale = new Scale()
      

      const evtDur = 0.125
      const mel = listToClip(scale.getMultiple([1, 3, 5, 6, 8, 10, 12]), evtDur)
      const circle0 = xyZip(0, cos, sin, mel.length)
      const rad = 50


      const code = () => {
        reset()


        mousedownEvent(ev => {

          const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
          const evtChop = new EventChop<{ r: number, g: number, b: number, x: number, y: number }>
          const durs = clipToDeltas(mel)
          console.log("durs", durs)
          const drawFuncId = crypto.randomUUID()
          appState.drawFuncMap.set(drawFuncId, () => {
            evtChop.events.forEach(evt => {
              const { r, g, b, x, y } = evt.metadata
              p5i.push()
              p5i.fill(r * 255, g * 255, b * 255)
              p5i.circle(x, y, 40 * (1 - evt.evt.val()))
              p5i.pop()
            })
          })

          const r = () => Math.random()
          
          
          launch(async ctx => {
            for (let i = 0; i < mel.length; i++) {
              const dur = durs[i]
              await ctx.wait(dur)
              const x = circle0[i].x * rad + p5xy.x
              const y = circle0[i].y * rad + p5xy.y
              const evtData = { r: p5xy.x/p5i.width, g: p5xy.y/p5i.height, b: r(), x, y }
              evtChop.ramp(evtDur*4, evtData)
              const { pitch, duration, velocity } = mel[i]
              note(sampler, pitch, duration, velocity)
              console.log("playing note", (Date.now()/1000).toFixed(2), evtData)
            }
            await ctx.wait(evtDur*4)
            appState.drawFuncMap.delete(drawFuncId)
          })
        }, threeCanvas)



        //todo api - p5 draw functions called AFTER shader draw don't show up in the shader - fix or warn about this
        // const fdbkZoom = new FeedbackZoom({ src: p5Canvas })
        // const wobble = new Wobble({ src: three5i!!.output.texture })
        // wobble.setUniforms({xStrength: 0.01, yStrength: 0.01})
        const passthru = new Passthru({ src: p5Canvas})
        const canvasPaint = new CanvasPaint({ src: passthru }) //todo bug - feeding a canvas as a source doesn't update properly
        appState.drawFunctions.push(() => canvasPaint.renderAll(appState.threeRenderer!!))

        shaderGraphEndNode = canvasPaint
      }


      //can access this from browser console as well to rerun code
      appState.codeStack.push(code)
      code()

      // const codeStr = code.toString()
      // const decodeAndRun = () => {
      //   eval(codeStr)()
      //   console.log("decoding code", codeStr)
      // }
      // setTimeout(decodeAndRun, 2000)
    }
  } catch (e) {
    console.log(e)
  }

})



onUnmounted(() => {
  /*todo hotreload - use similar pattern to shaderGraphEndNode?.disposeAll() for hotreloading time loops?
  can wrap launch() function in something that registers loops to a global store, 
  so you don't have to make hotreload support part of the implementation of the loop itself
  */
  console.log("disposing fx")
  shaderGraphEndNode?.disposeAll()
  three5i?.dispose()
  clearListeners()
  fps.remove()
})

/*
more ideas
- todo wishlist - make "blocks" of code undoable?
 - would involve making property assignments automatically undoable, or
   having a cleaner api for assigning undoable properties
   (maybe just setters for props that need undo, with a _ suffix indicating undiability)
- have undo-tree instead of undo stack and then automatic tree walking sequencers
- can call some disableAll() function at the start of your script that turns off all regions 
  so that you can know that your script defines "everything" on the screen
- can have other types of "drawable objects" that you livecode as well, instead of just 
  "plane-animations" (eg, like gesture loops)
- if you can save and recall scripts, they can be like "scenes" - 
  if you really want, can even snapshot a thumbnail and have a scene selector UI


- todo wishlist create a "modal drawing" interface with mouse and keyboard - different keys for different
  drawing modes, and also a way to record loops of drawing and play them back
  - also be able to save and load these loops to file, create transformed instances of them
    - go back to "delta list" format for saving gestures to enable this

- create the equivalent of CHOPs to provide data sources for animations
  - need to think about rethink the API for animation segments
    - abstractions shouldn't be too deep for newcomers to author their own 
    - need to be able to bind more generally to any kind of "drawable object"
      - or at least, need to provide type-safety so you can't bind to the wrong thing
  - figure out how to bind chops to fx parameters
  - figure out how to bind chops to live inputs (mouse, keyboard, midi, etc)
  - create equivalents for event-chop and timer chop

- think about an API for transport controls
  - play, pause, stop, loop, etc
  - also, how to bind to these from chops
  - also, how to bind to these from live inputs (mouse, keyboard, midi, etc)
  - Use tone.js transport?

- incorporate theater.js for timelining things?

- port over Kotlin structured-timing-loops API into typescript
  - use tone.js transport for reference timing
  - implement branch() and wait() functions 

- look into using advanced typescript types to provide more robust way to access
  channel names for things like event chop where you can have arbitrary metadata

- practical steps
  - make animations triggerable
    - do this by having animations run off of an event chop?
      - have animations take an array of phase values instead of a single one, and
        run their animation for each val - makes them auto-instancing  
  - don't actuall need a pattern CHOP, just need pattern generating functions
    with good API/defaults, driven by a phase value

*/

</script>

<template>
  <div></div>
</template>

<style scoped></style>