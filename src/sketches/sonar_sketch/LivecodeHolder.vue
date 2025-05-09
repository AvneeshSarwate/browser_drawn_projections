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
import { TRANSFORM_REGISTRY } from './clipTransforms';
import { clipData as staticClipData } from './clipData';
import type { MIDIValOutput } from '@midival/core';

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
              // used for transpositions

// These will be filled once MIDI is ready (inside onMounted)
const midiOuts: any[] = [];

//lets you switch between midi and web audio piano
let playNote: (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, inst?: any) => void = () => {}


const buildClipFromLine = (line: string): { clip: AbletonClip, updatedLine: string } => {
  const tokens = line.split(/\s*:\s*/).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return { clip: undefined, updatedLine: line };

  const srcName = tokens[0];
  const srcClip = clipMap.get(srcName);
  if (!srcClip) return { clip: undefined, updatedLine: line };

  let curClip = srcClip.clone();
  let updatedTokens = [tokens[0]]; // Start with the clip name

  tokens.slice(1).forEach((cmdToken) => {
    const parts = cmdToken.split(/\s+/).filter(Boolean);
    const symbol = parts[0];
    const params = parts.slice(1);

    const tf = TRANSFORM_REGISTRY[symbol as keyof typeof TRANSFORM_REGISTRY];
    const parsedParams = tf.argParser(params);
    const updatedParams = [...params]; // Clone params for updating

    //if string arg is s1-s8, replace with the value of the corresponding slider
    parsedParams.forEach((param, index) => {
      if (typeof param === 'string' && /s\d+/.test(param)) { //regex to check if the param is a slider reference
        const sliderIndex = parseInt(param.slice(1)) - 1;
        if (sliderIndex >= 0 && sliderIndex < appState.sliders.length) {
          const scaledValue = tf.sliderScale[index](appState.sliders[sliderIndex]);
          parsedParams[index] = scaledValue;
          updatedParams[index] = scaledValue.toFixed(2); // Format for readability
        }
      }
    });

    if (tf) curClip = tf.transform(curClip, ...parsedParams);
    // Add the updated command token to the updatedTokens array
    updatedTokens.push(`${symbol} ${updatedParams.join(' ')}`);
  });

  // Join tokens with " : " to reconstruct the line
  const updatedLine = updatedTokens.join(' : ');
  
  return { clip: curClip, updatedLine };
}


const playClips = async (
  lines: string[],
  ctx: TimeContext,
  midiOut: MIDIValOutput,
  voiceState: VoiceState,
) => {
  const displayLines = lines.map(l => l)
  for (const [idx, line] of lines.entries()) {
    const { clip: curClip, updatedLine } = buildClipFromLine(line);
    if (!curClip) continue;

    displayLines[idx] = updatedLine
    voiceState.playingText = displayLines.join('\n')
    
    // Optional: you can do something with updatedLine here if needed
    console.log('Playing:', updatedLine);
    
    const notes = curClip.noteBuffer();

    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta);
      playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, midiOut)
      if (nextNote.postDelta) await ctx.wait(nextNote.postDelta);
    }
  }
};

const playVoice = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx];

  const playOnce = async (ctx: TimeContext) => {
    const lines = v.sliceText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length || !midiOuts[voiceIdx]) return;
    await playClips(lines, ctx, midiOuts[voiceIdx], v);
  };

  if (v.isLooping) {
    v.loopHandle?.cancel();                    // stop previous loop
    launchQueue.push(async (ctx) => {
      v.loopHandle = ctx.branch(async (ctx) => {
        while (v.isLooping) await playOnce(ctx);
      });
    });
  } else {
    launchQueue.push(playOnce);                // one-shot
  }
};

const launchQueue: Array<(ctx: TimeContext) => Promise<void>> = []

onMounted(async() => {
  try {

    await MIDI_READY
    await INITIALIZE_ABLETON_CLIPS('src/sketches/sonar_sketch/piano_melodies Project/piano_melodies.als', staticClipData, true)

    const iac1 = midiOutputs.get('IAC Driver Bus 1')!!
    const iac2 = midiOutputs.get('IAC Driver Bus 2')!!
    const iac3 = midiOutputs.get('IAC Driver Bus 3')!!
    const iac4 = midiOutputs.get('IAC Driver Bus 3')!!

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
      //todo - get this to use duration and have midi output signature for consistency
      piano.triggerAttackRelease([m2f(pitch)], '16n', null, velocity)
    }

    playNote = playNoteMidi

    midiOuts.push(iac1, iac2, iac3, iac4);

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
      // eslint-disable-next-line no-constant-condition
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
  <div class="break-row"></div>
  <div class="sliders-row">
    <div class="slider-column" v-for="(slider, idx) in appState.sliders" :key="idx">
      <div>{{ appState.sliders[idx] }}</div>
      <input type="range" v-model.number="appState.sliders[idx]" min="0" max="1" step="0.001" />
      <label>slider {{ idx + 1 }}</label>
    </div>
  </div>
  <div class="livecode-container">
    <div
      v-for="(voice, idx) in appState.voices"
      :key="idx"
      class="voice-column"
    >
      <h3>Voice {{ idx + 1 }}</h3>
      <textarea
        v-model="voice.sliceText"
        placeholder="clipName : seg 1 : s_tr 2 : str 0.5 : q 1"
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

.sliders-row {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
}

.slider-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

input[type=range] {
    writing-mode: vertical-lr;
    direction: rtl;
    vertical-align: middle;
}

.break-row {
  height: 2rem;
}

.livecode-container {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.voice-column {
  flex: 0 0 calc(50% - 0.5rem);
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
}

.voice-column textarea {
  width: 100%;
  resize: vertical;
  font-family: monospace;
  min-height: 150px;
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