<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type SegMo0State, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, keydownEvent, mouseupEvent, keyupEvent } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, type LoopHandle, now } from '@/channels/channels';
import { choice } from '@/utils/utils';
import { clamp, lerp } from 'three/src/math/MathUtils.js';

const appState = inject<SegMo0State>(appStateName)!!
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

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    type Runner = {
      x: number, 
      y: number, 
      rad: number, 
      radGrowSnapshot: number, 
      turnPoints: { x: number, y: number, time: number }[], 
      trailColor: { r: number, g: number, b: number },
      turnWait: number,
      direction: { x: number, y: number }
    }
    const runners = new Map<string, Runner>()
    type RunnerMap = Map<string, Runner>

    //@ts-ignore
    window.appState = runners

    const getWindowedTrailPoints = (runner: Runner, lookbackTime: number) => {
      const windowedTrailPoints: {x: number, y: number, time: number}[] = []
      for(let i = runner.turnPoints.length - 1; i >= 0; i--) {
        if(now() - runner.turnPoints[i].time < lookbackTime) {
          windowedTrailPoints.push(runner.turnPoints[i])
        } else {
          break
        }
      }
      windowedTrailPoints.reverse()
      return windowedTrailPoints
    }

    const doSegmentsIntersect = (s1: {x1: number, y1: number, x2: number, y2: number}, s2: {x1: number, y1: number, x2: number, y2: number}) => {
      const det = (a: number, b: number, c: number, d: number) => a * d - b * c
      const s = { x: s1.x2 - s1.x1, y: s1.y2 - s1.y1 }
      const t = { x: s2.x2 - s2.x1, y: s2.y2 - s2.y1 }
      const denom = det(s.x, -t.x, s.y, -t.y)
      if(denom == 0) {
        return false
      }
      const t1 = det(s2.x1 - s1.x1, -t.x, s2.y1 - s1.y1, -t.y) / denom
      const t2 = det(s2.x1 - s1.x1, s.x, s2.y1 - s1.y1, s.y) / denom
      return t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1
    }

    //todo sketch bug - still some kind of issue with the intersection detection and deletion
    const doRunnersIntersect = (headRunner: Runner, trailRunner: Runner, lookbackTime: number) => {
      if(headRunner.turnPoints.length < 1) {
        debugger
      }
      const headSegment = { x1: headRunner.x, y1: headRunner.y, x2: headRunner.turnPoints[headRunner.turnPoints.length - 1].x, y2: headRunner.turnPoints[headRunner.turnPoints.length - 1].y }
      const trailPoints = getWindowedTrailPoints(trailRunner, lookbackTime)
      trailPoints.push({ x: trailRunner.x, y: trailRunner.y, time: now() })
      for(let i = 0; i < trailPoints.length - 1; i++) {
        const trailSegment = { x1: trailPoints[i].x, y1: trailPoints[i].y, x2: trailPoints[i + 1].x, y2: trailPoints[i + 1].y }
        if(doSegmentsIntersect(headSegment, trailSegment)) {
          return true
        }
      }
      return false
    }

    abstract class LoopAgent<T> {
      name: string
      ctx: TimeContext
      runningLoop: LoopHandle | undefined
      globalState: T
      abstract run(): void
      constructor(ctx: TimeContext, name: string, globalState: T) {
        this.ctx = ctx
        this.name = name
        this.globalState = globalState
      }
    }

    const randomDirection = () => choice([{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }])
    const directionToMouse = (pos: {x: number, y: number}) => {
      const xD = p5Mouse.x - pos.x
      const yD = p5Mouse.y - pos.y
      const mag = Math.sqrt(xD**2 + yD**2)
      return {x: xD/mag * 3, y: yD/mag * 3}
    }
    const dist = (v1: {x: number, y: number}, v2: {x: number, y: number}) => Math.sqrt((v1.x-v2.x)**2 + (v1.y-v2.y)**2)
    const randColor = () => ({r: Math.random() * 255, g: Math.random() * 255, b: Math.random() * 255})

    let steerToMouse = false
    let lastMouseDownTime = 0

    class RunnerAgent extends LoopAgent<RunnerMap> {
      constructor(ctx: TimeContext, name: string, runner: Runner, globalState: RunnerMap) {
        super(ctx, name, globalState)
        this.runner = runner
        this.globalState.set(this.name, runner)
      }

      runner: Runner

      run() {
        console.log("runner launched at time", now())
        this.runningLoop = this.ctx.branch(async (ctx) => {
          let lastTurnTime = now() //todo - how to get progTime to work with waitFrame?
          while (true) {

            let intersectsWithOtherRunner = false
            runners.forEach((r, name) => {
              if(name != this.name && doRunnersIntersect(this.runner, r, 5)) {
                intersectsWithOtherRunner = true
              }
            })

            if(intersectsWithOtherRunner) {
              runners.delete(this.name)
              return
            }


            if(steerToMouse) {
              this.runner.direction = directionToMouse(this.runner)
            }
            if (now() - lastTurnTime > this.runner.turnWait) {
              this.runner.direction = randomDirection()
              lastTurnTime = now()
              this.runner.turnWait = 0.1 + Math.random()**2
              this.runner.turnPoints.push({ x: this.runner.x, y: this.runner.y, time: lastTurnTime })
            }
            const newPos = { x: this.runner.x + this.runner.direction.x, y: this.runner.y + this.runner.direction.y }
            this.runner.x = newPos.x
            this.runner.y = newPos.y 

            const scale = Math.min(Math.max(lerp(100, 0, (dist(this.runner, p5Mouse)/300) ** 2), 10), 100)
            // this.runner.rad = steerToMouse ? scale : 10


            //todo pattern - this type of interactive ramp/decay pattern seems common
            if(true) {
              if(steerToMouse) {
                const targetRad = Math.min(Math.max(lerp(100, 0, (dist(this.runner, p5Mouse)/300) ** 2), 10), 100)
                const fractToMouse = clamp((now() - lastMouseDownTime) / 0.3, 0, 1)
                this.runner.rad = lerp(this.runner.radGrowSnapshot, targetRad, fractToMouse)
              } else {
                this.runner.rad = Math.max(10, this.runner.rad * 0.95)
              }
            }
            //todo bug - why does this have a bunch of errors with negative wait time, then stabilize?
            
            //todo api/deep design - transport based animation is "simpler" for creating
            //strongly timed animations than doing robust frameTimeDelta based calculations
            //use that as a selling point (especially for prototyping), but also see if you can add some first class api
            //to make it easier to do frameTimeDelta based calculations as well. can use it as a teaching tool
            //to transition from animation "design" (transport) to robust animation "implemenetation" (frameTimeDelta)
            await ctx.waitSec(0.0166)
          }
        })
      }
    }

    let runnerId = 0

    const code = () => {
      clearDrawFuncs()
    
      launchLoop(async (ctx) => {


        keydownEvent(ev => {
          if(ev.key == "d") {
            
            const startPos = { x: p5Mouse.x, y: p5Mouse.y, time: now()}
            const runner: Runner = { x: startPos.x, y: startPos.y, rad: 10, radGrowSnapshot: -1, turnPoints: [startPos], trailColor: randColor(), turnWait: 0.3, direction: randomDirection() }
            const newRunner = new RunnerAgent(ctx, `runner_${runnerId++}`, runner, runners)
            newRunner.run()
          }
          if(ev.key == "m") {
            for(let i = 0; i < 10; i++) {
              const color = randColor()
              const startPos = { x: p5Mouse.x + Math.random() * 100 - 50, y: p5Mouse.y + Math.random() * 100 - 50, time: now()}
              const runner = { x: startPos.x, y: startPos.y, rad: 10, radGrowSnapshot: -1, turnPoints: [startPos], trailColor: color, turnWait: 0.3, direction: randomDirection()}
              const newRunner = new RunnerAgent(ctx, `runner${runnerId++}`, runner, runners)
              newRunner.run()
            }
          }
        })

        mousedownEvent((ev) => {
          steerToMouse = true
          lastMouseDownTime = now()
          runners.forEach((r, name) => {
            r.radGrowSnapshot = r.rad
            r.turnPoints.push({ x: r.x, y: r.y, time: lastMouseDownTime })
          })
        }, threeCanvas)

        mouseupEvent(ev => {
          steerToMouse = false
          runners.forEach((r, name) => {
            r.turnPoints.push({ x: r.x, y: r.y, time: now() })
          })
        })
        
        await ctx.wait(10000000)
      })

      const drawRunnerTrail = (p: p5, runner: Runner, lookbackTime: number) => {
        p.push()
        p.noFill()
        p.stroke(runner.trailColor.r, runner.trailColor.g, runner.trailColor.b)
        p.strokeWeight(2)
        p.beginShape()
        const windowedTrailPoints = getWindowedTrailPoints(runner, lookbackTime)
        windowedTrailPoints.forEach(pos => {
          p.vertex(pos.x, pos.y)
        })
        p.vertex(runner.x, runner.y)
        p.endShape()
        p.pop()
      }
      
      appState.drawFunctions.push((p: p5) => {
        runners.forEach((pos, name) => {
          p.push()
          p.fill(255)
          p.ellipse(pos.x, pos.y, pos.rad, pos.rad)
          p.pop()
          drawRunnerTrail(p, pos, 5)
        })
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
  clearDrawFuncs()
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>