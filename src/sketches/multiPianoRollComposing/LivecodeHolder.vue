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
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll';
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

function parseEditorVal(editor: monaco.editor.IStandaloneCodeEditor): Function | undefined {
  const editorVal = editor.getValue()
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

function createEditor(tsSource: string) {
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

  return monaco.editor.create(document.getElementById('monacoHolder')!!, {
      value: tsSource,
      language: 'typescript',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: {
        enabled: true
      }
    });
}

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

function playOnce(pianoRoll: PianoRoll<any>, inst: Instrument) {
  const notes = pianoRoll.getNoteData()
  const noteClone = notes.map(n => ({ ...n }))
  const startSorted = noteClone.sort((a, b) => a.position - b.position)

  //add a setCursoir position to piano roll that sets both pianoRoll.cursorPos and pianoRoll.lastCursorPos
  //create a loop that advances cursor by .02 sec or something and plays notes that are at that position
  //would still need to handle corner case of notes being moved while playing (esp hanning note offs)

}

function makePianoRoll<T>(container: string, inst: Instrument, notes?: NoteInfo<T>[]) {
  //todo api - use intrument for note playing callbacks
  const pianoRoll = new PianoRoll<any>(container, () => null, () => null)
  if (notes) {
    pianoRoll.setNoteData(notes)
    pianoRoll.setViewportToShowAllNotes()
  }
  return pianoRoll
}

onMounted(() => {
  try {

    editor = createEditor(tsSource)

    let livecodeFunc = parseEditorVal(editor)

    const scale = new Scale(undefined, 48)

    const pitches = scale.getMultiple([1, 3, 5, 6, 8, 10, 12])
    const notes = pitches.map((p, i) => ({ pitch: p, duration: 1, position: i, velocity: 0.5 }))

    const pianoRoll0 = makePianoRoll<void>('phold0', sampler, notes)
    const pianoRoll1 = makePianoRoll<void>('phold1', sampler, notes)
    const pianoRoll2 = makePianoRoll<void>('phold2', sampler, notes)
    const pianoRoll3 = makePianoRoll<void>('phold3', sampler, notes)






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
  for (let i = 0; i < 4; i++) document.getElementById(`phold${i}`)!!.innerHTML = ''
  editorModel?.dispose()
  editor?.dispose()
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>