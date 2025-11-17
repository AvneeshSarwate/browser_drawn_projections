<!-- eslint-disable no-debugger -->
<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type SonarAppState, appStateName, type VoiceState, globalStore, type SaveableProperties, oneshotCall, startBarrier, resolveBarrier, awaitBarrier } from './appState';
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
import { buildClipFromLine, splitTextToGroups, generateUUID, findLineCallMatches, preprocessJavaScript, transformToRuntime, createExecutableFunction, resolveSliderExpressionsInJavaScript, type UUIDMapping, parseRampLine, analyzeExecutableLines, executeParamSetterString } from './utils/transformHelpers'
import { monacoEditors, codeMirrorEditors, setCodeMirrorContent, highlightCurrentLine, highlightScheduledLines, initializeMonacoEditorComplete, initializeCodeMirrorEditorComplete, highlightCurrentLineByUUID, applyScheduledHighlightByUUID, handleDslLineClick, setPianoRollFromDslLine, clickedDslRanges, highlightClickedDsl, updateDslOutlines, clearPianoRoll, clickedDslOriginalText, clearAllDslHighlights, extractDslFromLine, clickedDslSegmentCounts, codeMirrorEditorsByName } from './utils/editorManager'
import { saveSnapshot as saveSnapshotSM, loadSnapshotStateOnly as loadSnapshotStateOnlySM, downloadSnapshotsFile, loadSnapshotsFromFile as loadSnapshotsFromFileSM, saveToLocalStorage as saveToLocalStorageSM, loadFromLocalStorage as loadFromLocalStorageSM, saveBank, loadBank, makeBankClickHandler, saveTopLevelSliderBank as saveTopLevelSliderBankSM, loadTopLevelSliderBank as loadTopLevelSliderBankSM, saveFxSliderBank as saveFxSliderBankSM, loadFxSliderBank as loadFxSliderBankSM, saveTopLevelToggleBank as saveTopLevelToggleBankSM, loadTopLevelToggleBank as loadTopLevelToggleBankSM, saveTopLevelOneShotBank as saveTopLevelOneShotBankSM, loadTopLevelOneShotBank as loadTopLevelOneShotBankSM, saveJsCodeBank as saveJsCodeBankSM, loadJsCodeBank as loadJsCodeBankSM } from './utils/snapshotManager'
import type { LoopHandle } from '@/channels/base_time_context';

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
let playNote: (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, instInd: number) => void = () => {}


// Slider bank management wrappers
const saveTopLevelSliderBank = (idx:number)=> saveTopLevelSliderBankSM(appState, idx)
const loadTopLevelSliderBank = (idx:number)=> loadTopLevelSliderBankSM(appState, idx)

// Toggle bank management wrappers
const saveTopLevelToggleBank = (idx:number)=> saveTopLevelToggleBankSM(appState, idx)
const loadTopLevelToggleBank = (idx: number) => loadTopLevelToggleBankSM(appState, idx)

// One-shot bank management wrappers
const saveTopLevelOneShotBank = (idx:number)=> saveTopLevelOneShotBankSM(appState, idx)
const loadTopLevelOneShotBank = (idx:number)=> loadTopLevelOneShotBankSM(appState, idx)

const saveFxSliderBank = (voiceIdx:number, bankIdx:number)=> saveFxSliderBankSM(appState, voiceIdx, bankIdx)
const loadFxSliderBank = (voiceIdx:number, bankIdx:number)=> loadFxSliderBankSM(appState, voiceIdx, bankIdx, updateFxParams)

const handleFxBankClick = (voiceIndex: number, bankIndex: number, event: MouseEvent) => {
  makeBankClickHandler(
    (idx) => saveFxSliderBank(voiceIndex, idx),
    (idx) => loadFxSliderBank(voiceIndex, idx),
    (idx) => appState.voices[voiceIndex].currentFxBank = idx,
  )(bankIndex, event)
}

