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

    type Runner = {x: number, y: number, rad: number, radGrowSnapshot: number, turnPoints: {x: number, y: number, time: number}[], trailColor: {r: number, g: number, b: number}}
    const runners = new Map<string, Runner>()
    type RunnerMap = Map<string, Runner>

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
      constructor(ctx: TimeContext, name: string, globalState: RunnerMap) {
        super(ctx, name, globalState)
      }
      runner: Runner = { x: 0, y: 0, rad: 10, radGrowSnapshot: -1, turnPoints: [], trailColor: {r: 255, g: 255, b: 255}}
      mag = 1
      direction = { x: 1, y: 0 }
      run() {
        console.log("runner launched at time", now())
        this.runningLoop = this.ctx.branch(async (ctx) => {
          let lastTurnTime = now() //todo - how to get progTime to work with waitFrame?
          let turnWait = 0.5 + Math.random()
          while (true) {
            if(steerToMouse) {
              this.direction = directionToMouse(this.runner)
            }
            if (now() - lastTurnTime > turnWait) {
              this.direction = randomDirection()
              lastTurnTime = now()
              turnWait = 0.5 + Math.random()
              this.runner.turnPoints.push({ x: this.runner.x, y: this.runner.y, time: lastTurnTime })
            }
            const newPos = { x: this.runner.x + this.direction.x * this.mag, y: this.runner.y + this.direction.y * this.mag }
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

            this.globalState.set(this.name, this.runner)
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

    const code = () => {
      clearDrawFuncs()
    
      launchLoop(async (ctx) => {

        keydownEvent(ev => {
          if(ev.key == "d") {
            const newRunner = new RunnerAgent(ctx, `runner${runners.size}`, runners)
            newRunner.runner = { x: p5Mouse.x, y: p5Mouse.y, rad: 10, radGrowSnapshot: -1, turnPoints: [], trailColor: randColor()}
            newRunner.direction = randomDirection()
            newRunner.run()
          }
          if(ev.key == "m") {
            for(let i = 0; i < 10; i++) {
              const color = randColor()
              const nearMousePos = { x: p5Mouse.x + Math.random() * 100 - 50, y: p5Mouse.y + Math.random() * 100 - 50 }
              const newRunner = new RunnerAgent(ctx, `runner${runners.size}`, runners)
              newRunner.runner = { x: nearMousePos.x, y: nearMousePos.y, rad: 10, radGrowSnapshot: -1, turnPoints: [], trailColor: color}
              newRunner.direction = randomDirection()
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
        runner.turnPoints.forEach((pos, i) => {
          if(now() - pos.time < lookbackTime) {
            p.vertex(pos.x, pos.y)
          }
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