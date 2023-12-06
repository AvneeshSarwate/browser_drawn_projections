<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { appStateName, type ClickAVAppState } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, targetNormalizedCoords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, tri, EventChop, cos, sin } from '@/channels/channels';
import {channelExports, channelExportString} from '@/channels/exports'
import { listToClip, clipToDeltas, note, type Instrument } from '@/music/clipPlayback';
import { Scale } from '@/music/scale';
import { sampler } from '@/music/synths';
import { HorizontalBlur, LayerBlend, VerticalBlur, Transform } from '@/rendering/customFX';
import { PianoRoll } from '@/music/pianoRoll';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { channelDefs, channelModDefs } from './chanelSrc';
import { playbackDefs } from './playbackDefs';
import { scaleDef } from './scaleDef';
import { p5defs } from './p5Defs';
import { buildFuncTS, buildFuncJS } from '@/livecoding/scratch';
import { transform } from "sucrase";
import ts, * as TS from 'typescript'
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

const appState = inject<ClickAVAppState>(appStateName)!!
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

// eslint-disable-next-line no-inner-declarations
function nodeSlice(input: string, node: any): string {
  return input.substring(node.start, node.end)
}

function parseEditorVal(): Function | undefined {
  const editorVal = editor?.getValue()
  if (editorVal) {
    const sucraseFunc = transform(editorVal, { transforms: ['typescript'] }).code
    const acParse = acorn.parse(sucraseFunc, { ecmaVersion: 2020, sourceType: 'module' })
    //@ts-ignore
    const bodyString = nodeSlice(sucraseFunc, acParse.body[0].body)

    const libAddedSrc = `
    ${channelExportString}

    ${bodyString}
    `

    return Function('chanExports', 'p5sketch', 'inst', 'scale', 'savedState', 'noteInfo', libAddedSrc)
  }
}

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
    // editorModel = monaco.editor.createModel(infoSrc, "typescript", monaco.Uri.parse(channelUri))

    const p5uri = "ts:filename/p5.d.ts"
    monaco.languages.typescript.typescriptDefaults.addExtraLib(p5defs, p5uri)
    // monaco.editor.createModel(p5defs, "typescript", monaco.Uri.parse(p5uri))

    const playbackUri = "ts:filename/playback.d.ts"
    monaco.languages.typescript.typescriptDefaults.addExtraLib(playbackDefs, playbackUri)

    const scaleUri = "ts:filename/scale.d.ts"
    monaco.languages.typescript.typescriptDefaults.addExtraLib(scaleDef, scaleUri)

    // const shaderFxUri = "ts:filename/shaderFX.d.ts"
    // monaco.languages.typescript.typescriptDefaults.addExtraLib(shaderFXGlobalDefs, shaderFxUri)
    // monaco.editor.createModel(shaderFXDefs, "typescript", monaco.Uri.parse(shaderFxUri))

    const tsSource = `
  function noteCallback(p5sketch: p5, inst: Instrument, scale: Scale, savedState: any,
    noteInfo: { pitch: number, duration: number, velocity: number, index: number }) {
  
  const {pitch, duration, velocity} = noteInfo
  const origInd = scale.getIndFromPitch(pitch)
  const ind = Math.random() < 0.3 ? origInd + 1 : origInd
  const newPitch = scale.getByIndex(ind)
  console.log("pitch", pitch)
  p5sketch.circle(100, 100, 100)

  function m2f(midi: number) {
    return Math.pow(2, (midi - 69) / 12) * 440;
  }

  inst.triggerAttackRelease(m2f(newPitch), duration, undefined, velocity)
}
    `
    

  


    editor = monaco.editor.create(document.getElementById('monacoHolder')!!, {
      value: tsSource,
      language: 'typescript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: {
        enabled: true
      }
    });

    let livecodeFunc = parseEditorVal()

    const scale = new Scale(undefined, 48)

    const pitches = scale.getMultiple([1, 3, 5, 6, 8, 10, 12])
    const notes = pitches.map((p, i) => ({ pitch: p, duration: 1, position: i, velocity: 0.5 }))

    const pianoRoll = new PianoRoll<any>("pianoRollHolder", () => null, () => null)
    pianoRoll.setNoteData(notes)
    pianoRoll.setViewportToShowAllNotes()



    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    const initialSavedState = {}
    setTimeout(() => {
      // console.log("livecodeFunc", livecodeFunc)
      // livecodeFunc?.(channelExports, p5i!!, sampler, scale, {}, {pitch: 60}) //todo bug - why does this need to be delayed to call p5 properly?
    }, 1000); 


    const baseDur = 0.125 / 2
    const baseSeq = [1, 3, 5, 6, 8, 10, 12]
    const rad = 50


    const code = () => {

      const mousePos = { x: 0, y: 0 }

      mousemoveEvent(ev => {
        const p5xy = targetNormalizedCoords(ev, ev.target as HTMLCanvasElement)
        mousePos.x = p5xy.x
        mousePos.y = p5xy.y
      }, threeCanvas)

      const loopMap = new Map<string, CancelablePromisePoxy<any>>()
      const loopIdStack = [] as string[]

      mousedownEvent(ev => {

        const p5xy = targetToP5Coords(ev, p5i, ev.target as HTMLCanvasElement)
        const normCoords = targetNormalizedCoords(ev, ev.target as HTMLCanvasElement)

        let lcFunc = parseEditorVal()
        const savedState = {}


        const evtDur = baseDur * Math.pow(2, (1 - normCoords.x) * 4)

        const mel = pianoRoll.getNoteData().map(n => ({ position: n.position, pitch: n.pitch, duration: n.duration, velocity: 1 - normCoords.y }))
        const mel2 = mel.map(i => i)
        mel2.sort((a, b) => (a.position + a.duration) - (b.position + b.duration))
        const melDuration = mel2[mel2.length - 1].position + mel2[mel2.length - 1].duration

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
              const phase = mel[i].position / melDuration
              await ctx.waitSec(Math.max(dur * evtDur * (1 - mousePos.y*0), 0))
              const x = cos(phase) * rad + p5xy.x
              const y = sin(phase) * rad + p5xy.y
              const evtData = { r: p5xy.x / p5i.width, g: p5xy.y / p5i.height, b: r(), x, y }
              evtChop.ramp(evtDur * 4, evtData)
              const { pitch, duration, velocity } = mel[i]
              // note(sampler, pitch, duration, velocity)
              lcFunc?.(channelExports, p5i!!, sampler, scale, savedState, {pitch, duration, velocity, index: i})
              // console.log("playing note", (Date.now() / 1000).toFixed(2), evtData)
            }
            await ctx.waitSec(durs[durs.length - 1] * evtDur)
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