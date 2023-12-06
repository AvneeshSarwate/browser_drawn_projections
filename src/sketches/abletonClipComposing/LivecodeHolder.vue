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
  const playFunc = makeMidiPlayFunc("IAC Driver Bus 1")
  launchLoop(async ctx => {
    await playAbletonClip(clipMap.get("base_clip")!!, ctx, playFunc)
    await playAbletonClip(clipMap.get("base_clip")!!, ctx, playFunc)
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
  <button id="playButton" @click="playButtonClicked">Play</button>
</template>

<style scoped></style>