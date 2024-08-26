<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, now } from '@/channels/channels';
import { lerp } from 'three/src/math/MathUtils.js';

const appState = inject<TemplateAppState>(appStateName)!!
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

function stripedLine(p5: p5, x1: number, y1: number, x2: number, y2: number, width: number, numStripes: number, flip: boolean, range = 0.5) {
  p5.push()
  // for (let i = 0; i < numStripes; i++) {
  //   const f = flip ? 1 : 0
  //   const s = i % 2 == f ? 255 : 0
  //   p5.stroke(s)
  //   p5.strokeWeight(width*numStripes-i*width)
  //   p5.line(x1, y1, x2, y2)
  // }

  for (let i = 0; i < numStripes; i++) {
    const f = flip ? 1 : 0
    const s = i % 2 == f ? 255 : 0

    p5.stroke(s)
    p5.strokeWeight(width)
    if(x1 == x2) { //vertical line
      const mid = (y1 + y2)/2
      const y1r = lerp(y1, mid, range)
      const y2r = lerp(y2, mid, range)
      p5.line(x1 + i*width, y1r, x2 + i*width, y2r)
      p5.line(x1 - i*width, y1r, x2 - i*width, y2r)
    } else { //horizontal line
      const mid = (x1 + x2)/2
      const x1r = lerp(x1, mid, range)
      const x2r = lerp(x2, mid, range)
      p5.line(x1r, y1 + i*width, x2r, y2 + i*width)
      p5.line(x1r, y1 - i*width, x2r, y2 - i*width)
    }
  }

  p5.pop()
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

    const lines: { dim: "x" | "y", period: number, coord: number, width: number, flip: boolean, numStripes: number, range: number }[] = []
    const numLines = 10
    for (let i = 0; i < numLines; i++) {
      const rnd = Math.random()
      const rnd2 = Math.random()
      lines.push({ 
        dim: rnd < 0.5 ? "x" : "y", 
        period: 0.2 + Math.random()**2 * 4, 
        coord: rnd2 * (rnd < 0.5 ? p5i.width : p5i.height), 
        width: 2 + Math.random() * 50, 
        numStripes: 10,
        flip: false,
        range: 1 
      })
    }

    const runRamp = (ramp: Ramp, cb: (prog: number) => void) => {
      return launchLoop(async (ctx) => {
        while(ramp.val() < 1) {
          cb(ramp.val())
          await ctx.waitFrame()
        }
      })
    }

    const lineRamps: Map<number, {ramp: Ramp, proxy: CancelablePromisePoxy<any>}> = new Map()
    const toggleRamp = (i: number) => {
      if(lineRamps.has(i)) {
        lineRamps.get(i)!!.ramp.cancel()
        lineRamps.get(i)!!.proxy.cancel()
        lineRamps.delete(i)
      } 
      const ramp = new Ramp(1)
      ramp.trigger()
      const loop = runRamp(ramp, (prog) => {
        if(lines[i].flip) {
          lines[i].range = 1 - prog
        } else {
          lines[i].range = prog
        }
      })
      lineRamps.set(i, {ramp, proxy: loop})
    }

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?
      
      const distance = (a: {x: number, y: number}, b: {x: number, y: number}) => Math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2)
      const midpointWalkerPt = {x: p5i.width/2, y: p5i.height/2}
      let midpointIndex = 0
      const moveToMidpoint = (midpoints: {x: number, y: number}[]) => {
        const moveAmt = 10
        if(distance(midpointWalkerPt, midpoints[midpointIndex]) < moveAmt) {
          lines[midpointIndex].flip = !lines[midpointIndex].flip
          lines[midpointIndex].numStripes = Math.floor(Math.random() * 9) + 2
          toggleRamp(midpointIndex)
          midpointIndex = (midpointIndex + 1) % midpoints.length
        }
        const target = midpoints[midpointIndex]
        const dir = {x: target.x - midpointWalkerPt.x, y: target.y - midpointWalkerPt.y}
        const dist = distance(midpointWalkerPt, target)
        midpointWalkerPt.x += dir.x / dist * moveAmt
        midpointWalkerPt.y += dir.y / dist * moveAmt
      }
      
      appState.drawFunctions.push((p: p5) => {
        // p.stroke(255)
        // lines.forEach(({ dim, period, coord, width }) => {
        //   const c = coord + Math.sin(now() * period) * width
        //   p.strokeWeight(0.2 + sinN(now() * period/50) * 10)
        //   if (dim === "x") {
        //     p.line(c, 0, c, p.height)
        //   } else {
        //     p.line(0, c, p.width, c)
        //   }
        // })
        p.push()
        p.noStroke()
        p.fill(30, 70, 100)
        p.rect(0, 0, p.width, p.height)
        p.pop()

        const midpoints: {x: number, y: number}[] = []
        lines.forEach(({ dim, period, coord, width, numStripes, flip, range }) => {
          const c = coord + Math.sin(now() * period) * width
          const stripeWidth = 2 + sinN(now() / 10 * period) * 4
          if (dim === "x") {
            stripedLine(p, c, 0, c, p.height, stripeWidth, numStripes, flip, range)
            midpoints.push({x:c, y: p.height/2})
          } else {
            stripedLine(p, 0, c, p.width, c, stripeWidth, numStripes, flip, range)
            midpoints.push({x: p.width/2, y: c})
          }
        })

        moveToMidpoint(midpoints)
        p.push()
        p.noStroke()
        p.fill(255, 0, 0)
        p.circle(midpointWalkerPt.x, midpointWalkerPt.y, 30)
        p.pop()


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
  <div></div>
</template>

<style scoped></style>