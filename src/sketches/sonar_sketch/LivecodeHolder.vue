<!-- eslint-disable no-debugger -->
<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type SonarAppState, appStateName, type VoiceState, globalStore, type SaveableProperties } from './appState';
import { inject, onMounted, onUnmounted, reactive, ref, computed, watch, nextTick } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { AbletonClip, clipMap, INITIALIZE_ABLETON_CLIPS, type AbletonNote, quickNote } from '@/io/abletonClips';
import { MIDI_READY, midiInputs, midiOutputs } from '@/io/midi';
import { getPiano, getPianoChain, TONE_AUDIO_START, getSynthChain, getDriftChain } from '@/music/synths';
import { m2f } from '@/music/mpeSynth';
import { clipData as staticClipData } from './clipData';
import type { MIDIValOutput } from '@midival/core';
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll'
import * as Tone from 'tone'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { buildClipFromLine, splitTextToGroups, generateUUID, findLineCallMatches, preprocessJavaScript, transformToRuntime, createExecutableFunction, resolveSliderExpressionsInJavaScript, type UUIDMapping, computeDisplayTextForVoice, parseRampLine, analyzeExecutableLines } from './utils/transformHelpers'
import { monacoEditors, codeMirrorEditors, setCodeMirrorContent, highlightCurrentLine, highlightScheduledLines, initializeMonacoEditorComplete, initializeCodeMirrorEditorComplete, highlightCurrentLineByUUID, applyScheduledHighlightByUUID, handleDslLineClick, setPianoRollFromDslLine   } from './utils/editorManager'
import { saveSnapshot as saveSnapshotSM, loadSnapshotStateOnly as loadSnapshotStateOnlySM, downloadSnapshotsFile, loadSnapshotsFromFile as loadSnapshotsFromFileSM, saveToLocalStorage as saveToLocalStorageSM, loadFromLocalStorage as loadFromLocalStorageSM, saveBank, loadBank, makeBankClickHandler, saveTopLevelSliderBank as saveTopLevelSliderBankSM, loadTopLevelSliderBank as loadTopLevelSliderBankSM, saveFxSliderBank as saveFxSliderBankSM, loadFxSliderBank as loadFxSliderBankSM, saveTopLevelToggleBank as saveTopLevelToggleBankSM, loadTopLevelToggleBank as loadTopLevelToggleBankSM } from './utils/snapshotManager'

// Monaco environment setup
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new TsWorker();
    }
    return new EditorWorker();
  }
};

const appState = inject<SonarAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

// Editor state - arrays to handle multiple voices
const isJavascriptMode = ref(true)
const showInputEditor = ref([true, true, true, true]) // Per-voice input editor visibility


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


// Slider bank management wrappers
const saveTopLevelSliderBank = (idx:number)=> saveTopLevelSliderBankSM(appState, idx)
const loadTopLevelSliderBank = (idx:number)=> loadTopLevelSliderBankSM(appState, idx)

// Toggle bank management wrappers
const saveTopLevelToggleBank = (idx:number)=> saveTopLevelToggleBankSM(appState, idx)
const loadTopLevelToggleBank = (idx:number)=> loadTopLevelToggleBankSM(appState, idx)

const saveFxSliderBank = (voiceIdx:number, bankIdx:number)=> saveFxSliderBankSM(appState, voiceIdx, bankIdx)
const loadFxSliderBank = (voiceIdx:number, bankIdx:number)=> loadFxSliderBankSM(appState, voiceIdx, bankIdx, updateFxParams)

const handleFxBankClick = (voiceIndex: number, bankIndex: number, event: MouseEvent) => {
  makeBankClickHandler(
    (idx) => saveFxSliderBank(voiceIndex, idx),
    (idx) => loadFxSliderBank(voiceIndex, idx),
    (idx) => appState.voices[voiceIndex].currentFxBank = idx,
  )(bankIndex, event)
}

