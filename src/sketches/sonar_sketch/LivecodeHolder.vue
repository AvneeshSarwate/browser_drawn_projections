<!-- eslint-disable no-debugger -->
<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type SonarAppState, appStateName, type VoiceState, globalStore, type SaveableProperties } from './appState';
import { inject, onMounted, onUnmounted, reactive, ref, computed } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { AbletonClip, clipMap, INITIALIZE_ABLETON_CLIPS, type AbletonNote, quickNote } from '@/io/abletonClips';
import { MIDI_READY, midiInputs, midiOutputs } from '@/io/midi';
import { Scale } from '@/music/scale';
import { getPiano, getPianoChain, TONE_AUDIO_START, getSynthChain } from '@/music/synths';
import { m2f } from '@/music/mpeSynth';
import { TRANSFORM_REGISTRY } from './clipTransforms';
import { clipData as staticClipData } from './clipData';
import type { MIDIValOutput } from '@midival/core';
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll'
import * as Tone from 'tone'

const appState = inject<SonarAppState>(appStateName)!!
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
const midiOuts: MIDIValOutput[] = [];

//lets you switch between midi and web audio piano
let playNote: (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, instInd?: number) => void = () => {}


const saveSnapshot = () => {
  appState.snapshots.push({
    sliders: [...appState.sliders],
    //todo - need to keep an eye on how snapshots are formatted to avoid having to write manual cloning logic
    voices: appState.voices.map(v => JSON.parse(JSON.stringify(v.saveable)) as SaveableProperties)
  })
  console.log('Snapshot saved. Total snapshots:', appState.snapshots.length)
}

//does not manage any playing state - only "safe" to load when not playing
const loadSnapshotStateOnly = (ind: number) => {
  if (ind < 0 || ind >= appState.snapshots.length) return
  appState.sliders = appState.snapshots[ind].sliders
  appState.voices.forEach((v, i) => {
    v.saveable = appState.snapshots[ind].voices[i]
  })
}

const buildClipFromLine = (line: string): { clip: AbletonClip, updatedLine: string } => {
  const tokens = line.split(/\s*:\s*/).map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return { clip: undefined, updatedLine: line };

  const srcName = tokens[0];
  const srcClip = clipMap.get(srcName);
  if (!srcClip) return { clip: undefined, updatedLine: line };

  let curClip = srcClip.clone();
  const origClip = srcClip.clone();
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
          const scaledValue = tf.sliderScale[index](appState.sliders[sliderIndex], origClip);
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

const testTransform = () => {
  const { clip } = buildClipFromLine(testTransformInput.value)
  if (!clip || !testPianoRoll) return

  // Convert AbletonClip to PianoRoll NoteInfo format
  const noteInfos: NoteInfo<{}>[] = clip.notes.map(note => ({
    pitch: note.pitch,
    position: note.position,
    duration: note.duration,
    velocity: note.velocity,
    metadata: {}
  }))

  testPianoRoll.setNoteData(noteInfos)
  testPianoRoll.setViewportToShowAllNotes()
}


const playClips = async (
  lines: string[],
  ctx: TimeContext,
  voiceIdx: number,
  voiceState: VoiceState,
  firstLoop: boolean
) => {
  const displayLines = lines.map(l => l)
  voiceState.playingText = displayLines.join('\n')

  for (const [idx, line] of lines.entries()) {
    if (firstLoop && idx < voiceState.saveable.startPhraseIdx) continue //note this comes from a v-model.number on a text input, could have wierd edge cases


    if (!voiceState.isPlaying) break
    voiceState.playingLineIdx = idx

    const { clip: curClip, updatedLine } = buildClipFromLine(line)
    if (!curClip) continue

    displayLines[idx] = updatedLine
    voiceState.playingText = displayLines.join('\n')

    const notes = curClip.noteBuffer()
    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta)
      if (!voiceState.isPlaying) break
      playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, voiceIdx)
      if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
    }
    if (!voiceState.isPlaying) break
  }
  voiceState.playingLineIdx = -1
}

