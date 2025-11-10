<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue';
import { type TemplateAppState, appStateName } from './appState';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousemoveEvent, singleKeydownEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { Ramp, launch, now, type CancelablePromisePoxy, type TimeContext } from '@/channels/channels';
import { parametricPathMap, parametricPaths, type ParametricPathDefinition, type PathFunctionParams, type Vec2 } from './pathFunctions';
import { time } from 'console';
import { logisticSigmoid } from '@/rendering/logisticSigmoid';

const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined

const timeLoops: CancelablePromisePoxy<any>[] = []
const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const STORAGE_KEYS = {
  start: 'gestaltTest1.startPoint',
  end: 'gestaltTest1.endPoint',
}

const hasWindow = typeof window !== 'undefined'

const loadStoredPoint = (key: string): Vec2 | null => {
  if (!hasWindow) return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
      return parsed
    }
  } catch (err) {
    console.warn('Failed to load stored point', err)
  }
  return null
}

const initialStart = appState.gestaltStartPoint ?? loadStoredPoint(STORAGE_KEYS.start)
const initialEnd = appState.gestaltEndPoint ?? loadStoredPoint(STORAGE_KEYS.end)

const startPoint = ref<Vec2 | null>(initialStart ? { ...initialStart } : null)
const endPoint = ref<Vec2 | null>(initialEnd ? { ...initialEnd } : null)

if (initialStart && !appState.gestaltStartPoint) {
  appState.gestaltStartPoint = { ...initialStart }
}
if (initialEnd && !appState.gestaltEndPoint) {
  appState.gestaltEndPoint = { ...initialEnd }
}

const defaultPathId = parametricPaths[0]?.id ?? ''
const selectedPathId = ref(appState.gestaltSelectedPathId || defaultPathId)
if (!appState.gestaltSelectedPathId && selectedPathId.value) {
  appState.gestaltSelectedPathId = selectedPathId.value
}
const canLaunch = computed(() => Boolean(startPoint.value && endPoint.value && parametricPathMap.has(selectedPathId.value)))

type ActiveLaunch = {
  id: number
  ramp: Ramp
  start: Vec2
  end: Vec2
  definition: ParametricPathDefinition
  params: PathFunctionParams
  color: string
}

const colorPalette = ['#F94144', '#F3722C', '#F9C74F', '#90BE6D', '#577590']
const activeLaunches: ActiveLaunch[] = []
let launchCounter = 0

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

const removeLaunchById = (id: number) => {
  const index = activeLaunches.findIndex(item => item.id === id)
  if (index >= 0) {
    activeLaunches.splice(index, 1)
  }
}

const persistPoint = (key: string, point: Vec2 | null) => {
  if (!hasWindow) return
  if (point) {
    window.localStorage.setItem(key, JSON.stringify(point))
  } else {
    window.localStorage.removeItem(key)
  }
}

watch(startPoint, (val) => {
  appState.gestaltStartPoint = val ? { ...val } : null
  persistPoint(STORAGE_KEYS.start, val ? { ...val } : null)
}, { deep: true })

watch(endPoint, (val) => {
  appState.gestaltEndPoint = val ? { ...val } : null
  persistPoint(STORAGE_KEYS.end, val ? { ...val } : null)
}, { deep: true })

watch(selectedPathId, (val) => {
  appState.gestaltSelectedPathId = val
})

const drawMarker = (p: p5, point: Vec2, color: string, label: string) => {
  p.push()
  p.stroke(color)
  p.fill(color)
  p.circle(point.x, point.y, 10)
  p.noStroke()
  p.textSize(14)
  p.textAlign(p.CENTER, p.TOP)
  p.text(label, point.x, point.y + 8)
  p.pop()
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

    singleKeydownEvent('s', () => {
      startPoint.value = { ...p5Mouse }
    })

    singleKeydownEvent('e', () => {
      endPoint.value = { ...p5Mouse }
    })

    const drawPathTester = (p: p5) => {
      p.push()
      p.stroke(80, 80, 80)
      p.strokeWeight(1)
      p.noFill()

      if (startPoint.value && endPoint.value) {
        p.line(startPoint.value.x, startPoint.value.y, endPoint.value.x, endPoint.value.y)
      }

      if (startPoint.value) {
        drawMarker(p, startPoint.value, '#4CC9F0', 'S')
      }
      if (endPoint.value) {
        drawMarker(p, endPoint.value, '#F72585', 'E')
      }

      activeLaunches.forEach((launch) => {
        const progress = clamp01(launch.ramp.val())
        const pos = launch.definition.sample({
          start: launch.start,
          end: launch.end,
          params: launch.params,
          t: progress,
        })
        p.noStroke()
        p.fill(launch.color)
        p.circle(pos.x, pos.y, 18)
      })

      p.pop()
    }

    appState.drawFunctions.push(drawPathTester)

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })

  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(loop => loop.cancel())
})