const handleTopLevelBankClick = makeBankClickHandler(
  (idx) => {
    saveTopLevelSliderBank(idx)
    saveTopLevelToggleBank(idx)
  },
  (idx) => {
    loadTopLevelSliderBank(idx)
    loadTopLevelToggleBank(idx)
  },
  (idx) => appState.currentTopLevelBank = idx,
)

// Snapshot wrappers using snapshotManager
const saveSnapshot = () => saveSnapshotSM(appState)

const loadSnapshotStateOnly = (ind:number)=> loadSnapshotStateOnlySM(appState, ind, updateFxParams)

const testTransform = () => {
  // For testing, just use the first group's clipLine
  const groups = splitTextToGroups(testTransformInput.value)
  if (!groups.length) return
  
  const { clip } = buildClipFromLine(groups[0].clipLine, appState.sliders)
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


const launchParamRamp = (paramName: string, startVal: number, endVal: number, duration: number, voiceIdx: number, ctx: TimeContext) => {
  const startBeats = ctx.beats
  const ramp = ctx.branch(async (ctx) => {
    // console.log("ramp", paramName, startVal, endVal, duration)
    while (ctx.beats < startBeats + duration) {
      const progress = (ctx.beats - startBeats) / duration
      const val = startVal + (endVal - startVal) * progress

      const voice = appState.voices[voiceIdx]
      const instrumentChain = instrumentChains[mod2(voiceIdx, instrumentChains.length)];
      const paramFunc = instrumentChain.paramFuncs[paramName]
      // console.log("ramp", paramName, val, paramFunc)
      if (!paramFunc) return
      voice.saveable.fxParams[paramName] = val
      paramFunc(val)
      await ctx.wait(0.016)
    }
  })
  return ramp
}

const playClips = async (
  groups: { clipLine: string, rampLines: string[] }[],
  ctx: TimeContext,
  voiceIdx: number,
  voiceState: VoiceState,
  firstLoop: boolean
) => {
  const displayGroups = groups.map(g => ({...g}))
  voiceState.playingText = computeDisplayTextForVoice(voiceState, appState)

  // Build map of group index to clipLine display index once before the loop
  const buildGroupToLineIndexMap = (groups: { clipLine: string, rampLines: string[] }[]) => {
    const map = new Map<number, number>();
    let lineIndex = 0;
    for (let i = 0; i < groups.length; i++) {
      map.set(i, lineIndex);
      lineIndex += 1; // for the clipLine
      lineIndex += groups[i].rampLines.length; // for the rampLines
    }
    return map;
  }

  let groupToLineIndexMap = buildGroupToLineIndexMap(displayGroups);

  for (const [idx, group] of groups.entries()) {
    if (firstLoop && idx < voiceState.saveable.startPhraseIdx) continue //note this comes from a v-model.number on a text input, could have wierd edge cases

    if (!voiceState.isPlaying) break
    
    // Look up the display line index from the pre-built map
    voiceState.playingLineIdx = groupToLineIndexMap.get(idx)!

    const { clip: curClip, updatedClipLine } = buildClipFromLine(group.clipLine, appState.sliders)
    if (!curClip) continue

    // Update the display group with the processed clip line
    displayGroups[idx] = { clipLine: updatedClipLine, rampLines: group.rampLines }

    const notes = curClip.noteBuffer()
    const ramps = group.rampLines.map(parseRampLine).map(r => launchParamRamp(r.paramName, r.startVal, r.endVal, curClip.duration, voiceIdx, ctx))
    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta)
      if (!voiceState.isPlaying) {
        ramps.forEach(r => r.cancel())
        break
      }
      playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, voiceIdx)
      if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
    }
    if (!voiceState.isPlaying) {
      ramps.forEach(r => r.cancel())
      break
    }
  }
  voiceState.playingLineIdx = -1
}

// Editor initialization wrappers
const initializeMonacoEditor = (containerId: string, voiceIndex: number) => {
  initializeMonacoEditorComplete(
    containerId,
    voiceIndex,
    () => appState.voices[voiceIndex].saveable.jsCode,
    (code, vIdx) => { appState.voices[vIdx].saveable.jsCode = code },
    setCodeMirrorContent
  )
}



