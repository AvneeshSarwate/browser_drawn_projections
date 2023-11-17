<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type ClickAVAppState } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, targetNormalizedCoords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, EventChop, cos, sin } from '@/channels/channels';
import { listToClip, clipToDeltas, note } from '@/music/clipPlayback';
import { Scale } from '@/music/scale';
import { sampler } from '@/music/synths';
import { HorizontalBlur, LayerBlend, VerticalBlur, Transform } from '@/rendering/customFX';
import { PianoRoll } from '@/music/pianoRoll';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { channelDefs, channelSrc } from './chanelSrc';
import { buildFuncTS, buildFuncJS } from '@/livecoding/scratch';
import { transform } from "sucrase";
import * as TS from 'typescript'
import * as acorn from 'acorn'


declare function defineCallback<T>(cb: (block: (ctx: TimeContext) => Promise<T>) => CancelablePromisePoxy<T>): void;

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new TsWorker();
    }
    return new EditorWorker();
  }
};

const appState = inject<ClickAVAppState>('appState')!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions.length = 0
  appState.drawFuncMap.clear()
}

let editor: monaco.editor.IStandaloneCodeEditor | undefined = undefined
let editorModel: monaco.editor.ITextModel | undefined = undefined


onMounted(() => {
  try {

    // validation settings
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    // compiler options
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2015,
      allowNonTsExtensions: true,
    });

    const infoSrc = channelDefs

    const channelUri = "ts:filename/channels.d.ts"
    monaco.languages.typescript.typescriptDefaults.addExtraLib(infoSrc, channelUri)
    editorModel = monaco.editor.createModel(infoSrc, "typescript", monaco.Uri.parse(channelUri))

    const tsSource = `
defineCallback((launch) => {
  launch(async (ctx) => {
    const stepVal = 0.2

    const start = ctx.time
    const start2 = performance.now()
    let drift = 0, lastDrift = 0
    const res0 = ctx.branch(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        const [logicalTime, wallTime] = [ctx.time - start, (performance.now() - start2) / 1000] //todo bug - is this correct?
        drift = wallTime - logicalTime 
        const driftDelta = drift - lastDrift
        console.log('step', i, "logicalTime", logicalTime.toFixed(3), "wallTime", wallTime.toFixed(3), "drift", drift.toFixed(3), "driftDelta", driftDelta.toFixed(3))
        lastDrift = drift
        await ctx.wait(stepVal)
      }
    })

    await ctx.branch(async (ctx) => {
      await ctx.wait(stepVal * 10)
      console.log('res0 cancel', performance.now() - start2)
      res0.cancel()
    })

    console.log("parent context time elapsed", ctx.progTime.toFixed(3))
  })
})
    `
    const sucraseFunc = transform(tsSource, { transforms: ['typescript'] }).code
    console.log("sucraseFunc", sucraseFunc)

    // const func = buildFuncJS(tsSource)
    // func(launch)

    const acParse = acorn.parse(sucraseFunc, { ecmaVersion: 2020, sourceType: 'module' })

    //@ts-ignore
    const livecodeBody = acParse.body[0].expression.arguments[0].body.body[0]
    const bodyString = sucraseFunc.substring(livecodeBody.start, livecodeBody.end)
    const livecodeFunc = Function('launch', bodyString)
    livecodeFunc(launch)


    editor = monaco.editor.create(document.getElementById('monacoHolder')!!, {
      value: tsSource,
      language: 'typescript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: {
        enabled: true
      }
    });


    const scale = new Scale(undefined, 48)

    const pitches = scale.getMultiple([1, 3, 5, 6, 8, 10, 12])
    const notes = pitches.map((p, i) => ({ pitch: p, duration: 1, position: i }))

    const pianoRoll = new PianoRoll("pianoRollHolder", () => null, () => null)
    pianoRoll.setNoteData(notes)
    pianoRoll.setViewportToShowAllNotes()



    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    const baseDur = 0.125 / 2
    const baseSeq = [1, 3, 5, 6, 8, 10, 12]
    const rad = 50


    const code = () => {

      const mousePos = { x: 0, y: 0 }

      mousemoveEvent(ev => {
        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        mousePos.x = p5xy.x
        mousePos.y = p5xy.y
      }, threeCanvas)

      const loopMap = new Map<string, CancelablePromisePoxy<any>>()
      const loopIdStack = [] as string[]

      mousedownEvent(ev => {

        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        const normCoords = targetNormalizedCoords(ev, ev.target as HTMLCanvasElement)


        const evtDur = baseDur * Math.pow(2, (1 - normCoords.x) * 4)

        const mel = pianoRoll.getNoteData().map(n => ({ time: n.position, pitch: n.pitch, duration: n.duration, velocity: 0.5 }))
        const mel2 = mel.map(i => i)
        mel2.sort((a, b) => (a.time + a.duration) - (b.time + b.duration))
        const melDuration = mel2[mel2.length - 1].time + mel2[mel2.length - 1].duration

        const evtChop = new EventChop<{ r: number, g: number, b: number, x: number, y: number }>
        const durs = clipToDeltas(mel, melDuration)
        console.log("durs", durs)
        const drawFuncId = crypto.randomUUID()
        loopIdStack.push(drawFuncId)
        appState.drawFuncMap.set(drawFuncId, () => {

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
              const phase = mel[i].time / melDuration
              await ctx.wait(dur * evtDur)
              const x = cos(phase) * rad + p5xy.x
              const y = sin(phase) * rad + p5xy.y
              const evtData = { r: p5xy.x / p5i.width, g: p5xy.y / p5i.height, b: r(), x, y }
              evtChop.ramp(evtDur * 4, evtData)
              const { pitch, duration, velocity } = mel[i]
              note(sampler, pitch, duration, velocity)
              // console.log("playing note", (Date.now() / 1000).toFixed(2), evtData)
            }
            await ctx.wait(durs[durs.length - 1] * evtDur)
          }
        })

        loopMap.set(drawFuncId, loop)

      }, threeCanvas)

      const p5Passthru = new Passthru({ src: p5Canvas })

      const canvasPaint = new CanvasPaint({ src: p5Passthru })
      shaderGraphEndNode = canvasPaint



      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)

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
        for (const [key, loop] of loopMap.entries()) {
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

})



onUnmounted(() => {
  clearDrawFuncs()
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
  document.getElementById('pianoRollHolder')!!.innerHTML = ''
  editorModel?.dispose()
  editor?.dispose()
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>