const launchSelectedPath = () => {
  if (!canLaunch.value) return
  const definition = parametricPathMap.get(selectedPathId.value)
  if (!definition || !startPoint.value || !endPoint.value) return

  const params = definition.createParams({
    start: { ...startPoint.value },
    end: { ...endPoint.value },
  })

  const ramp = new Ramp(2)
  const launchId = launchCounter++
  ramp.onFinish = () => removeLaunchById(launchId)
  ramp.trigger(now())

  activeLaunches.push({
    id: launchId,
    ramp,
    start: { ...startPoint.value },
    end: { ...endPoint.value },
    definition,
    params,
    color: colorPalette[launchId % colorPalette.length],
  })
}

type Runner = {
  lastPos: { x: number, y: number },
  nextPos: { x: number, y: number }
}

const runners: Runner[] = new Array(100).fill({ lastPos: { x: 0, y: 0 }, nextPos: { x: 0, y: 0 } })
/* 
- each element of runnerGroupings is a group or "sub arrangement" of runner indices
  - no need for heirarchy really - just decide what points to grap out of one subarrangement into another,
    and pick the "functional arrangement shape" (see below) correctly to get lerp out to look good enough
- a sub arrangement stepping through involves rotating the index list of what is last/next
- the actual "spots" of an arrangement will be static (eg, N points along a circle of radius r, center xy)
- should come up with a bunch of sample "functional arrangement shape" functional generators like above
- a problem may be "clean lerp" when breaking a sub arrangement out of another 
 */
const runnerGroupings: number[][] = [new Array(100).fill(0).map((e, i) => i)]


launchLoop(async ctx => {
  const stepTime = 1
  let lastStepStart = ctx.time

  //branch that runs lerpings - arrangemnt manipulation happens separately outside this loop
  ctx.branch(async ctx => {
    // eslint-disable-next-line no-constant-condition
    while(true) {
      while (ctx.time < lastStepStart + stepTime) {
        const progress = (ctx.time - lastStepStart) / stepTime
        const sigProg = logisticSigmoid(progress, 0.5)

        //step all runners from last pos to next pos - a naive lerp between by sigProg

        await ctx.waitSec(0.016)
      }
      lastStepStart = lastStepStart + stepTime
    }
  })



})

const clamp01 = (val: number) => Math.max(0, Math.min(1, val))

</script>

<template>
  <div class="path-lab">
    <div class="controls">
      <label>
        Path Function
        <select v-model="selectedPathId">
          <option
            v-for="path in parametricPaths"
            :key="path.id"
            :value="path.id"
          >
            {{ path.label }}
          </option>
        </select>
      </label>

      <button
        class="launch-btn"
        :disabled="!canLaunch"
        @click="launchSelectedPath"
      >
        Launch
      </button>
    </div>

    <div class="status-row">
      <div>
        <span class="status-label">Start:</span>
        <span v-if="startPoint">({{ startPoint.x.toFixed(0) }}, {{ startPoint.y.toFixed(0) }})</span>
        <span v-else>Hover + press s</span>
      </div>
      <div>
        <span class="status-label">End:</span>
        <span v-if="endPoint">({{ endPoint.x.toFixed(0) }}, {{ endPoint.y.toFixed(0) }})</span>
        <span v-else>Hover + press e</span>
      </div>
    </div>

    <p class="hint">
      Hover the canvas, press <code>s</code> for the start point and <code>e</code> for the end point. Use the button to fire a circle along the selected Parametric Path Function.
    </p>
  </div>
</template>

<style scoped>
.path-lab {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: #fff;
  font-size: 0.95rem;
}

.controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

select {
  margin-left: 0.5rem;
  padding: 0.2rem 0.4rem;
  background: #111;
  color: #fff;
  border: 1px solid #444;
}

.launch-btn {
  padding: 0.3rem 0.8rem;
  border: 1px solid #4cc9f0;
  background: transparent;
  color: #4cc9f0;
  cursor: pointer;
}

.launch-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.status-row {
  display: flex;
  gap: 1.5rem;
  font-size: 0.9rem;
}

.status-label {
  font-weight: 600;
  margin-right: 0.3rem;
}

.hint {
  font-size: 0.8rem;
  opacity: 0.8;
  color: black
}

code {
  background: #eee;
  padding: 0 0.2rem;
  color: black;
}
</style>