const initializeCodeMirrorEditor = (containerId: string, voiceIndex: number) => {
  initializeCodeMirrorEditorComplete(
    containerId,
    voiceIndex,
    () => monacoEditors[voiceIndex]?.getValue() || '',
    (lc, ln, vIdx) => handleDslLineClick(lc, ln, vIdx, appState, debugPianoRolls)
  )
}

const switchToInputMode = (voiceIndex: number) => {
  showInputEditor.value[voiceIndex] = true
  // Copy content from CodeMirror to Monaco if needed
}

const switchToVisualizeMode = (voiceIndex: number) => {
  showInputEditor.value[voiceIndex] = false
  // Copy content from Monaco to CodeMirror
  const monacoEditor = monacoEditors[voiceIndex]
  const codeMirrorEditor = codeMirrorEditors[voiceIndex]
  
  if (monacoEditor && codeMirrorEditor) {
    const content = monacoEditor.getValue()

    //transform source to reflect slider values
    const sliderResolvedCode = resolveSliderExpressionsInJavaScript(content, appState.sliders)
    setCodeMirrorContent(voiceIndex, sliderResolvedCode)

    // Analyze and highlight scheduled lines (returns UUIDs)
    const { executedUUIDs, mappings, visualizeCode } = analyzeExecutableLines(content, voiceIndex, appState, uuidMappings)
    applyScheduledHighlightByUUID(voiceIndex, executedUUIDs, voiceScheduledUUIDs, getMappingsForVoice)
  }
}

// Code transformation pipeline
const uuidMappings = new Map<string, UUIDMapping[]>() // voiceIndex -> mappings
const voiceActiveUUIDs = new Map<string, string>() // voiceIndex -> UUID for currently playing line
const voiceScheduledUUIDs = new Map<string, string[]>() // voiceIndex -> UUIDs for scheduled lines
const voiceExecutableFuncs = new Map<string, Function>() // voiceIndex -> executable function

// Helper to get mappings for a voice
const getMappingsForVoice = (voiceIndex: number): UUIDMapping[] => {
  return uuidMappings.get(voiceIndex.toString()) || []
}




// runLine function - executes livecoding lines and manages highlighting
const runLine = async (lineText: string, ctx: TimeContext, uuid: string, voiceIndex: number) => {
  // Highlight the current line being executed using UUID
  highlightCurrentLineByUUID(voiceIndex, uuid, voiceActiveUUIDs, getMappingsForVoice)
  
  try {
    // Parse the line using existing parsing logic
    const groups = splitTextToGroups(lineText)
    if (!groups.length) return
    
    const group = groups[0] // runLine handles one group at a time
    const { clip: curClip, updatedClipLine } = buildClipFromLine(group.clipLine, appState.sliders)
    if (!curClip) return
    
    // Execute the clip similar to existing playClips logic
    const notes = curClip.noteBuffer()
    const ramps = group.rampLines.map(parseRampLine).map(r => 
      launchParamRamp(r.paramName, r.startVal, r.endVal, curClip.duration, voiceIndex, ctx)
    )
    
    // Play the notes
    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta)
      
      // Check if voice is still playing
      const voice = appState.voices[voiceIndex]
      if (!voice.isPlaying) {
        ramps.forEach(r => r.cancel())
        break
      }
      
      playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, voiceIndex)
      if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
    }
    
    // Clean up ramps if we completed normally
    if (appState.voices[voiceIndex].isPlaying) {
      // Let ramps complete naturally
    } else {
      ramps.forEach(r => r.cancel())
    }
    
  } catch (error) {
    console.error('Error in runLine:', error)
  } finally {
    // Clear current line highlighting after execution
    highlightCurrentLineByUUID(voiceIndex, null, voiceActiveUUIDs, getMappingsForVoice)
  }
}

