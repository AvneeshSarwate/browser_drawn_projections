<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue';
import { type TemplateAppState, appStateName } from './appState';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousemoveEvent, singleKeydownEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { Ramp, now } from '@/channels/channels';
import { parametricPathMap, parametricPaths, type ParametricPathDefinition, type PathFunctionParams, type Vec2 } from './pathFunctions';

const appState = inject<TemplateAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined

const startPoint = ref<Vec2 | null>(null)
const endPoint = ref<Vec2 | null>(null)
const selectedPathId = ref(parametricPaths[0]?.id ?? '')
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
        Launch circle (2s)
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
}

code {
  background: #222;
  padding: 0 0.2rem;
}
</style>
