<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { appStateName, type ClickAVAppState, engineRef } from './appState';
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue';
import { CanvasPaint, CustomShaderEffect, FeedbackNode, PassthruEffect, type ShaderEffect } from '@/rendering/shaderFXBabylon';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, targetNormalizedCoords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, EventChop, cos, sin } from '@/channels/channels';
import { listToClip, clipToDeltas, note } from '@/music/clipPlayback';
import { Scale } from '@/music/scale';
import { sampler } from '@/music/synths';
import * as BABYLON from 'babylonjs';
import { VerticalBlurEffect } from '@/rendering/postFX/verticalBlur.frag.generated';
import { HorizontalBlurEffect } from '@/rendering/postFX/horizontalBlur.frag.generated';
import { LayerBlendEffect } from '@/rendering/postFX/layerBlend.frag.generated';
import { TransformEffect } from '@/rendering/postFX/transform.frag.generated';
import { BloomEffect } from '@/rendering/postFX/bloom.frag.generated';

const appState = inject<ClickAVAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []
let engineWatcher: WatchStopHandle | undefined

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions.length = 0
  appState.drawFuncMap.clear()
}

const setupSketch = (engine: BABYLON.WebGPUEngine) => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    // Debug: Check canvas state
    console.log('setupSketch called')

    const scale = new Scale(undefined, 24)


    const baseDur = 0.125 / 2
    const baseSeq = [1, 3, 5, 6, 8, 10, 12]
    const circle0 = xyZip(0, cos, sin, baseSeq.length)
    const rad = 50


    const code = () => {

      const mousePos = { x: 0, y: 0 }

      // Debug: Simple event logging
      threeCanvas.addEventListener('mousedown', (e) => {
        console.log('mousedown fired on threeCanvas')
      }, { capture: true })

      mousemoveEvent(ev => {
        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        mousePos.x = p5xy.x
        mousePos.y = p5xy.y
      }, threeCanvas)

      // sketchTodo - set this after shader passes somehow
      // appState.drawFunctions.push((p: p5) => {
      //   p.push()
      //   p.strokeWeight(2)
      //   p.stroke(255, 255, 255)
      //   p.line(mousePos.x, 0, mousePos.x, p.height)
      //   p.line(0, mousePos.y, p.width, mousePos.y)
      //   p.pop()
      // })

      const loopMap = new Map<string, CancelablePromisePoxy<any>>()
      const loopIdStack = [] as string[]

      mousedownEvent(ev => {
        console.log('mousedownEvent callback fired!', ev.type, ev.target)

        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        const normCoords = targetNormalizedCoords(ev, ev.target as HTMLCanvasElement)
        
        const transposition = Math.floor((1-normCoords.y) * 36)
        console.log("transposition", transposition)
        const seq = baseSeq.map(x => x + transposition)
        const evtDur = baseDur * Math.pow(2, (1-normCoords.x) * 4)

        const pitches = scale.getMultiple(seq)
        console.log("pitches", pitches)
        const mel = listToClip(pitches, evtDur)

        const evtChop = new EventChop<{ r: number, g: number, b: number, x: number, y: number }>
        const durs = clipToDeltas(mel)
        console.log("durs", durs)
        const drawFuncId = crypto.randomUUID()
        loopIdStack.push(drawFuncId)
        appState.drawFuncMap.set(drawFuncId, () => {

          // sketchTodo - set this after shader passes somehow
          // p5i.push()
          // p5i.strokeWeight(1)
          // p5i.stroke(255, 255, 255)
          // p5i.noFill()
          // p5i.circle(p5xy.x, p5xy.y, 10)
          // p5i.pop()

          evtChop.events.forEach(evt => {
            const { r, g, b, x, y } = evt.metadata
            p5i.push()
            p5i.noStroke()
            p5i.fill(r * 255, g * 255, b * 255)
            p5i.circle(x, y, 40 * (1 - evt.evt.val()))
            p5i.pop()
          })
        })

        const r = () => Math.random()


        const loop = launchLoop(async ctx => {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            for (let i = 0; i < mel.length; i++) {
              const dur = durs[i]
              await ctx.waitSec(dur)
              const x = circle0[i].x * rad + p5xy.x
              const y = circle0[i].y * rad + p5xy.y
              const evtData = { r: p5xy.x / p5i.width, g: p5xy.y / p5i.height, b: r(), x, y }
              evtChop.ramp(evtDur * 4, evtData)
              const { pitch, duration, velocity } = mel[i]
              note(sampler, pitch, duration, velocity)
              // console.log("playing note", (Date.now() / 1000).toFixed(2), evtData)
            }
            await ctx.waitSec(evtDur)
          }
        })

        loopMap.set(drawFuncId, loop)

      }, threeCanvas)

      const width = p5i.width
      const height = p5i.height

      const debug = false

      const p5Passthru = new PassthruEffect(engine, { src: p5Canvas }, width, height, 'nearest')
      let chainEnd: CustomShaderEffect<any> | null = null;
      if (debug) {
        chainEnd = p5Passthru
      } else {
        const feedback = new FeedbackNode(engine, p5Passthru, width, height, 'linear', 'half_float')
        const vertBlur = new VerticalBlurEffect(engine, { src: feedback }, width, height)
        const horBlur = new HorizontalBlurEffect(engine, { src: vertBlur }, width, height)
        const transform = new TransformEffect(engine, { src: horBlur }, width, height)
        const layerOverlay = new LayerBlendEffect(engine, { src1: p5Passthru, src2: transform }, width, height)
        const bloom = new BloomEffect(engine, { src: layerOverlay, base: layerOverlay }, width, height)
        chainEnd = bloom

        feedback.setFeedbackSrc(bloom)
      
        transform.setUniforms({ rotate: 0, anchor: [0.5, 0.5], translate: [0, 0], scale: [0.995, 0.995] })
        vertBlur.setUniforms({ pixels: 2, resolution: height })
        horBlur.setUniforms({ pixels: 2, resolution: width })
      }



      const canvasPaint = new CanvasPaint(engine, { src: chainEnd }, width, height)
      shaderGraphEndNode = canvasPaint
      
      // Debug: Check engine and canvas setup
      console.log('Engine canvas:', engine.getRenderingCanvas()?.id)
      console.log('Expected threeCanvas id:', threeCanvas?.id)
      console.log('p5Canvas:', p5Canvas)
      console.log('shaderGraphEndNode:', shaderGraphEndNode)
      
      // Keep the old approach as backup (but don't call it)
      appState.shaderDrawFunc = () => {
        engine.beginFrame()
        shaderGraphEndNode!.renderAll(engine as any)
        engine.endFrame()
        // console.log('shaderDrawFunc called (backup)')
      }

      singleKeydownEvent('u', (ev) => {
        const lastId = loopIdStack.pop()
        if (lastId) {
          const lastLoop = loopMap.get(lastId)
          if (lastLoop) {
            lastLoop.cancel()
            appState.drawFuncMap.delete(lastId)
          }
        }
      })

      singleKeydownEvent('c', (ev) => {
        //iterate over keys in loopMap and cancel each
        for(const [key, loop] of loopMap.entries()) {
          loop.cancel()
          appState.drawFuncMap.delete(key)
        }
      })
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    
    code()
  } catch (e) {
    console.warn(e)
  }
}

onMounted(() => {
  const engine = engineRef.value
  if (engine) {
    setupSketch(engine)
  } else {
    engineWatcher = watch(
      engineRef,
      (engineValue) => {
        if (engineValue) {
          engineWatcher?.()
          engineWatcher = undefined
          setupSketch(engineValue)
        }
      },
      { immediate: true }
    )
  }
})



onUnmounted(() => {
  engineWatcher?.()
  engineWatcher = undefined
  clearDrawFuncs()
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  shaderGraphEndNode = undefined
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
  timeLoops = []
  appState.shaderDrawFunc = undefined
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>