const startVoice = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx]

  const playOnce = async (ctx: TimeContext, firstLoop: boolean) => {
    if (isJavascriptMode.value) {
      // JavaScript mode execution
      const monacoEditor = monacoEditors[voiceIdx]
      if (!monacoEditor) return
      
      const jsCode = monacoEditor.getValue()
      if (!jsCode.trim()) return
      
      // Switch to visualize mode when starting playback
      if (firstLoop) {
        switchToVisualizeMode(voiceIdx)
        
        
        const sliderResolvedCode = resolveSliderExpressionsInJavaScript(jsCode, appState.sliders)
        setCodeMirrorContent(voiceIdx, sliderResolvedCode)

        // Analyze and highlight scheduled lines (returns UUIDs)
        //todo - using a seeded random number generator here would make this work properly with "randomness"
        const { executedUUIDs, mappings, visualizeCode } = analyzeExecutableLines(jsCode, voiceIdx, appState, uuidMappings)
        applyScheduledHighlightByUUID(voiceIdx, executedUUIDs, voiceScheduledUUIDs, getMappingsForVoice)
        // Create executable function
        const { executableFunc } = createExecutableFunction(visualizeCode, mappings, voiceIdx)
        if (!executableFunc) {
          console.error('Failed to create executable function for voice', voiceIdx)
          return
        }
        voiceExecutableFuncs.set(voiceIdx.toString(), executableFunc)
      }
      
      
      
      try {
        // Execute the JavaScript code with proper context
        await voiceExecutableFuncs.get(voiceIdx.toString())(ctx, runLine, appState.toggles) 
      } catch (error) {
        console.error('Error executing JavaScript code:', error)
      }
      
    } else {
      // Original text mode execution
      const groups = splitTextToGroups(v.saveable.sliceText)
      if (!groups.length || !midiOuts[voiceIdx]) return
      await playClips(groups, ctx, voiceIdx, v, firstLoop)
    }
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
        switchToInputMode(voiceIdx)
      })
    })
  } else {
    launchQueue.push(async (ctx) => {
      await playOnce(ctx, true)
      v.isPlaying = false
      switchToInputMode(voiceIdx)
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
  
  // Switch back to input mode when stopping in JavaScript mode
  if (isJavascriptMode.value) {
    switchToInputMode(voiceIdx)
    // Clear all highlighting
    applyScheduledHighlightByUUID(voiceIdx, [], voiceScheduledUUIDs, getMappingsForVoice)
    highlightCurrentLineByUUID(voiceIdx, null, voiceActiveUUIDs, getMappingsForVoice)
  }
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

const instrumentChains = [getPianoChain(), getSynthChain(), getDriftChain(1), getDriftChain(2)]

// Piano roll test section state
const testTransformInput = ref('clip1 : arp up s1*0.5+0.1 s2^2 0 1')
let testPianoRoll: PianoRoll<{}> | undefined = undefined

// Debug piano rolls - one per voice
const debugPianoRolls: (PianoRoll<{}> | undefined)[] = []

// Snapshot selection state
const selectedSnapshot = ref(-1)

// Function to get a readable name for each parameter
const formatParamName = (paramName: string) => {
  return paramName
  // return paramName
  //   .replace(/([A-Z])/g, ' $1') // Add space before capital letters
  //   .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
};

// Function to get scaled parameter value using the modular scaling functions
const getScaledParamValue = (paramName, paramScaling: Record<string, (val: number) => number>, normalizedValue: number): number => {
  const val = paramScaling[paramName]?.(normalizedValue) ?? normalizedValue;
  if (val === undefined) debugger;
  return val
}

// Function to update piano FX parameters
const updateFxParams = (voiceIdx: number, paramName?: string) => {
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

const saveSnapshotsToFile = () => downloadSnapshotsFile(appState.snapshots)

const loadSnapshotsFromFile = () => loadSnapshotsFromFileSM((snaps)=>{ appState.snapshots = snaps; selectedSnapshot.value=-1 })

const saveToLocalStorage = () => saveToLocalStorageSM(appState)

const loadFromLocalStorage = () => loadFromLocalStorageSM(appState)

function refreshEditorsFromState() {
  // Ensure Monaco & CodeMirror editors reflect current jsCode strings
  appState.voices.forEach((voice, vIdx) => {
    const jsCode = voice.saveable.jsCode || ''

    const monacoEd = monacoEditors[vIdx]
    if (monacoEd && monacoEd.getValue() !== jsCode) {
      monacoEd.setValue(jsCode)
    }

    const cmEd = codeMirrorEditors[vIdx]
    if (cmEd) {
      setCodeMirrorContent(vIdx, jsCode)
    }
  })
}

onMounted(async() => {
  try {
    // Initialize editors for all voices
    await nextTick() // Ensure DOM is ready
    for (let i = 0; i < appState.voices.length; i++) {
      initializeMonacoEditor(`monacoEditorContainer-${i}`, i)
      initializeCodeMirrorEditor(`codeMirrorEditorContainer-${i}`, i)
    }

    // Load from localStorage first (both snapshots and current state)
    loadFromLocalStorage()
    // Refresh editors to show restored JavaScript code
    refreshEditorsFromState()
    
    // Initialize test piano roll
    testPianoRoll = new PianoRoll<{}>('testPianoRollHolder', () => {}, () => {}, true)
    
    // Initialize debug piano rolls for each voice
    for (let i = 0; i < appState.voices.length; i++) {
      const containerId = `dslPianoRoll-${i}`
      debugPianoRolls[i] = new PianoRoll<{}>(containerId, () => {}, () => {}, true)
    }
    
    await MIDI_READY
    console.log('midi ready')
    await INITIALIZE_ABLETON_CLIPS('src/sketches/sonar_sketch/piano_melodies Project/piano_melodies_mapped.als', staticClipData, false)
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
      
      // Initialize FX banks for each voice with proper parameter structure
      appState.voices.forEach((voice, voiceIndex) => {
        if (voiceIndex < instrumentChains.length) {
          const availableParams = instrumentChains[voiceIndex].paramNames
          voice.saveable.fxBanks.forEach((bank) => {
            availableParams.forEach(paramName => {
              if (bank[paramName] === undefined) {
                bank[paramName] = instrumentChains[voiceIndex].defaultParams[paramName];
              }
            });
          });
        }
      });
    }

    const lpd8 = midiInputs.get("LPD8 mk2")
    const lpdButtonMap = [40, 41, 42, 43, 36, 37, 38, 49]
    const midiNorm = (val: number) => Math.floor(val / 127 * 1000) / 1000
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
      // const bpm = ctx.bpm
      // const dur = noteDur * (60 / bpm)
      // piano.triggerAttackRelease([m2f(pitch)], dur, null, velocity)
      piano.triggerAttack([m2f(pitch)], Tone.now(), velocity/127)
      ctx.branch(async ctx => {
        await ctx.wait(noteDur * 0.98)
        piano.triggerRelease(m2f(pitch))
      }).finally(() => {
        piano.triggerRelease(m2f(pitch))
      })
    }

    playNote = playNoteMidi

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
        // console.log('launchQueue', launchQueue.length)
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
 
    // Set up auto-save interval (2 seconds) - now saves both snapshots and current state
    const autoSaveInterval = setInterval(saveToLocalStorage, 2000)
    
    // Store interval ID for cleanup
    appState.autoSaveInterval = autoSaveInterval
  } catch (e) {
    console.warn(e)
  }

})


onUnmounted(() => {
  console.log("disposing livecoded resources")
  
  // Clean up auto-save interval
  if (appState.autoSaveInterval) {
    clearInterval(appState.autoSaveInterval)
  }
  
  // Clean up editors
  monacoEditors.forEach(editor => editor?.dispose())
  codeMirrorEditors.forEach(editor => editor?.destroy())
  
  // Clean up debug piano rolls
  debugPianoRolls.length = 0
  
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
})


// ---------------------------------------------------------------------------
//  Debounced, reactive computation of the display text for every voice
// ---------------------------------------------------------------------------

// Simple debounce helper (no external dependency)
function debounce<T extends (...args: any[]) => void>(fn: T, waitMs: number): T {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return function(this: any, ...args: any[]) {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => fn.apply(this, args), waitMs)
  } as T
}





// Enhanced update function that handles both text display and CodeMirror
const updateVoiceOnSliderChange = (voiceIndex: number) => {
  const voice = appState.voices[voiceIndex]
  
  // Update the old text display (for non-JavaScript mode)
  voice.playingText = computeDisplayTextForVoice(voice, appState)
  
  // Update CodeMirror editor if in JavaScript mode and it exists
  const codeMirrorEditor = codeMirrorEditors[voiceIndex]
  if (codeMirrorEditor && isJavascriptMode.value) {
    // Get the original Monaco content (with raw slider expressions)
    const monacoEditor = monacoEditors[voiceIndex]
    if (monacoEditor) {
      const originalJsCode = monacoEditor.getValue()
      
      // Resolve slider expressions in the JavaScript code
      const resolvedJsCode = resolveSliderExpressionsInJavaScript(originalJsCode, appState.sliders)
      
      // Check if content has actually changed to avoid unnecessary updates
      const currentContent = codeMirrorEditor.state.doc.toString()
      if (currentContent !== resolvedJsCode) {
        setCodeMirrorContent(voiceIndex, resolvedJsCode)

        // Re-apply scheduled line decorations if they were active
        const scheduledUUIDs = voiceScheduledUUIDs.get(voiceIndex.toString())
        if (scheduledUUIDs && scheduledUUIDs.length > 0) {
          applyScheduledHighlightByUUID(voiceIndex, scheduledUUIDs, voiceScheduledUUIDs, getMappingsForVoice)
        }

        // Re-apply current line decorations if they were active
        const activeUUID = voiceActiveUUIDs.get(voiceIndex.toString())
        if (activeUUID) {
          highlightCurrentLineByUUID(voiceIndex, activeUUID, voiceActiveUUIDs, getMappingsForVoice)
        }
      }
    }
  }
}

const updateVoiceOnToggleChange = (voiceIndex: number) => {
  const jsCode = monacoEditors[voiceIndex].getValue()
  const { executedUUIDs } = analyzeExecutableLines(jsCode, voiceIndex, appState, uuidMappings)
  applyScheduledHighlightByUUID(voiceIndex, executedUUIDs, voiceScheduledUUIDs, getMappingsForVoice)
}

// Set up a debounced watcher per-voice that recomputes the display text at
// most 10×/second whenever its slice definition OR any slider value changes.
appState.voices.forEach((voice, vIdx) => {
  const debouncedUpdate = debounce(() => {
    updateVoiceOnSliderChange(vIdx)
  }, 100) // 100 ms → 10 Hz max

  // Initial computation
  debouncedUpdate() //todo is this needed?

  // React to changes in the slice text of THIS voice …
  watch(
    () => voice.saveable.sliceText,
    () => debouncedUpdate()
  )

  // …and to any change in the global slider array
  watch(
    () => appState.sliders,
    () => debouncedUpdate(),
    { deep: true }
  )

  // …and to any change in the global toggle array
  watch(
    () => appState.toggles,
    () => updateVoiceOnToggleChange(vIdx),
    { deep: true }
  )
})

// Update FX parameters for all voices
appState.voices.forEach((_, idx) => updateFxParams(idx))



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
  
  <!-- Top Level Slider & Toggle Banks -->
  <div class="slider-banks-section">
    <h4>Top Level Banks (Click: Load, Shift+Click: Save) - Saves/Loads Both Sliders & Toggles</h4>
    <div class="top-level-bank-buttons">
      <button 
        v-for="bankIdx in 8" 
        :key="bankIdx"
        :class="{ 'active': appState.currentTopLevelBank === bankIdx - 1 }"
        @click="handleTopLevelBankClick(bankIdx - 1, $event)"
      >
        {{ bankIdx }}
      </button>
    </div>
  </div>
  
  <div class="sliders-row">
    <div class="slider-column" v-for="(slider, idx) in appState.sliders" :key="idx">
      <div>{{ appState.sliders[idx] }}</div>
      <input type="range" v-model.number="appState.sliders[idx]" min="0" max="1" step="0.0001" />
      <label>slider {{ idx + 1 }}</label>
    </div>
  </div>

  <div class="toggles-row">
    <div class="toggle-column" v-for="(toggle, idx) in appState.toggles" :key="idx">
      <div>{{ appState.toggles[idx] ? 'ON' : 'OFF' }}</div>
      <input type="checkbox" v-model="appState.toggles[idx]" />
      <label>toggle {{ idx + 1 }}</label>
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
      <details open class="text-display">
        <summary>Slice Editor</summary>
        <div class="editor-mode-toggle">
          <button @click="isJavascriptMode = !isJavascriptMode" :class="{ active: isJavascriptMode }">
            {{ isJavascriptMode ? 'Switch to Text Mode' : 'Switch to JavaScript Mode' }}
          </button>
          <button v-if="isJavascriptMode" @click="switchToInputMode(idx)" :class="{ active: showInputEditor[idx] }">
            Input Mode
          </button>
          <button v-if="isJavascriptMode" @click="switchToVisualizeMode(idx)" :class="{ active: !showInputEditor[idx] }">
            Visualize Mode
          </button>
        </div>
        
        <div v-if="!isJavascriptMode">
          <textarea
            v-if="!voice.isPlaying"
            v-model="voice.saveable.sliceText"
            placeholder="clipName : seg 1 : s_tr 2 : str 0.5 : q 1"
            rows="10"
          />
          
          <!-- Simple text playhead display for non-JavaScript mode -->
          <details v-if="voice.isPlaying" open class="text-display">
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
        </div>
          <!-- Monaco Editor (Input) -->
          <div class="editor-container" :class="{ 'editor-hidden-opacity': !isJavascriptMode || !showInputEditor[idx] }">
            <div class="editor-header">Input Editor (JavaScript)</div>
            <div :id="`monacoEditorContainer-${idx}`" class="monaco-editor"></div>
          </div>
          
          <!-- CodeMirror Editor (Visualize) -->
          <div class="editor-container" :class="{ 'editor-hidden-opacity': !isJavascriptMode || showInputEditor[idx] }">
            <div class="editor-header">Visualize Editor (Playback)</div>
            <div :id="`codeMirrorEditorContainer-${idx}`" class="codemirror-editor"></div>
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
              @input="updateFxParams(idx, paramName)" 
            />
          </div>
        </div>
      </details>
      
      <details open class="fx-banks">
        <summary>FX Banks (Click: Load, Shift+Click: Save)</summary>
        <div class="fx-bank-buttons">
          <button 
            v-for="bankIdx in 8" 
            :key="bankIdx"
            :class="{ 'active': voice.currentFxBank === bankIdx - 1 }"
            @click="handleFxBankClick(idx, bankIdx - 1, $event)"
          >
            {{ bankIdx }}
          </button>
        </div>
      </details>
      
      <details open class="debug-piano-roll">
        <summary>Debug Piano Roll (Click DSL lines in editor to visualize)</summary>
        <div class="debug-piano-roll-container">
          <div :id="`dslPianoRoll-${idx}`" class="debug-piano-roll-viewer"></div>
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

.toggles-row {
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

.toggle-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: #e0e0e0;
  min-width: 80px;
}

.toggle-column div {
  font-family: monospace;
  font-size: 0.7rem;
  min-height: 1rem;
  color: #f0f0f0;
  font-weight: 600;
}

.toggle-column input[type=checkbox] {
  width: 20px;
  height: 20px;
  accent-color: #6a9bd1;
  cursor: pointer;
}

.toggle-column label {
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

/* FX Banks */
.fx-banks {
  margin-top: 0.25rem;
}

.fx-banks summary {
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  margin-bottom: 0.25rem;
  color: #f0f0f0;
}

.fx-bank-buttons {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}

.fx-bank-buttons button {
  width: 2rem;
  height: 2rem;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid #555;
  border-radius: 4px;
  background: #333;
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fx-bank-buttons button:hover {
  background: #444;
  border-color: #666;
}

.fx-bank-buttons button.active {
  background: #6a9bd1;
  border-color: #4a7ba7;
  color: #fff;
}

.fx-bank-buttons button.active:hover {
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

/* Slider Banks Sections */
.slider-banks-section {
  margin: 0.5rem 0;
  padding: 0.5rem;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #444;
}

.slider-banks-section h4 {
  margin: 0 0 0.5rem 0;
  color: #f0f0f0;
  font-size: 0.9rem;
  font-weight: 600;
}

.bank-controls {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.bank-selector {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.bank-selector label {
  font-size: 0.85rem;
  color: #d0d0d0;
}

.bank-selector select {
  padding: 0.2rem 0.3rem;
  background: #2a2a2a;
  border: 1px solid #555;
  color: #e0e0e0;
  border-radius: 2px;
  font-size: 0.85rem;
  cursor: pointer;
}

.bank-selector select:focus {
  outline: none;
  border-color: #6a9bd1;
}

.bank-buttons {
  display: flex;
  gap: 0.3rem;
}

.bank-buttons button {
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  border: 1px solid #555;
  border-radius: 2px;
  background: #333;
  color: #e0e0e0;
  cursor: pointer;
  transition: background 0.2s;
}

.bank-buttons button:hover {
  background: #444;
}

/* Top Level Bank Buttons */
.top-level-bank-buttons {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}

.top-level-bank-buttons button {
  width: 2rem;
  height: 2rem;
  padding: 0;
  font-size: 0.8rem;
  font-weight: 600;
  border: 1px solid #555;
  border-radius: 4px;
  background: #333;
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.top-level-bank-buttons button:hover {
  background: #444;
  border-color: #666;
}

.top-level-bank-buttons button.active {
  background: #6a9bd1;
  border-color: #4a7ba7;
  color: #fff;
}

.top-level-bank-buttons button.active:hover {
  background: #7ba9d9;
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

/* Editor styling */
.editor-mode-toggle {
  margin-bottom: 0.5rem;
}

.editor-mode-toggle button {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
  border: 1px solid #555;
  border-radius: 2px;
  background: #333;
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
}

.editor-mode-toggle button:hover {
  background: #444;
}

.editor-mode-toggle button.active {
  background: #6a9bd1;
  border-color: #4a7ba7;
  color: #fff;
}

.javascript-editors {
  border: 1px solid #555;
  border-radius: 4px;
  background: #1e1e1e;
  min-height: 300px;
}

.editor-container {
  height: 100%;
}

.editor-hidden-opacity {
  opacity: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}

.editor-header {
  padding: 0.5rem;
  background: #2a2a2a;
  border-bottom: 1px solid #555;
  font-size: 0.85rem;
  font-weight: 500;
  color: #f0f0f0;
}

.monaco-editor {
  height: 300px;
  border-radius: 0 0 4px 4px;
}

.codemirror-editor {
  border-radius: 0 0 4px 4px;
}

.codemirror-editor .cm-scroller {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

/* CodeMirror line highlighting styles */
.codemirror-editor .cm-scheduled-line {
  background-color: rgba(106, 155, 209, 0.15) !important;
  border-left: 3px solid #6a9bd1;
}

.codemirror-editor .cm-current-line {
  background-color: rgba(74, 92, 42, 0.4) !important;
  border-left: 3px solid #4a5c2a;
  animation: pulse-line 1s ease-in-out infinite alternate;
}

@keyframes pulse-line {
  from {
    background-color: rgba(74, 92, 42, 0.4);
  }
  to {
    background-color: rgba(74, 92, 42, 0.6);
  }
}

/* Debug Piano Roll styling */
.debug-piano-roll {
  margin-bottom: 10px;
}

.debug-piano-roll-container {
  background-color: #2e2e2e;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 10px;
  min-height: 200px;
  max-height: 300px;
  overflow: auto;
}

.debug-piano-roll-viewer {
  width: 100%;
  height: 100%;
  min-height: 180px;
}
</style>