const startVoice = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx]

  const playOnce = async (ctx: TimeContext, firstLoop: boolean) => {
    const lines = v.saveable.sliceText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length || !midiOuts[voiceIdx]) return
    await playClips(lines, ctx, voiceIdx, v, firstLoop)
  }

  if (v.isLooping) {
    // v.loopHandle?.cancel() - should never be needed?
    launchQueue.push(async (ctx) => {
      v.loopHandle = ctx.branch(async (ctx) => {
        let firstLoop = true
        while (v.isLooping && v.isPlaying) {
          await playOnce(ctx, firstLoop)
          firstLoop = false
        }
        v.isPlaying = false
      })
    })
  } else {
    launchQueue.push(async (ctx) => {
      await playOnce(ctx, true)
      v.isPlaying = false
    })               // one-shot
  }
}

const stopVoice = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx]
  v.isPlaying = false
  v.loopHandle?.cancel()//todo - check if this is needed - do note play functions end their notes properly?
  v.loopHandle = null
  v.playingLineIdx = -1
  v.playingText = ''
}

const togglePlay = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx]
  if (v.isPlaying) {
    stopVoice(voiceIdx)
  } else {
    v.isPlaying = true
    startVoice(voiceIdx)
  }
}

const playCued = () => {
  appState.voices.forEach((voice, idx) => {
    if (voice.isCued && !voice.isPlaying) {
      togglePlay(idx)
    }
  })
}

const stopAll = () => {
  appState.voices.forEach((voice, idx) => {
    if (voice.isPlaying) {
      stopVoice(idx)
    }
  })
}

const launchQueue: Array<(ctx: TimeContext) => Promise<void>> = []

const instrumentChains = [getPianoChain(), getPianoChain(), getSynthChain(), getSynthChain()]

// Piano roll test section state
const testTransformInput = ref('clip1 : arp up 0.25 0.9 0 1')
let testPianoRoll: PianoRoll<{}> | undefined = undefined

// Snapshot selection state
const selectedSnapshot = ref(-1)

// Function to get a readable name for each parameter
const formatParamName = (paramName: string) => {
  return paramName
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
};

// Function to get scaled parameter value using the modular scaling functions
const getScaledParamValue = (paramName, paramScaling: Record<string, (val: number) => number>, normalizedValue: number): number => {
  const val = paramScaling[paramName]?.(normalizedValue) ?? normalizedValue;
  if (val === undefined) debugger;
  return val
}

// Function to update piano FX parameters
const updatePianoFX = (voiceIdx: number, paramName?: string) => {
  const voice = appState.voices[voiceIdx];
  const pianoChain = instrumentChains[mod2(voiceIdx, instrumentChains.length)];

  if (paramName) {
    if (pianoChain.paramFuncs[paramName]) {
      pianoChain.paramFuncs[paramName](voice.saveable.fxParams[paramName]);
    }
  } else {
    // Apply FX parameters
    Object.keys(voice.saveable.fxParams).forEach((paramName: string) => {
      if (pianoChain.paramFuncs[paramName]) {
        pianoChain.paramFuncs[paramName](voice.saveable.fxParams[paramName]);
      }
    });
  }
}

