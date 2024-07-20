<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, now, sin } from '@/channels/channels';
import { quotes } from './quotes';
import { lerp } from 'three/src/math/MathUtils.js';

const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

function logisticSigmoid(x: number, sharpness: number): number {
  // n.b.: this Logistic Sigmoid has been normalized.
  let a = sharpness;
  const epsilon = 0.0001;
  const minParamA = 0.0 + epsilon;
  const maxParamA = 1.0 - epsilon;
  a = Math.max(minParamA, Math.min(maxParamA, a));
  a = (1.0 / (1.0 - a) - 1.0);
  const A = 1.0 / (1.0 + Math.exp(0.0 - (x - 0.5) * a * 2.0));
  const B = 1.0 / (1.0 + Math.exp(a));
  const C = 1.0 / (1.0 + Math.exp(0.0 - a));
  return (A - B) / (C - B);
}


const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

const randQuoteInd = () => Math.floor(Math.random() * quotes.length)
const quoteIndStack = [randQuoteInd()]
let currentInd = quoteIndStack[0]
let nextInd = randQuoteInd()

const normedCirclePts = (numPts: number) => {
  const pts = []
  for (let i = 0; i < numPts; i++) {
    const angle = i * 2 * Math.PI / numPts
    pts.push({ x: Math.cos(angle), y: Math.sin(angle) })
  }
  return pts
}

//at blowup == 0, the text is written normally - at 1, the letters are positioned along a circle
let drawQuoteCard = (p: p5, quoteInd: number, blowup: number) => {
  const center = { x: p.windowWidth / 2, y: p.windowHeight / 2 }
  const maxDim = Math.max(p.windowWidth, p.windowHeight)
  const maxDimCenter = maxDim/2
  const minDim = Math.min(p.windowWidth, p.windowHeight)
  const minDimCenter = minDim/2

  p.textFont('monospace')
  p.textSize(30)
  const quote = quotes[quoteInd]
  const numChars =quote.length
  let textWidth = p.textWidth(quote)
  while (textWidth > maxDim) {
    p.textSize(p.textSize() * 0.9)
    textWidth = p.textWidth(quote)
  }
  const charWidth = textWidth / numChars
  const rad = 700
  const circlePts = normedCirclePts(numChars).map(pt => ({ x: pt.x * rad, y: pt.y * rad })).map(pt => ({ x: pt.x + center.x, y: pt.y + center.y }))
  const charPts = circlePts.map((pt, i) => ({ x: center.x - textWidth/2 + charWidth * i, y: center.y }))
  const lerpCharPts = charPts.map((pt, i) => ({ x: lerp(pt.x, circlePts[i].x, blowup), y: lerp(pt.y, circlePts[i].y, blowup) }))

  p.push()
  if (p.windowHeight > p.windowWidth) {
    p.translate(center.x, center.y)
    p.rotate(Math.PI/2)
    p.translate(-center.x, -center.y)
  }
  p.fill(255)
  lerpCharPts.forEach((pt, i) => {
    p.text(quote[i], pt.x, pt.y)
  })
}

let blowup = 0
const rampTime = 2
let transitionRamp = new Ramp(rampTime)
let quoteCycleRamp: Ramp | undefined = undefined
const nextQuote = () => {
  if(quoteCycleRamp && quoteCycleRamp.val() < 1) {
    quoteCycleRamp?.onFinish?.()
    quoteCycleRamp?.cancel()
    console.log("qqq interupted transition")
  }
  
  transitionRamp = new Ramp(rampTime)
  transitionRamp.trigger()
  quoteCycleRamp = new Ramp(rampTime/2)
  quoteCycleRamp.onFinish = () => {
    currentInd = nextInd
    nextInd = randQuoteInd()
    console.log("qqq next quote")
  }
  quoteCycleRamp.trigger()
}

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?

      

      
      appState.drawFunctions.push((p: p5) => {
        // console.log("drawing circles", appState.circles.list.length)
        // drawQuoteCard(p, currentInd, logisticSigmoid(sinN(now()*0.2), 0.1))
        blowup = transitionRamp.val()
        const blowupTri = tri(blowup)
        drawQuoteCard(p, currentInd, blowupTri**2)
      })

      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      document.body.onclick = () => {
        console.log("clicked")
        nextQuote()
      }

      document.body.style.backgroundColor = "black"

      shaderGraphEndNode = canvasPaint
      // appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
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
  <div></div>
  <div>
    <!-- <button @click="nextQuote">Next Quote</button> -->
  </div>
</template>

<style scoped></style>