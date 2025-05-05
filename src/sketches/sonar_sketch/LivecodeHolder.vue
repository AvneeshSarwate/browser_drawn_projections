<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, appStateName, type VoiceState } from './appState';
import { inject, onMounted, onUnmounted, reactive } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { AbletonClip, clipMap, INITIALIZE_ABLETON_CLIPS } from '@/io/abletonClips';
import { MIDI_READY, midiOutputs } from '@/io/midi';
import { Scale } from '@/music/scale';
import { getPiano } from '@/music/synths';
import { m2f } from '@/music/mpeSynth';
import { sliceAndTransposeByMarkers, type SliceDefinition } from './clipTransforms';
import { clipData as staticClipData } from './clipData';

const appState = inject<TemplateAppState>(appStateName)!!
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

const mod2 = (n: number, m: number) =>  (n % m + m) % m

// ──────────────────────────────────────────────────────────────
//  Live-coding UI / state
// ──────────────────────────────────────────────────────────────
const baseScale = new Scale();                 // used for transpositions

// These will be filled once MIDI is ready (inside onMounted)
const midiOuts: any[] = [];
let playClipFn: ((clip: AbletonClip, ctx: TimeContext, midiOut: any) => Promise<void>) | null = null;

// ---------- helpers ----------
const parseSliceText = (text: string): SliceDefinition[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [clipName, indStr, degStr, speedStr, quantStr] = line.split(/\s*:\s*/);
      
      return {
        clipName: clipName.trim(),
        index: Number(indStr),
        scaleDegree: Number(degStr),
        speedScaling: Number(speedStr),
        quantization: Number(quantStr),
      } as SliceDefinition;
    });

const buildClip = (sliceText: string): AbletonClip | null => {
  const defs = parseSliceText(sliceText);
  if (defs.length === 0) return null;
  const slices = sliceAndTransposeByMarkers(clipMap, defs, baseScale);
  return slices.length ? AbletonClip.concat(...slices) : null;
};

const playVoice = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx];
  const srcClip = buildClip(v.sliceText);
  if (!srcClip || !playClipFn || !midiOuts[voiceIdx]) return;

  const playOnce = async (ctx: TimeContext) =>
    await playClipFn!(srcClip.clone(), ctx, midiOuts[voiceIdx]);

  if (v.isLooping) {
    v.loopHandle?.cancel(); //todo make sure this cancels the loop
    launchQueue.push(async (ctx) => {
      v.loopHandle = launch(async (ctx) => {
        while (v.isLooping) await playOnce(ctx);
      });
    })
  } else {
    launchQueue.push(playOnce)        // one-shot
  }
};

const launchQueue: Array<(ctx: TimeContext) => Promise<void>> = []

onMounted(async() => {
  try {

    await MIDI_READY
    await INITIALIZE_ABLETON_CLIPS('src/sketches/sonar_sketch/piano_melodies Project/piano_melodies.als', staticClipData)

    let scale = new Scale()
    const cHarmonicMajorScale = new Scale([0, 2, 4, 5, 7, 8, 11, 12], 60)

    const iac1 = midiOutputs.get('IAC Driver Bus 1')!!
    const iac2 = midiOutputs.get('IAC Driver Bus 2')!!
    const iac3 = midiOutputs.get('IAC Driver Bus 3')!!
    const iac4 = midiOutputs.get('IAC Driver Bus 3')!!

    const drum0 = () => clipMap.get('drum0')!!.clone()

    const playNoteMidi = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, inst = iac1) => {
      inst.sendNoteOn(pitch, velocity)
      ctx?.branch(async ctx => {
        await ctx?.wait((noteDur ?? 0.1) * 0.98)
        inst.sendNoteOff(pitch)
      })
    }

    const pianos = Array.from({ length: 10 }, (_, i) => getPiano())

    const playNotePiano = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, pianoIndex = 0) => {
      const piano = pianos[mod2(pianoIndex, pianos.length)]
      piano.triggerAttackRelease([m2f(pitch)], '16n', null, velocity)
    }

    const playNote = playNoteMidi

    const playClip= async (clip: AbletonClip, ctx: TimeContext, midiOut = iac1) => {
      let notes = clip.noteBuffer() //todo - reuse
      for (const [i, nextNote] of notes.entries()) { //todo - reuse
        await ctx.wait(nextNote.preDelta)
        playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, midiOut)
        if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
      }
    }

    midiOuts.push(iac1, iac2, iac3, iac4);
    playClipFn = playClip;

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement
    
    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)
    
    appState.drawFunctions.push((p: p5) => {
    })

    launchLoop(async (ctx) => {
      while (true) {
        await ctx.wait(1)
        launchQueue.forEach(cb => cb(ctx))
        launchQueue.length = 0
      }
    })

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
 
  } catch (e) {
    console.warn(e)
  }

})


/*
 add a UI to this component to allow live coding of the slice definitions.

There should be 4 vertical columns, 1 for each voice, which plays on it's own midi output. they should have:
 - a text input to define the slice definitions
 - a button to play the slice definition clip
 - a toggle to select if the slice definition clip should loop

the text of the slice definition should be one slice per line of text with the following format:

clipName - sliceInd - transpose - speed - quantForNextSlice

the clipName is the name of the clip to slice.
the sliceInd is the index of the slice to play.
the transpose is the transpose of the slice.
the speed is the speed of the slice.
the quantForNextSlice is the quantization value for the end of the slice.
*/

onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <div class="livecode-container">
    <div
      v-for="(voice, idx) in appState.voices"
      :key="idx"
      class="voice-column"
    >
      <h3>Voice {{ idx + 1 }}</h3>
      <textarea
        v-model="voice.sliceText"
        placeholder="clipName : sliceInd : transpose : speed : quant"
        rows="10"
      />
      <div class="controls">
        <button @click="playVoice(idx)">Play</button>
        <label>
          <input type="checkbox" v-model="voice.isLooping" />
          Loop
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.livecode-container {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.voice-column {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
}

.voice-column textarea {
  width: 100%;
  resize: vertical;
  font-family: monospace;
}

.controls {
  margin-top: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

button {
  padding: 0.25rem 0.75rem;
}
</style>