// JS Code bank management wrappers
const saveJsCodeBank = (voiceIdx: number, bankIdx: number) => saveJsCodeBankSM(appState, voiceIdx, bankIdx)
const loadJsCodeBank = (voiceIdx: number, bankIdx: number) => loadJsCodeBankSM(appState, voiceIdx, bankIdx)

const handleJsBankClick = (voiceIndex: number, bankIndex: number, event: MouseEvent) => {
  if (event.shiftKey) {
    // Save current code to bank
    saveJsCodeBank(voiceIndex, bankIndex)
    appState.voices[voiceIndex].currentJsBank = bankIndex
  } else {
    // Load code from bank
    const v = appState.voices[voiceIndex]
    const newCode = loadJsCodeBank(voiceIndex, bankIndex)
    if (newCode === undefined) return
    
    // Set Monaco content (automatically updates saveable.jsCode via binding)
    const monacoEditor = monacoEditors[voiceIndex]
    if (monacoEditor) {
      monacoEditor.setValue(newCode)
    }
    
    if (v.isPlaying) {
      // Hot-swap path: flag for next loop (jsCode already updated by Monaco)
      v.hotSwapCued = true
    } else {
      // Immediate path: analyze if in visualize mode
      if (!showInputEditor.value[voiceIndex]) {
        switchToVisualizeMode(voiceIndex)
      }
    }
  }
}

const handleTopLevelBankClick = makeBankClickHandler(
  (idx) => {
    saveTopLevelSliderBank(idx)
    saveTopLevelToggleBank(idx)
    saveTopLevelOneShotBank(idx)
  },
  (idx) => {
    loadTopLevelSliderBank(idx)
    loadTopLevelToggleBank(idx)
    loadTopLevelOneShotBank(idx)
  },
  (idx) => appState.currentTopLevelBank = idx,
)

// Snapshot wrappers using snapshotManager
const saveSnapshot = () => saveSnapshotSM(appState)

const loadSnapshotStateOnly = (ind:number)=> loadSnapshotStateOnlySM(appState, ind, updateFxParams)


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

// Editor initialization wrappers
const initializeMonacoEditor = (containerId: string, voiceIndex: number) => {
  initializeMonacoEditorComplete(
    containerId,
    voiceIndex,
    () => appState.voices[voiceIndex].saveable.jsCode,
    (code, vIdx) => { appState.voices[vIdx].saveable.jsCode = code }
  )
}



const initializeCodeMirrorEditor = (containerId: string, voiceIndex: number) => {
  initializeCodeMirrorEditorComplete(
    containerId,
    voiceIndex,
    () => monacoEditors[voiceIndex]?.getValue() || '',
    (lc, ln, vIdx, originalText) => handleDslLineClick(lc, ln, vIdx, appState, debugPianoRolls, originalText)
  )
}

const switchToInputMode = (voiceIndex: number) => {
  showInputEditor.value[voiceIndex] = true
  // Clear the piano roll when switching to input mode
  clearPianoRoll(voiceIndex, debugPianoRolls)
  // Clear all DSL highlights and state
  clearAllDslHighlights(voiceIndex)
}

