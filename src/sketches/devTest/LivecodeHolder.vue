<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type DevelopmentAppState } from './developmentAppState';
import p5 from 'p5';
import * as THREE from 'three'
import { inject, onMounted, onUnmounted, ref } from 'vue';
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
import studio from '@theatre/studio'
import { getProject, types } from '@theatre/core';
import { anim0 } from './animations'
import { getAnimPos } from '@/animation/beziers'


const p = getAnimPos("aa", 0.5, anim0.sheetsById['sheet 1'].sequence)

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


onMounted(() => {
  try {
    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById("threeCanvas")!!
    three5i = new Three5(1280, 720)


    if (appState.p5Instance && appState.regions.list.length > 0) {


      const code = () => {
        reset()


        const circleDef = {
          x: 0.5,
          y: 0.5,
        }

        const circleDef2 = {
          x: 0.5,
          y: 0.5,
        }

        appState.drawFunctions.push(() => {
          p5i!!.fill(255, 0, 0)
          p5i!!.circle(circleDef.x * p5i!!.width, circleDef.y * p5i!!.height, 100)

          p5i!!.fill(0, 255, 0)
          p5i!!.circle(circleDef2.x * p5i!!.width, circleDef2.y * p5i!!.height, 100)
        })

        studio.initialize()

        const project = getProject('animation test')
        const sheet = project.sheet('sheet 1')

        const circleAnimObj = sheet.object('firstCircle', {
          x: types.number(circleDef.x, { range: [0, 1] }),
          y: types.number(circleDef.y, { range: [0, 1] }),
          zoom: types.number(0.01, { range: [0, 0.2] }),
        })

        const circleAnimObj2 = sheet.object('secondCircle', {
          x: types.number(circleDef2.x, { range: [0, 1] }),
          y: types.number(circleDef2.y, { range: [0, 1] }),
        })

        const fdbkZoom = new FeedbackZoom({ src: p5Canvas })

        //@ts-ignore
        window.writeSaveFile = () => {
          const saveFile = studio.createContentOfSaveFile('animation test')
          const saveFileStr = JSON.stringify(saveFile)
          console.log("saveFileStr", saveFileStr)
          const blob = new Blob([saveFileStr], { type: 'text/plain;charset=utf-8' })

          //download file with filename animations_timestamp
          const a = document.createElement('a')
          a.download = `animations_${Date.now()}.json`
          a.href = URL.createObjectURL(blob)
          a.click()
          a.remove()
        }

        // setInterval(() => {
        //   sheet.sequence.position = Math.random() * 10
        // }, 1000)

        // window.saveAnimation = () => {
        //   studio.createContentOfSaveFile()
        // }

        circleAnimObj.onValuesChange(({ x, y, zoom }) => {
          // console.log("updating circle", x, y, zoom)
          circleDef.x = x
          circleDef.y = y
          fdbkZoom.setUniforms({ zoom })
        })

        circleAnimObj2.onValuesChange(({ x, y }) => {
          // console.log("updating circle2", x, y)
          circleDef2.x = x
          circleDef2.y = y
        })




        


        // const wobble = new Wobble({ src: three5i!!.output.texture })
        // wobble.setUniforms({xStrength: 0.01, yStrength: 0.01})
        const passthru = new Passthru({ src: fdbkZoom})
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
const uiObj0 = {
  cat: "cat",
  someNum: 5,
  someBool: true,
  obj1: {
    someNum: 5,
    someStr: "str",
    moaObj: {
      str2: "a"
    }
  }
}

const uiObj1 = {
  cat: "cat2",
  someNum: 50,
  someBool: true,
  diffProp: "diff",
  obj1: {
    someNum: 5,
    someStr: "str",
    moaObj: {
      str2: "aaaaa"
    }
  }
}

//todo api - figure out how to dynamically switch stuff out sent to the AutoUI component
let uiObj: any = uiObj0

let uiObjRef = ref(uiObj)
let index = 0
setInterval(() => {
  // console.log("setting uiObjRef")
  uiObjRef.value = index++ % 2 === 0 ? uiObj0 : uiObj1
}, 5000)

</script>

<template>
  <div></div>
  <Teleport to="#teleportTarget">
    <AutoUI :object-to-edit="uiObjRef"/>
  </Teleport>
</template>

<style scoped></style>