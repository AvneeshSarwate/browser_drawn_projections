<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { appStateName, type ALiveAppState } from './appState';
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

import { midiOutputs } from '@/io/midi'
import { clipMap } from '@/io/abletonClips';

declare function defineCallback<T>(cb: (block: (ctx: TimeContext) => Promise<T>) => CancelablePromisePoxy<T>): void;

const appState = inject<ALiveAppState>(appStateName)!!
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
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>