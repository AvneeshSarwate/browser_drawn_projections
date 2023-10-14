<script setup lang="ts">
import { Region, type AppState } from '@/stores/stores';
import p5 from 'p5';
import { inject, onMounted, onUnmounted } from 'vue';
import * as a from '@/rendering/planeAnimations'
import { groupedAnimation0 } from '@/rendering/modularizedTransforms';
import { testCancel, xyZip, sin, cos, EventChop } from '@/channels/channels';
import { CanvasPaint, type ShaderEffect } from '@/rendering/rendering';
import { MediaAudioAnalyzer } from '@/rendering/VideoAudioAnalyzer';
import WaveSurfer from 'wavesurfer.js'
import { FeedbackZoom, Wobble } from '@/rendering/CustomFX';


const appState = inject('appState') as AppState  

const tc = testCancel

const reg = (i: number) => appState.regions.list[i] 

const cornerPts = (reg: Region, p5: p5) => {
  reg.points.list.forEach(p => {
    p5.circle(p.x, p.y, 10)
  })
}

const norm  = ({x, y}: {x: number, y: number}) => ({x: x * appState.p5Instance!!.width, y: y * appState.p5Instance!!.height})

const aseq = (animations: a.AnimationSegment[]) => {
  return new a.AnimationSeq(animations)
}

let shaderGraphEndNode: ShaderEffect | undefined = undefined

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
//   url: '/block_rocking.mp3',
// })
// document.querySelector('#wavesurferPlay')?.addEventListener('click', () => {
//   console.log('play/pause')
//   wavesurfer.playPause()
// })

// const waveAudioBands = new MediaAudioAnalyzer(wavesurfer.getMediaElement() as HTMLVideoElement)


onMounted(() => {
  try {
    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    if (appState.p5Instance && appState.regions.list.length > 0) {


      const code = () => {
        reset()
        reg(0).activate().debug = true
        reg(1).activate()
        // // reg(0).draw2 = cornerPts


        // //todo API - streamline assinging stateful animations to regions (avoid specifying index twice)
        // //need some api for these so you don't have to specify
        // //the region index twice (once on creation and once on assignment)
        // const dots = new a.PerimiterDots(reg(0), 10).anim(2.52)
        // reg(0).animationSeq = aseq([dots, rl, lr])

        //modularize creation of a sequence into a function in a DIFFERENT FILE - module can be livecoded
        groupedAnimation0(appState, reg(1)) 

        " " //a way to add "spacing" when reading eval'd code

        // testCancel()


        const ec = new EventChop<{x: number}>()


        //todo API - create cleaner way to set up mouse/keyboard mappings on p5 sketch
        const r = Math.random()
        document.getElementById("threeCanvas")!!.onmousedown = () => {
          ec.ramp(1, { x:  p5i.mouseX})
          console.log("mouse down")
        }

        const chopDraw = (p5: p5) => {
          ec.samples().forEach((s) => {
            p5.push()
            p5.fill(255,0,0)
            p5.circle(s.x, s.val * 700, 130)
            p5.pop()
            // console.log("chop draw", s.val, r)
          })
        }
        appState.drawFunctions.push(chopDraw)

        /**
         * todo API - need to streamline api for patterns - goal is to be able
         * to very quickly livecode different x/y streams to change
         * instancing behavior of dots
         * 
         * idea - "patterns" are just functions that take a phase value
         *        in [0, 1] and return an output [0, 1]
         * 
         * lets you easily create variations cyclic patterns
         */
        
        const patternDraw = (p5: p5) => {
          const sin2 = (p: number) => sin(p*2.5)
          xyZip(Date.now() / 10000, sin2, cos, 20).forEach((pt) => {
            p5.circle(norm(pt).x, norm(pt).y, 30)
          })
        }
        appState.drawFunctions.push(patternDraw)
        // console.log("code ran")

        // vidAudioBands.drawCallback = (low, mid, high) => {
        //   p5i.push()
        //   p5i.fill(255, 0, 0)
        //   p5i.rect(300, 0, low * 300, 100)
        //   p5i.rect(300, 100, mid * 300, 100)
        //   p5i.rect(300, 200, high * 300, 100)
        //   p5i.pop()
        // }
        // appState.drawFunctions.push(() => vidAudioBands.draw())

        // waveAudioBands.drawCallback = (low, mid, high) => {
        //   p5i.push()
        //   p5i.fill(0, 255, 0)
        //   p5i.rect(600, 0, low * 300, 100)
        //   p5i.rect(600, 100, mid * 300, 100)
        //   p5i.rect(600, 200, high * 300, 100)
        //   p5i.pop()
        // }
        // appState.drawFunctions.push(() => waveAudioBands.draw())


        //todo api - p5 draw functions called AFTER shader draw don't show up in the shader - fix or warn about this
        const fdbkZoom = new FeedbackZoom({ src: p5Canvas })
        // const wobble = new Wobble({ src: p5Canvas })
        // wobble.setUniforms({xStrength: 0.01, yStrength: 0.01})
        const canvasPaint = new CanvasPaint({ src: fdbkZoom })
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


@/stores/undoCommands