const saveSnapshotsToFile = () => {
  const dataStr = JSON.stringify(appState.snapshots, null, 2)
  const dataBlob = new Blob([dataStr], { type: 'application/json' })
  
  const link = document.createElement('a')
  link.href = URL.createObjectURL(dataBlob)
  link.download = `sonar_snapshots_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
  
  console.log('Snapshots saved to file')
}

const loadSnapshotsFromFile = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  
  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const result = e.target?.result as string
        const loadedSnapshots = JSON.parse(result)
        
        // Validate structure
        if (!Array.isArray(loadedSnapshots)) {
          throw new Error('Invalid file format: expected array of snapshots')
        }
        
        // Basic validation of snapshot structure
        for (const snapshot of loadedSnapshots) {
          if (!snapshot.sliders || !Array.isArray(snapshot.sliders)) {
            throw new Error('Invalid snapshot format: missing or invalid sliders array')
          }
          if (!snapshot.voices || !Array.isArray(snapshot.voices)) {
            throw new Error('Invalid snapshot format: missing or invalid voices array')
          }
          // Validate each voice has required properties
          for (const voice of snapshot.voices) {
            if (typeof voice.sliceText !== 'string' || 
                typeof voice.startPhraseIdx !== 'number' ||
                typeof voice.fxParams !== 'object') {
              throw new Error('Invalid voice format in snapshot')
            }
          }
        }
        
        appState.snapshots = loadedSnapshots
        selectedSnapshot.value = -1 // Reset selection
        console.log(`Loaded ${loadedSnapshots.length} snapshots from file`)
        
      } catch (error) {
        console.error('Error loading snapshots:', error)
        alert(`Error loading snapshots: ${error.message}`)
      }
    }
    
    reader.readAsText(file)
  }
  
  input.click()
}

onMounted(async() => {
  try {
    // Initialize test piano roll
    testPianoRoll = new PianoRoll<{}>('testPianoRollHolder', () => {}, () => {}, true)
    
    await MIDI_READY
    console.log('midi ready')
    await INITIALIZE_ABLETON_CLIPS('src/sketches/sonar_sketch/piano_melodies Project/piano_melodies.als', staticClipData, false)
    console.log('clips ready')
    await TONE_AUDIO_START
    console.log('tone ready')

    console.log('midi, clips, tone ready')

    const iac1 = midiOutputs.get('IAC Driver Bus 1')
    const iac2 = midiOutputs.get('IAC Driver Bus 2')
    const iac3 = midiOutputs.get('IAC Driver Bus 3')
    const iac4 = midiOutputs.get('IAC Driver Bus 4')

        
    midiOuts.push(iac1, iac2, iac3, iac4)

    // Initialize any missing FX parameters based on the available parameter names
    if (instrumentChains.length > 0) {
      
      appState.voices.forEach((voice, i) => {
        const availableParams = instrumentChains[i].paramNames
        availableParams.forEach(paramName => {
          if (voice.saveable.fxParams[paramName] === undefined) {
            voice.saveable.fxParams[paramName] = instrumentChains[i].defaultParams[paramName];
          }
        });
      });
    }

    const lpd8 = midiInputs.get("LPD8 mk2")
    const midiNorm = (val: number) => val / 127
    if (lpd8) {
      Array.from({ length: 8 }, (_, i) => i).forEach(ind => {
        lpd8.onControlChange(ind + 70, (msg) => {
          appState.sliders[ind] = (midiNorm(msg.data2))
        })
      })
    }

    const playNoteMidi = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, voiceIdx: number) => {
      const inst = midiOuts[voiceIdx]
      inst.sendNoteOn(pitch, velocity)
      ctx.branch(async ctx => {
        await ctx.wait((noteDur ?? 0.1) * 0.98)
        inst.sendNoteOff(pitch)
      }).finally(() => {
        // console.log('loop canclled finally', pitch) //todo core - need to cancel child contexts properly (this doesn't fire immediately on parent cancel)
        inst.sendNoteOff(pitch)
      })
    }


    const playNotePiano = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, pianoIndex = 0) => {
      // // Update the FX parameters before playing the note
      // updatePianoFX(pianoIndex);
      
      const piano = instrumentChains[mod2(pianoIndex, instrumentChains.length)].instrument
      //todo - get this to use duration and have midi output signature for consistency
      // const bpm = ctx.bpm
      // const dur = noteDur * (60 / bpm)
      // piano.triggerAttackRelease([m2f(pitch)], dur, null, velocity)
      piano.triggerAttack([m2f(pitch)], Tone.now(), velocity/127)
      ctx.branch(async ctx => {
        await ctx.wait(noteDur)
        piano.triggerRelease(m2f(pitch))
      }).finally(() => {
        piano.triggerRelease(m2f(pitch))
      })
    }

    playNote = playNotePiano

    // Initialize FX parameters for all voices
    // appState.voices.forEach((_, idx) => updatePianoFX(idx))

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement
    
    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)
    
    appState.drawFunctions.push((p: p5) => {
    })

    console.log('pre launch loop')

    launchLoop(async (ctx) => {

      console.log('launch loop')

      // eslint-disable-next-line no-constant-condition
      while (true) {
        console.log('launchQueue', launchQueue.length)
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
  
  <!-- Transform Test Section -->
  <div class="test-section">
    <h3>Transform Test</h3>
    <div class="test-controls">
      <input 
        type="text" 
        v-model="testTransformInput" 
        placeholder="clipName : transform args"
        class="test-input"
      />
      <button @click="testTransform" class="test-button">Test Transform</button>
    </div>
    <div class="test-piano-roll">
      <div id="testPianoRollHolder"></div>
    </div>
  </div>
  
  <div class="sliders-row">
    <div class="slider-column" v-for="(slider, idx) in appState.sliders" :key="idx">
      <div>{{ appState.sliders[idx] }}</div>
      <input type="range" v-model.number="appState.sliders[idx]" min="0" max="1" step="0.0001" />
      <label>slider {{ idx + 1 }}</label>
    </div>
  </div>
  <div class="livecode-container">
    <div class="global-controls">
      <button @click="playCued">Play Cued</button>
      <button @click="stopAll">Stop All</button>
      <div class="snapshot-controls">
        <button @click="saveSnapshot">Save Snapshot</button>
        <select v-model="selectedSnapshot" @change="() => loadSnapshotStateOnly(parseInt(selectedSnapshot.toString()))">
          <option value="-1">Select Snapshot</option>
          <option v-for="(snapshot, idx) in appState.snapshots" :key="idx" :value="idx">
            Snapshot {{ idx + 1 }}
          </option>
        </select>
        <button @click="saveSnapshotsToFile" :disabled="appState.snapshots.length === 0">Export to File</button>
        <button @click="loadSnapshotsFromFile">Import from File</button>
      </div>
    </div>
    <div
      v-for="(voice, idx) in appState.voices"
      :key="idx"
      class="voice-column"
    >
      <h3>Voice {{ idx + 1 }}</h3>
      <div class="controls">
        <button @click="togglePlay(idx)">
          {{ voice.isPlaying ? 'Stop' : 'Play' }}
        </button>
        <label>
          <input type="checkbox" v-model="voice.isLooping"/>
          Loop
        </label>
        <label>
          <input type="checkbox" v-model="voice.isCued"/>
          Cue
        </label>
        <label>
          <input type="number" class="start-phrase-idx-input" v-model.number="voice.saveable.startPhraseIdx"/>
          Start Phrase Index
        </label>
      </div>
      <details v-if="!voice.isPlaying" open class="text-display">
        <summary>Slice Editor</summary>
        <textarea
          v-model="voice.saveable.sliceText"
          placeholder="clipName : seg 1 : s_tr 2 : str 0.5 : q 1"
          rows="10"
        />
      </details>
      <details v-else open class="text-display">
        <summary>Now Playing</summary>
        <div class="display-text">
          <div
            v-for="(line, lIdx) in voice.playingText.split('\n')"
            :key="lIdx"
            :class="{ highlight: lIdx === voice.playingLineIdx }"
          >
            {{ line }}
          </div>
        </div>
      </details>
      
      <details open class="fx-controls">
        <summary>FX Controls</summary>
        <div class="fx-sliders">
          <div 
            v-for="paramName in instrumentChains[idx].paramNames" 
            :key="paramName" 
            class="fx-slider"
          >
            <label>{{ formatParamName(paramName) }}: {{ getScaledParamValue(paramName, instrumentChains[idx].paramScaling, voice.saveable.fxParams[paramName] ?? 0).toFixed(3) }}</label>
            <input 
              type="range" 
              v-model.number="voice.saveable.fxParams[paramName]" 
              min="0" 
              max="1" 
              step="0.001" 
              @input="updatePianoFX(idx, paramName)" 
            />
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.sliders-row {
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #444;
}

.slider-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  font-size: 0.8rem;
  color: #e0e0e0;
}

.slider-column div {
  font-family: monospace;
  font-size: 0.7rem;
  min-height: 1rem;
  color: #f0f0f0;
}

.slider-column label {
  color: #d0d0d0;
  font-size: 0.7rem;
}

.start-phrase-idx-input {
  width: 2rem;
  padding: 0.1rem;
  font-size: 0.8rem;
  background: #2a2a2a;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 2px;
}

/* Custom vertical slider styling for general sliders */
input[type=range] {
  writing-mode: vertical-lr;
  direction: rtl;
  vertical-align: middle;
  height: 100px;
  width: 4px;
  background: #888; /* Fallback background */
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 10px;
}

/* WebKit browsers (Chrome, Safari, Edge) */
input[type=range]::-webkit-slider-track {
  width: 60px; /* Note: for vertical sliders, width becomes height */
  height: 2px; /* Made narrower: was 4px, now 2px */
  background: linear-gradient(to bottom, #bbb 0%, #999 100%);
  border-radius: 1px;
  border: none;
}

input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 14px; /* Slightly smaller to match thinner track */
  width: 14px;
  border-radius: 50%;
  background: #6a9bd1;
  cursor: pointer;
  border: 2px solid #4a7ba7;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

input[type=range]::-webkit-slider-thumb:hover {
  background: #7ba9d9;
  box-shadow: 0 3px 6px rgba(0,0,0,0.4);
}

/* Firefox */
input[type=range]::-moz-range-track {
  width: 60px;
  height: 2px; /* Made narrower: was 4px, now 2px */
  background: linear-gradient(to bottom, #bbb 0%, #999 100%);
  border-radius: 1px;
  border: none;
}

input[type=range]::-moz-range-thumb {
  height: 14px; /* Slightly smaller to match thinner track */
  width: 14px;
  border-radius: 50%;
  background: #6a9bd1;
  cursor: pointer;
  border: 2px solid #4a7ba7;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

input[type=range]::-moz-range-thumb:hover {
  background: #7ba9d9;
}

.break-row {
  height: 0.5rem;
}

.livecode-container {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.global-controls {
  width: 100%;
  margin-bottom: 0.5rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.snapshot-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.snapshot-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #2a2a2a;
}

.snapshot-controls button:disabled:hover {
  background: #2a2a2a;
}

.snapshot-controls select {
  padding: 0.2rem 0.3rem;
  background: #2a2a2a;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 2px;
  font-size: 0.85rem;
  cursor: pointer;
}

.snapshot-controls select:focus {
  outline: none;
  border-color: #6a9bd1;
}

.voice-column {
  flex: 0 0 calc(50% - 0.25rem);
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
  border: 1px solid #555;
  padding: 0.5rem;
  border-radius: 4px;
  background: #1e1e1e;
}

.voice-column h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #f0f0f0;
}

.voice-column textarea {
  width: 100%;
  resize: vertical;
  font-family: monospace;
  min-height: 120px;
  font-size: 0.85rem;
  padding: 0.25rem;
  border: 1px solid #555;
  border-radius: 2px;
  background: #2a2a2a;
  color: #e0e0e0;
}

.voice-column textarea::placeholder {
  color: #888;
}

.controls {
  margin: 0.25rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.controls label {
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: #e0e0e0;
}

button {
  padding: 0.2rem 0.5rem;
  font-size: 0.85rem;
  border: 1px solid #555;
  border-radius: 2px;
  background: #333;
  color: #e0e0e0;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover {
  background: #444;
}

.text-display {
  margin: 0.25rem 0;
}

.text-display summary {
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 0.25rem;
  color: #f0f0f0;
}

.display-text {
  font-family: monospace;
  font-size: 0.8rem;
  line-height: 1.2;
  background: #2a2a2a;
  color: #e0e0e0;
  padding: 0.25rem;
  border-radius: 2px;
  max-height: 150px;
  overflow-y: auto;
}

.display-text .highlight {
  background-color: #4a5c2a;
  color: #f0f0f0;
  padding: 0 0.1rem;
}

.fx-controls {
  margin-top: 0.25rem;
}

.fx-controls summary {
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 0.25rem;
  color: #f0f0f0;
}

.fx-sliders {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.fx-slider {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-size: 0.8rem;
}

.fx-slider label {
  margin-bottom: 0.1rem;
  font-size: 0.75rem;
  color: #d0d0d0;
}

/* Horizontal slider styling for FX controls */
.fx-slider input[type=range] {
  writing-mode: horizontal-tb;
  direction: ltr;
  width: 100%;
  height: 4px;
  background: #888; /* Fallback background */
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 10px;
}

.fx-slider input[type=range]::-webkit-slider-track {
  width: 100%;
  height: 2px; /* Made narrower: was 4px, now 2px */
  background: linear-gradient(to right, #bbb 0%, #999 100%);
  border-radius: 1px;
  border: none;
}

.fx-slider input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 14px; /* Slightly smaller to match thinner track */
  width: 14px;
  border-radius: 50%;
  background: #6a9bd1;
  cursor: pointer;
  border: 2px solid #4a7ba7;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.fx-slider input[type=range]::-webkit-slider-thumb:hover {
  background: #7ba9d9;
  box-shadow: 0 3px 6px rgba(0,0,0,0.4);
}

.fx-slider input[type=range]::-moz-range-track {
  width: 100%;
  height: 2px; /* Made narrower: was 4px, now 2px */
  background: linear-gradient(to right, #bbb 0%, #999 100%);
  border-radius: 1px;
  border: none;
}

.fx-slider input[type=range]::-moz-range-thumb {
  height: 14px; /* Slightly smaller to match thinner track */
  width: 14px;
  border-radius: 50%;
  background: #6a9bd1;
  cursor: pointer;
  border: 2px solid #4a7ba7;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.fx-slider input[type=range]::-moz-range-thumb:hover {
  background: #7ba9d9;
}

/* Global input styling */
input[type=checkbox] {
  margin: 0;
  accent-color: #6a9bd1;
}

input[type=number] {
  border: 1px solid #555;
  border-radius: 2px;
  padding: 0.1rem;
  background: #2a2a2a;
  color: #e0e0e0;
}

details {
  border: 1px solid #555;
  border-radius: 2px;
  padding: 0.25rem;
  margin: 0.1rem 0;
  background: #252525;
}

details[open] {
  background: #2a2a2a;
}

details summary {
  color: #f0f0f0;
}

/* Test Section Styles */
.test-section {
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #444;
}

.test-section h3 {
  margin: 0 0 0.5rem 0;
  color: #f0f0f0;
  font-size: 1rem;
}

.test-controls {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  align-items: center;
}

.test-input {
  flex: 1;
  padding: 0.3rem;
  background: #2a2a2a;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 2px;
  font-family: monospace;
  font-size: 0.85rem;
}

.test-input:focus {
  outline: none;
  border-color: #6a9bd1;
}

.test-button {
  padding: 0.3rem 0.6rem;
  background: #333;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 2px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}

.test-button:hover {
  background: #444;
}

.test-piano-roll {
  min-height: 200px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

/* Scrollbar styling for dark theme */
.display-text::-webkit-scrollbar {
  width: 6px;
}

.display-text::-webkit-scrollbar-track {
  background: #333;
  border-radius: 3px;
}

.display-text::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.display-text::-webkit-scrollbar-thumb:hover {
  background: #666;
}
</style>