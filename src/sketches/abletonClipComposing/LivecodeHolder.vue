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
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll';

import { midiOutputs } from '@/io/midi'
import { clipMap, type AbletonNote } from '@/io/abletonClips';
import { makeMidiPlayFunc, playAbletonClip } from '@/utils/abletonClipPlaying';

console.log("livecode holder", clipMap.size)

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





function playButtonClicked() {
  const clip1 = clipMap.get("clip1")!!
  const clip2 = clipMap.get("clip2")!!
  const clip3 = clipMap.get("clip3")!!
  const clips = [clip1, clip2, clip3]

  let refClip = clip1

  launchLoop(async ctx => {

    for (let i = 0; i < 400; i++) {
      await ctx.wait(8)
      refClip = clips[i % clips.length]
    }
  })

  for (let i = 1; i < 9; i++) {
    const midiPlay = makeMidiPlayFunc(`IAC Driver Bus ${i}`)
    launchLoop(async ctx => {
      ctx.bpm = 120 +i 
      for (let i = 0; i < 400; i++) {
        await playAbletonClip(refClip, ctx, midiPlay)
      }
    })
  }

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
  <button id="playButton" @click="playButtonClicked">Play</button>
</template>

<style scoped></style>