const switchToVisualizeMode = (voiceIndex: number) => {
  showInputEditor.value[voiceIndex] = false
  
  if ( !appState.voices[voiceIndex].isPlaying) {
    const content = appState.voices[voiceIndex].saveable.jsCode

    //transform source to reflect slider values
    const { sliderResolvedCode } = resolveSliderExpressionsInJavaScript(content, appState.sliders)
    setCodeMirrorContent(voiceIndex, sliderResolvedCode)

    // Analyze and highlight scheduled lines (returns UUIDs)
    const { executedUUIDs, mappings, visualizeCode } = analyzeExecutableLines(content, voiceIndex, appState, uuidMappings)
    applyScheduledHighlightByUUID(voiceIndex, Array.from(executedUUIDs), voiceScheduledUUIDs, getMappingsForVoice)
    
    // Clear any previous clicked DSL range when switching modes
    clickedDslRanges.set(voiceIndex.toString(), null)
    highlightClickedDsl(voiceIndex, null)
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
  // Check if voice is still playing
  const voice = appState.voices[voiceIndex]
  
  try {
    // Parse the line using existing parsing logic
    const groups = splitTextToGroups(lineText)
    if (!groups.length) return
    
    const group = groups[0] // runLine handles one group at a time
    const { clip, updatedClipLine } = buildClipFromLine(group.clipLine, appState.sliders)
    if (!clip) return
    
    // Execute the clip similar to existing playClips logic
    const notes = clip.noteBuffer()
    const ramps = group.rampLines.map(parseRampLine).map(r => 
      launchParamRamp(r.paramName, r.startVal, r.endVal, clip.duration, voiceIndex, ctx)
    )

    if (notes.length === 0 && clip.duration > 0) {
      await ctx.wait(clip.duration)
    }

    // Play the notes
    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta)
      
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

  return voice.hotSwapCued
}


const DELAY_SLIDER = 16
const runLineWithDelay = (baseClipName: string, baseTransform: string, delayTransform: string, ctx: TimeContext) => {
  const baseLine = baseClipName + ' : ' + baseTransform
  const delayRootClipName = baseClipName + '-delayRoot'
  const delayLine = delayRootClipName + ' : ' + delayTransform
  console.log('play lines', baseLine, delayLine)

  const groups = splitTextToGroups(baseLine)
  const { clip: delayRootClip, updatedClipLine } = buildClipFromLine(groups[0].clipLine, appState.sliders)
  clipMap.set(delayRootClipName, delayRootClip!)

  const delay = appState.sliders[DELAY_SLIDER]

  const dummyVoices = appState.voices.map(v => ({...v, isPlaying: true}))

  const handle = ctx.branch(async ctx => {
    runLineClean(baseLine, ctx, 0, appState.sliders, dummyVoices, () => { }, () => { }, playNote, (() => { }) as any)

    // await ctx.wait(4)
    await ctx.wait(appState.sliders[DELAY_SLIDER]**2 * 8)

    runLineClean(delayLine, ctx, 1, appState.sliders, dummyVoices, () => { }, () => { }, playNote, (() => { }) as any)
  })
  
  return handle
}

// runLine function - executes livecoding lines and manages highlighting
type PlayNoteFunc = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, instInd: number) => void
type LaunchRampFunc = (paramName: string, startVal: number, endVal: number, duration: number, voiceIdx: number, ctx: TimeContext) => LoopHandle
const runLineClean = async (lineText: string, ctx: TimeContext, voiceIndex: number, sliders: number[], voices: VoiceState[], onVoiceStart: () => void, onVoiceEnd: () => void, playNoteF: PlayNoteFunc, launchParamRampF: LaunchRampFunc) => {
  // Highlight the current line being executed using UUID
  // highlightCurrentLineByUUID(voiceIndex, uuid, voiceActiveUUIDs, getMappingsForVoice)
  onVoiceStart()

  // Check if voice is still playing
  const voice = voices[voiceIndex]
  
  try {
    // Parse the line using existing parsing logic
    const groups = splitTextToGroups(lineText)
    if (!groups.length) return
    
    const group = groups[0] // runLine handles one group at a time
    const { clip, updatedClipLine } = buildClipFromLine(group.clipLine, sliders)
    if (!clip) return

    console.log("running line", lineText, clip.notes.map(n => [n.position, n.pitch]), playNoteF)
    
    // Execute the clip similar to existing playClips logic
    const notes = clip.noteBuffer()
    const ramps = group.rampLines.map(parseRampLine).map(r => 
      launchParamRampF(r.paramName, r.startVal, r.endVal, clip.duration, voiceIndex, ctx)
    )

    if (notes.length === 0 && clip.duration > 0) {
      await ctx.wait(clip.duration)
    }

    // Play the notes
    for (const nextNote of notes) {
      await ctx.wait(nextNote.preDelta)
      
      if (!voice.isPlaying) {
        ramps.forEach(r => r.cancel())
        break
      }
      
      playNoteF(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, voiceIndex)
      if (nextNote.postDelta) await ctx.wait(nextNote.postDelta)
    }
    
    // Clean up ramps if we completed normally
    if (voices[voiceIndex].isPlaying) {
      // Let ramps complete naturally
    } else {
      ramps.forEach(r => r.cancel())
    }
    
  } catch (error) {
    console.error('Error in runLine:', error)
  } finally {
    // Clear current line highlighting after execution
    // highlightCurrentLineByUUID(voiceIndex, null, voiceActiveUUIDs, getMappingsForVoice)
    onVoiceEnd()
  }

  return voice.hotSwapCued
}



