<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { appStateName, type ClickAVAppState } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords, targetNormalizedCoords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, tri, EventChop, cos, sin } from '@/channels/channels';
import {channelExports, channelExportString} from '@/channels/exports'
import { listToClip, clipToDeltas, note, type Instrument, m2f } from '@/music/clipPlayback';
import { Scale } from '@/music/scale';
import { getPiano, sampler } from '@/music/synths';
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
import { midiOutputs } from '@/io/midi'

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
  const trigger = (pitch: number) => inst.triggerAttackRelease(m2f(pitch), 0.1)
  const onOff = (pitch: number, onOff: ('on' | 'off')) => onOff === 'on' ? inst.triggerAttack(m2f(pitch), undefined, 0.1) : inst.triggerRelease(m2f(pitch))
  const pianoRoll = new PianoRoll<any>(container, trigger, onOff)
  if (notes) { //todo bug - need to wait for piano roll synth to be ready before setting notes, or not play notes on initial add
    pianoRoll.setNoteData(notes)
    pianoRoll.setViewportToShowAllNotes()
  }
  return pianoRoll
}

function getLocalStorageNotes(key: string, defaultNotes: NoteInfo<void>[]) {
  const storedNotes = localStorage.getItem(key)
  if (storedNotes) {
    const parsed = JSON.parse(storedNotes)
    return parsed as NoteInfo<void>[]
  }
  const cloneNotes  = defaultNotes.map(n => ({...n}))
  return defaultNotes
}

const pianoRolls = new Map<string, PianoRoll<any>>()
const pianoRollNames = ['phold0', 'phold1', 'phold2', 'phold3']



function pianoRollDeltas<T>(pr: PianoRoll<T>) {
  const mel = pr.getNoteData()
  const mel2 = mel.map(i => i)
  mel2.sort((a, b) => (a.position + a.duration) - (b.position + b.duration))
  const totalLength = mel2[mel2.length - 1].position + mel2[mel2.length - 1].duration

  const evtChop = new EventChop<{ r: number, g: number, b: number, x: number, y: number }>
  const deltas = clipToDeltas(mel, totalLength)
  return {totalLength, deltas}
}

type NotePlayFunc = (pitch: number, duration: number, velocity: number, ctx: TimeContext) => void


function playPianoRoll<T>(pr: PianoRoll<T>, playFunc: NotePlayFunc) {
  const {totalLength, deltas} = pianoRollDeltas(pr)
  const notes = pr.getNoteData()
  launchLoop(async ctx => {
    ctx.branch(async ctx => { 
      for (let i = 0; i < notes.length; i++) {
        await ctx.wait(deltas[i])
        ctx.branch(async ctx => {
          const { pitch, duration, velocity } = notes[i]
          // inst.triggerAttackRelease(pitch, duration, undefined, velocity)
          playFunc(pitch, duration, velocity, ctx)
        })
      }
    })
    ctx.branch(async ctx => {
      while (ctx.time - ctx.startTime < totalLength) {
        await ctx.wait(0.016)
        pr.setCursorPos(ctx.time - ctx.startTime)
      }
    })
  })
}


onMounted(() => {
  try {

    document.getElementById('debugInfo')!!.onclick = () => {
      navigator.clipboard.readText().then(t => {
        console.log("clipboardText", t)
      })
      navigator.clipboard.read().then(t => {
        console.log("clipboard", t)
      })
    }

    const scale = new Scale(undefined, 48)

    const pitches = scale.getMultiple([1, 3, 5, 6, 8, 10, 12])
    const notes = pitches.map((p, i) => ({ pitch: p, duration: 1, position: i, velocity: 0.5 }))

    //todo api - need a better way to attach piano rolls and associated controllers to their handlers
    pianoRollNames.forEach((name, i) => {
      launchLoop(async ctx => { //todo api - to wait for midi - use MIDI_READY promise from midi.ts instead of a loop/wait 
        await ctx.wait(1)
        const sampler = getPiano()
        await ctx.wait(1)
        const pianoRoll = makePianoRoll<void>(name, sampler, notes.map(n => ({ ...n })))
        pianoRolls.set(name, pianoRoll)
        pianoRoll.setCursorPos(3)
        const buttonName = name.replace('phold', 'pplay')
        const midiIndex = Number(name.slice(-1))
        const midiName = `IAC Driver Bus ${midiIndex + 1}`
        const midiDevice = midiOutputs.get(midiName)!!
        console.log(midiName, midiDevice, midiOutputs)
        function midiPlay(pitch: number, duration: number, velocity: number, ctx: TimeContext) {
          ctx.branch(async ctx => {
            console.log('plaid note', pitch)
            midiDevice.sendNoteOn(pitch, velocity * 127)
            await ctx.wait(duration)
            midiDevice.sendNoteOff(pitch)
          })
        }
        document.getElementById(buttonName)!!.onclick = () => {
            playPianoRoll(pianoRoll, midiPlay)
          }
      })
    })



    const code = () => {

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

  pianoRollNames.forEach((name, i) => {
    const pianoRoll = pianoRolls.get(name)
    if (pianoRoll) {
      const notes = pianoRoll.getNoteData()
      localStorage.setItem(name, JSON.stringify(notes))
    }
  })
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>