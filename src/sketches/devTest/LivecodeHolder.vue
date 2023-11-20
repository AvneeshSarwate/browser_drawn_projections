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
import AutoUI from '@/components/AutoUI.vue';

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
        const canvasPaint = new CanvasPaint({ src: passthru }) 
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
const uiObj = {
  cat: "cat",
  someNum: 5,
  someBool: true,
  obj: {
    someNum: 5,
    someStr: "str"
  }
}

</script>

<template>
  <div></div>
  <Teleport to="#teleportTarget">
    <AutoUI :object-to-edit="uiObj"/>
  </Teleport>
</template>

<style scoped></style>