const oneShot = (idx: number) => oneshotCall(idx, appState.oneShots)

const initializeNewLoopWithNewSourceCode = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx]
  v.playingLockedSourceText = appState.voices[voiceIdx].saveable.jsCode
  
  switchToVisualizeMode(voiceIdx)
      
  const { sliderResolvedCode } = resolveSliderExpressionsInJavaScript(v.playingLockedSourceText, appState.sliders)
  setCodeMirrorContent(voiceIdx, sliderResolvedCode)

  // Analyze and highlight scheduled lines (returns UUIDs)
  //todo - using a seeded random number generator here would make this work properly with "randomness"
  const { executedUUIDs, mappings, visualizeCode } = analyzeExecutableLines(v.playingLockedSourceText, voiceIdx, appState, uuidMappings)
  applyScheduledHighlightByUUID(voiceIdx, Array.from(executedUUIDs), voiceScheduledUUIDs, getMappingsForVoice)
  // Create executable function
  const { executableFunc } = createExecutableFunction(visualizeCode, mappings, voiceIdx)
  if (!executableFunc) {
    console.error('Failed to create executable function for voice', voiceIdx)
    return
  }
  voiceExecutableFuncs.set(voiceIdx.toString(), executableFunc)

}


/**
 * 
 * general pattern for looping code:
 * - at the first cycle of the loop, input code gets parsed to runtime mode
 * - DSL lines are live-compiled once it is their time to be run
 * - runtime code references toggles and one-shots, their values are read live
 * 
 * for hotswapping
 * - DSL lines (i.e runLine function) return whether a hotswap of new input code is cued up 
 * - for each line/runLine call, an "if(hotSwapCued) return" line is added for early return
 * - hotswap return value propogates up from runLine to playOnce to loop
 * - if the hotswap is cued, the loop is restarted with the new input code
 *   and no manual "loop management" is needed (e.g, canceling the loop handle and cueing new one)
 */

const startVoice = (voiceIdx: number) => {
  const v = appState.voices[voiceIdx]

  const playOnce = async (ctx: TimeContext, firstLoop: boolean) => {
    // Switch to visualize mode when starting playback
    if (firstLoop) {
      initializeNewLoopWithNewSourceCode(voiceIdx)
    }
    
    let hotSwapCued = false
    try {
      // Execute the JavaScript code with proper context
      const execFunc = voiceExecutableFuncs.get(voiceIdx.toString())!
      //todo barrier - add barrier arguments
      hotSwapCued = await execFunc(ctx, runLine, appState.toggles, oneShot, startBarrier, resolveBarrier, awaitBarrier) 
    } catch (error) {
      console.error('Error executing JavaScript code:', error)
    }

    return hotSwapCued
  }

  if (v.isLooping) {
    // v.loopHandle?.cancel() - should never be needed?
    launchQueue.push(async (ctx) => {
      v.loopHandle = ctx.branch(async (ctx) => {
        let firstLoop = true
        while (v.isLooping && v.isPlaying) {
          const hotSwapCued = await playOnce(ctx, firstLoop)
          firstLoop = false
          if (hotSwapCued) {
            v.hotSwapCued = false
            firstLoop = true
          }
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
  v.hotSwapCued = false // Clear hot-swap flag
  v.loopHandle?.cancel()//todo - check if this is needed - do note play functions end their notes properly?
  v.loopHandle = null

  switchToInputMode(voiceIdx)
  // Clear all highlighting
  applyScheduledHighlightByUUID(voiceIdx, [], voiceScheduledUUIDs, getMappingsForVoice)
  highlightCurrentLineByUUID(voiceIdx, null, voiceActiveUUIDs, getMappingsForVoice)
  // Clear clicked DSL highlighting, stored text, and piano roll
  clickedDslRanges.set(voiceIdx.toString(), null)
  clickedDslOriginalText.set(voiceIdx.toString(), null)
  highlightClickedDsl(voiceIdx, null)
  clearPianoRoll(voiceIdx, debugPianoRolls)
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

let baseTimeContextHandle: (TimeContext | null) = null 

const launchQueue: Array<(ctx: TimeContext) => Promise<void>> = []
const immediateLaunchQueue: Array<(ctx: TimeContext) => Promise<void>> = []

const instrumentChains = [getDriftChain(1), getDriftChain(2), getDriftChain(3), getDriftChain(4)]

// Debug piano rolls - one per voice
const debugPianoRolls: (PianoRoll<{}>)[] = []

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
const getScaledParamValue = (paramName: string, paramScaling: Record<string, (val: number) => number>, normalizedValue: number): number => {
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

const GLOBAL_PARAM_EDITOR_NAME = 'globalParamEditor'

const runGlobalParamScript = () => {
  const paramEditor = codeMirrorEditorsByName.get(GLOBAL_PARAM_EDITOR_NAME)
  if (paramEditor) {
    const paramScript = paramEditor.state.doc.toString()
    executeParamSetterString(paramScript, baseTimeContextHandle!, appState)
  }
}

let rootTimeContext: TimeContext | null = null

onMounted(async() => {
  try {
    // Initialize editors for all voices
    await nextTick() // Ensure DOM is ready
    for (let i = 0; i < appState.voices.length; i++) {
      initializeMonacoEditor(`monacoEditorContainer-${i}`, i)
      initializeCodeMirrorEditor(`codeMirrorEditorContainer-${i}`, i)
    }
    initializeCodeMirrorEditorComplete(
      'globals-livecode-editor-container',
      -1,
      () => "//livecode global params here - (sliders, toggles, oneShots)\n\n\n\n\n",
      () => { },
      false,
      GLOBAL_PARAM_EDITOR_NAME
    )

    // Load from localStorage first (both snapshots and current state)
    loadFromLocalStorage()
    // Refresh editors to show restored JavaScript code
    refreshEditorsFromState()
    
    // Initialize debug piano rolls for each voice
    for (let i = 0; i < appState.voices.length; i++) {
      const containerId = `dslPianoRoll-${i}`
      debugPianoRolls[i] = new PianoRoll<{}>(containerId, () => {}, () => {}, true)
    }
    
    await MIDI_READY
    console.log('midi ready')
    await INITIALIZE_ABLETON_CLIPS('src/sketches/sonar_sketch/piano_melodies Project/freeze_loop_setup_sonar.als', staticClipData, false)
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
      // console.log("lpd")
      Array.from({ length: 8 }, (_, i) => i).forEach(ind => {
        lpd8.onControlChange(ind + 70, (msg) => {
          appState.sliders[ind] = (midiNorm(msg.data2))
          // console.log('slider change', msg)
        })
      })

      const baseClipNames = ['dscale5', 'dscale7', 'd7mel']
      const baseTransform = 's_tr s0 dR7'
      const delayTransform = 'str s8'
      const gateButtonMelodies: Record<number, LoopHandle> = {}

      Array.from({ length: 8 }, (_, i) => i).forEach(ind => {
        if (ind < 4) {
          //oneshot
          lpd8.onNoteOn(lpdButtonMap[ind], (msg) => {
            console.log('oneShot', ind, lpdButtonMap[ind], baseClipNames[ind])
            immediateLaunchQueue.push((ctx) => {
              runLineWithDelay(baseClipNames[ind], baseTransform, delayTransform, ctx)
              return Promise.resolve()
            })
          })
        } else {
          //gate launch 
          lpd8.onNoteOn(lpdButtonMap[ind], (msg) => {
            console.log('gate', ind, lpdButtonMap[ind], baseClipNames[ind])
            immediateLaunchQueue.push((ctx) => {
              const handle = runLineWithDelay(baseClipNames[ind-4], baseTransform, delayTransform, ctx)
              gateButtonMelodies[ind] = handle
              return Promise.resolve()
            })
          })
          lpd8.onNoteOff(lpdButtonMap[ind], (msg) => {
            const handle = gateButtonMelodies[ind]
            if(handle) handle.cancel()
          })
        }
      })

    }

    
    //set up sliders midi 0-7 for TouchOSC Bridge midi device to sliderrs 8-15
    const touchOSCBridge = midiInputs.get("TouchOSC Bridge")
    if (touchOSCBridge) {
      Array.from({ length: 9 }, (_, i) => i).forEach(ind => {
        touchOSCBridge.onControlChange(ind, (msg) => {
          appState.sliders[ind + 8] = (midiNorm(msg.data2))
        })
      })
    }

    const FBV3 = midiInputs.get("FBV 3")
    if (FBV3) {
      FBV3.onControlChange(2, (msg) => {
        if (msg.data2 > 64) {
          //swap to previous code bank for voice 0
          const newBankIdx = mod2(appState.voices[0].currentJsBank - 1, 8)
          const me = new MouseEvent('click', {shiftKey: false})
          handleJsBankClick(0, newBankIdx, me)
        }
      })
      FBV3.onControlChange(3, (msg) => {
        if (msg.data2 > 64) {
          //swap to next code bank for voice 0
          const newBankIdx = mod2(appState.voices[0].currentJsBank + 1, 8)
          const me = new MouseEvent('click', {shiftKey: false})
          handleJsBankClick(0, newBankIdx, me)
        }
      })
      FBV3.onControlChange(4, (msg) => {
        if(msg.data2 > 64) {
          togglePlay(0)
        }
      })
    }

    // Note-off protector: tracks active notes per channel/pitch to prevent premature note-offs
    const activeNotes = new Map<string, Set<symbol>>() // key: "channel-pitch", value: set of note IDs
    
    const getNoteKey = (channel: number, pitch: number) => `${channel}-${pitch}`
    
    const playNoteMidi = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, voiceIdx: number) => {
      const inst = midiOuts[voiceIdx]
      const noteId = Symbol() // Unique ID for this note instance
      const noteKey = getNoteKey(voiceIdx, pitch)
      
      // Track this note
      if (!activeNotes.has(noteKey)) {
        activeNotes.set(noteKey, new Set())
      }
      activeNotes.get(noteKey)!.add(noteId)
      
      inst.sendNoteOn(pitch, velocity)

      // console.log('note on', pitch, inst)
      
      ctx.branch(async ctx => {
        await ctx.wait((noteDur ?? 0.1) * 0.98)
        
        // Remove this note from active set
        const noteSet = activeNotes.get(noteKey)
        if (noteSet) {
          noteSet.delete(noteId)
          // Only send note-off if no other notes of this pitch are active
          if (noteSet.size === 0) {
            inst.sendNoteOff(pitch)
            activeNotes.delete(noteKey)
          }
        }
      }).finally(() => {
        // console.log('loop canclled finally', pitch) //todo core - need to cancel child contexts properly (this doesn't fire immediately on parent cancel)
        const noteSet = activeNotes.get(noteKey)
        if (noteSet) {
          noteSet.delete(noteId)
          if (noteSet.size === 0) {
            inst.sendNoteOff(pitch)
            activeNotes.delete(noteKey)
          }
        }
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
      rootTimeContext = ctx
      ctx.bpm = 120
      console.log('launch loop')
      baseTimeContextHandle = ctx

      // eslint-disable-next-line no-constant-condition
      while (true) {
        launchQueue.forEach(cb => cb(ctx))
        launchQueue.length = 0
        await ctx.wait(1)
      }
    })

    launchLoop(async (ctx) => {
      ctx.bpm = 120
      // eslint-disable-next-line no-constant-condition
      while (true) {
        immediateLaunchQueue.forEach(cb => cb(ctx))
        immediateLaunchQueue.length = 0
        await ctx.waitSec(0.016)
      }
    })

    const passthru = new Passthru({ src: p5Canvas })
    const canvasPaint = new CanvasPaint({ src: passthru })

    shaderGraphEndNode = canvasPaint
    appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
    
    singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
 
    // Set up auto-save interval (2 seconds) - now saves both snapshots and current state
    const autoSaveInterval = setInterval(saveToLocalStorage, 2000) as unknown as number
    
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
  
  // Update CodeMirror editor if in JavaScript mode and it exists
  const codeMirrorEditor = codeMirrorEditors[voiceIndex]
  if (codeMirrorEditor) {
    const jsSourceText = voice.isPlaying ? voice.playingLockedSourceText : appState.voices[voiceIndex].saveable.jsCode;
    
    // Resolve slider expressions in the JavaScript code
    const { sliderResolvedCode } = resolveSliderExpressionsInJavaScript(jsSourceText, appState.sliders)
    
    // Check if content has actually changed to avoid unnecessary updates
    const currentContent = codeMirrorEditor.state.doc.toString()
    if (currentContent !== sliderResolvedCode) {

      
      setCodeMirrorContent(voiceIndex, sliderResolvedCode)

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
    
    // Re-render piano roll if there's an active DSL selection
    const clickedRange = clickedDslRanges.get(voiceIndex.toString())
    const originalDsl = clickedDslOriginalText.get(voiceIndex.toString())
    if (clickedRange && originalDsl && !showInputEditor.value[voiceIndex]) {
      // Re-render the piano roll with the stored original DSL text
      setPianoRollFromDslLine(originalDsl, voiceIndex, appState, debugPianoRolls)
      
      // Re-highlight the clicked range with updated resolved text
      // The range might have changed due to slider value changes
      const segmentCount = clickedDslSegmentCounts.get(voiceIndex.toString())
      if (segmentCount && typeof segmentCount === 'number') {
        // Find the new range for the partial DSL in the updated text
        const doc = codeMirrorEditor.state.doc
        const clickedLine = doc.lineAt(clickedRange.from)
        const lineContent = clickedLine.text
        const dslExtract = extractDslFromLine(lineContent)
        
        if (dslExtract.isDsl && dslExtract.dslText && dslExtract.prefixLength !== undefined) {
          // Get the partial based on segment count
          const parts = dslExtract.dslText.split(/\s*:\s*/)
          const partialParts = parts.slice(0, segmentCount)
          const partialDsl = partialParts.join(' : ')
          
          const from = clickedLine.from + dslExtract.prefixLength
          const to = from + partialDsl.length
          const newRange = { from, to }
          
          // Update the clicked range
          clickedDslRanges.set(voiceIndex.toString(), newRange)
          highlightClickedDsl(voiceIndex, newRange)
        }
      }
    }
  }
}

const updateVoiceOnToggleChange = (voiceIndex: number) => {
  const voice = appState.voices[voiceIndex]
  const jsSourceText = voice.isPlaying ? voice.playingLockedSourceText : voice.saveable.jsCode
  const { executedUUIDs } = analyzeExecutableLines(jsSourceText, voiceIndex, appState, uuidMappings)
  applyScheduledHighlightByUUID(voiceIndex, Array.from(executedUUIDs), voiceScheduledUUIDs, getMappingsForVoice)
}

// Set up a debounced watcher per-voice that recomputes the display text at
// most 10×/second whenever its slice definition OR any slider value changes.
appState.voices.forEach((voice, vIdx) => {
  const debouncedUpdate = debounce(() => {
    updateVoiceOnSliderChange(vIdx)
  }, 100) // 100 ms → 10 Hz max

  // Initial computation
  debouncedUpdate() //todo is this needed?

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

  // …and to any change in the global one-shot array
  watch(
    () => appState.oneShots,
    () => updateVoiceOnToggleChange(vIdx),
    { deep: true }
  )
})

// Update FX parameters for all voices
appState.voices.forEach((_, idx) => updateFxParams(idx))



</script>

<template>
  <div class="break-row"></div>
  
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
      <label>slider {{ idx }}</label>
    </div>
  </div>

  <div class="toggles-row">
    <div class="toggle-column" v-for="(toggle, idx) in appState.toggles" :key="idx">
      <div>{{ appState.toggles[idx] ? 'ON' : 'OFF' }}</div>
      <input type="checkbox" v-model="appState.toggles[idx]" />
      <label>toggle {{ idx }}</label>
    </div>
  </div>

  <div class="toggles-row" id="one-shots-row">
    <div class="toggle-column" v-for="(oneShot, idx) in appState.oneShots" :key="idx">
      <div>{{ appState.oneShots[idx] ? 'ON' : 'OFF' }}</div>
      <input type="checkbox" v-model="appState.oneShots[idx]" />
      <label>one-shot {{ idx }}</label>
    </div>
  </div>

  <div id="global-param-livecode">
    <div id="globals-livecode-editor-container"></div>
    <button @click="runGlobalParamScript">Exec param change</button>
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
          <input type="checkbox" v-model="voice.hotSwapCued"/>
          Hot Swap Cued
        </label>
      </div>
      <details open class="text-display">
        <summary>Slice Editor</summary>
        <div class="editor-mode-toggle">
          <button @click="switchToInputMode(idx)" :class="{ active: showInputEditor[idx] }">
            Input Mode
          </button>
          <button @click="switchToVisualizeMode(idx)" :class="{ active: !showInputEditor[idx] }">
            Visualize Mode
          </button>
        </div>

        <!-- Monaco Editor (Input) -->
        <div class="editor-container" :class="{ 'editor-hidden-opacity': !showInputEditor[idx] }">
          <div class="editor-header">Input Editor (JavaScript)</div>
          <div :id="`monacoEditorContainer-${idx}`" class="monaco-editor"></div>
        </div>
        
        <!-- CodeMirror Editor (Visualize) -->
        <div class="editor-container" :class="{ 'editor-hidden-opacity': showInputEditor[idx] }">
          <div class="editor-header">Visualize Editor (Playback)</div>
          <div :id="`codeMirrorEditorContainer-${idx}`" class="codemirror-editor"></div>
        </div>
      </details>

      <details open class="js-code-banks">
        <summary>JS Code Banks (Click: Load, Shift+Click: Save)</summary>
        <div class="js-bank-buttons">
          <button 
            v-for="bankIdx in 8" 
            :key="bankIdx"
            :class="{ 'active': voice.currentJsBank === bankIdx - 1 }"
            @click="handleJsBankClick(idx, bankIdx - 1, $event)"
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

button:active {
  background: #4a5c2a;
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

.fx-bank-buttons, .js-bank-buttons {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
}

.fx-bank-buttons button, .js-bank-buttons button {
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

.fx-bank-buttons button:hover, .js-bank-buttons button:hover {
  background: #444;
  border-color: #666;
}

.fx-bank-buttons button.active, .js-bank-buttons button.active {
  background: #6a9bd1;
  border-color: #4a7ba7;
  color: #fff;
}

.fx-bank-buttons button.active:hover, .js-bank-buttons button.active:hover {
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

#global-param-livecode {
  display: flex;
  flex-direction: row;
  justify-content: center;
}

#globals-livecode-editor-container {
  min-width: 500px;
}

</style>