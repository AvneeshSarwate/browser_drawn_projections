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
import { Scale } from '@/music/scale';
import { getPiano, getPianoChain, TONE_AUDIO_START, getSynthChain, getDriftChain } from '@/music/synths';
import { m2f } from '@/music/mpeSynth';
import { TRANSFORM_REGISTRY } from './clipTransforms';
import { clipData as staticClipData } from './clipData';
import type { MIDIValOutput } from '@midival/core';
import { PianoRoll, type NoteInfo } from '@/music/pianoRoll'
import * as Tone from 'tone'
import { evaluate } from './sliderExprParser'
import * as monaco from 'monaco-editor'
import { EditorView, basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { Decoration, type DecorationSet } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

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
const monacoEditors: (monaco.editor.IStandaloneCodeEditor | undefined)[] = []
const codeMirrorEditors: (EditorView | undefined)[] = []
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


// Slider bank management functions
const saveTopLevelSliderBank = (bankIndex: number) => {
  saveBank(appState.sliderBanks.topLevel, bankIndex, [...appState.sliders])
  console.log(`Top-level slider bank ${bankIndex + 1} saved`)
}

const loadTopLevelSliderBank = (bankIndex: number) => {
  const bank = loadBank(appState.sliderBanks.topLevel, bankIndex)
  if (!bank) return
  appState.sliders = [...bank]
  appState.currentTopLevelBank = bankIndex
  console.log(`Top-level slider bank ${bankIndex + 1} loaded`)
}

const saveFxSliderBank = (voiceIndex: number, bankIndex: number) => {
  if (voiceIndex < 0 || voiceIndex >= appState.voices.length) return
  const voice = appState.voices[voiceIndex]
  saveBank(voice.saveable.fxBanks, bankIndex, voice.saveable.fxParams)
  console.log(`Voice ${voiceIndex + 1} FX bank ${bankIndex + 1} saved`)
}

const loadFxSliderBank = (voiceIndex: number, bankIndex: number) => {
  if (voiceIndex < 0 || voiceIndex >= appState.voices.length) return
  const voice = appState.voices[voiceIndex]
  const params = loadBank(voice.saveable.fxBanks, bankIndex)
  if (!params) return
  voice.saveable.fxParams = params
  voice.currentFxBank = bankIndex
  updatePianoFX(voiceIndex)
  console.log(`Voice ${voiceIndex + 1} FX bank ${bankIndex + 1} loaded`)
}

const handleFxBankClick = (voiceIndex: number, bankIndex: number, event: MouseEvent) => {
  makeBankClickHandler(
    (idx) => saveFxSliderBank(voiceIndex, idx),
    (idx) => loadFxSliderBank(voiceIndex, idx),
    (idx) => appState.voices[voiceIndex].currentFxBank = idx,
  )(bankIndex, event)
}

const handleTopLevelBankClick = makeBankClickHandler(
  saveTopLevelSliderBank,
  loadTopLevelSliderBank,
  (idx) => appState.currentTopLevelBank = idx,
)

const saveSnapshot = () => {
  appState.snapshots.push(buildCurrentLiveState())
  console.log('Snapshot saved. Total snapshots:', appState.snapshots.length)
}

//does not manage any playing state - only "safe" to load when not playing
const loadSnapshotStateOnly = (ind: number) => {
  if (ind < 0 || ind >= appState.snapshots.length) return
  const snapshot = appState.snapshots[ind]
  
  appState.sliders = [...snapshot.sliders]
  appState.voices.forEach((v, i) => {
    v.saveable = JSON.parse(JSON.stringify(snapshot.voices[i]))
  })
  
  // Load slider banks if they exist in the snapshot
  if (snapshot.sliderBanks) {
    appState.sliderBanks = {
      topLevel: snapshot.sliderBanks.topLevel.map(bank => [...bank])
    }
  }
  
  // Update FX parameters for all voices
  appState.voices.forEach((_, idx) => updatePianoFX(idx))
}

const splitTransformChainToCommandStrings = (line: string) => {
  const tokens = line.split(/\s*:\s*/).map((t) => t.trim()).filter(Boolean);
  return { srcName: tokens[0], commandStrings: tokens.slice(1) }
}

const parseCommandString = (cmdString: string) => {
  const parts = cmdString.split(/\s+/).filter(Boolean);
  const symbol = parts[0];
  const params = parts.slice(1);
  return { symbol, params }
  // Note: slider expressions cannot contain spaces (e.g., use "s1*2+s2" not "s1 * 2 + s2")
}

const paramUsesSliderExpression = (paramString: string) => {
  return typeof paramString === 'string' && /s\d+/.test(paramString)
}

const evaluateSliderExpression = (expression: string, sliderScaleFunc: (val: number, clip: AbletonClip) => number, origClip: AbletonClip) => {
  // Build variables map with current slider values
  const sliderVars: Record<string, number> = {}
  
  // Extract all slider references (s1, s2, etc.) from the expression
  const sliderMatches = expression.match(/s\d+/g) || []
  const usedSliders = new Set(sliderMatches)
  
  for (const sliderRef of sliderMatches) {
    const sliderIndex = parseInt(sliderRef.slice(1)) - 1
    if (sliderIndex >= 0 && sliderIndex < appState.sliders.length) {
      // Use scaled slider value for the expression evaluation
      sliderVars[sliderRef] = sliderScaleFunc(appState.sliders[sliderIndex], origClip)
    }
  }
  
  try {
    // Evaluate the expression with scaled slider values
    const result = evaluate(expression, sliderVars)
    
    return { success: true, value: result, usedSliders }
  } catch (error) {
    console.warn('Failed to evaluate slider expression:', expression, error)
    return { success: false, value: 0, rawValue: 0 }
  }
}

const buildClipFromLine = (clipLine: string, skipClipTransform: boolean = false): { clip: AbletonClip, updatedClipLine: string } => {
  const { srcName, commandStrings } = splitTransformChainToCommandStrings(clipLine)
  if (!commandStrings.length) return { clip: undefined, updatedClipLine: clipLine };

  const srcClip = clipMap.get(srcName);
  if (!srcClip) return { clip: undefined, updatedClipLine: clipLine };

  let curClip = srcClip.clone();
  const origClip = srcClip.clone();
  let updatedTokens = [srcName]; // Start with the clip name

  commandStrings.forEach((cmdString) => {
    const { symbol, params } = parseCommandString(cmdString)

    const tf = TRANSFORM_REGISTRY[symbol as keyof typeof TRANSFORM_REGISTRY];
    const parsedParams = tf.argParser(params);
    const updatedParams = [...params]; // Clone params for updating

    //if string arg contains slider expressions, evaluate and replace with the computed value
    parsedParams.forEach((param, index) => {
      if (paramUsesSliderExpression(param)) { 
        const result = evaluateSliderExpression(param, tf.sliderScale[index], origClip);
        if (result.success) {
          parsedParams[index] = result.value;
          const usedSliders = Array.from(result.usedSliders).join('')
          updatedParams[index] = result.value.toFixed(2) + '-' + usedSliders; // Format for readability
        }
      }
    });

    if (tf && !skipClipTransform) curClip = tf.transform(curClip, ...parsedParams);
    // Add the updated command token to the updatedTokens array
    updatedTokens.push(`${symbol} ${updatedParams.join(' ')}`);
  });

  // Join tokens with " : " to reconstruct the main line
  const updatedClipLine = updatedTokens.join(' : ');
  
  return { clip: curClip, updatedClipLine };
}

const testTransform = () => {
  // For testing, just use the first group's clipLine
  const groups = splitTextToGroups(testTransformInput.value)
  if (!groups.length) return
  
  const { clip } = buildClipFromLine(groups[0].clipLine)
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


const parseRampLine = (rampLine: string) => {
  const parts = rampLine.split(/\s+/).filter(Boolean) //[=>, param, startVal, endVal]
  const paramName = parts[1]
  const startVal = parseFloat(parts[2])
  const endVal = parseFloat(parts[3])
  return { paramName, startVal, endVal }
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
  voiceState.playingText = computeDisplayTextForVoice(voiceState)

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

    const { clip: curClip, updatedClipLine } = buildClipFromLine(group.clipLine)
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

const splitTextToGroups = (text: string): { clipLine: string, rampLines: string[] }[] => {
  const allLines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const groups: { clipLine: string, rampLines: string[] }[] = []
  let currentClipLine = ''
  let currentRampLines: string[] = []
  
  for (const line of allLines) {
    if (line.startsWith('=> ')) {
      // This is a modifier line, add to current group
      currentRampLines.push(line)
    } else {
      // This is a main line, start a new group
      if (currentClipLine) {
        // Save the previous group
        groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] })
      }
      // Start new group with this main line
      currentClipLine = line
      currentRampLines = []
    }
  }
  
  // Don't forget the last group
  if (currentClipLine) {
    groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] })
  }
  
  return groups
}

// Editor initialization and management
const initializeMonacoEditor = (containerId: string, voiceIndex: number) => {
  const container = document.getElementById(containerId)
  if (!container) return

  // TypeScript definitions for the line function
  const lineTypeDef = `
declare function line(text: string): void;
declare const ctx: TimeContext;
`

  monaco.languages.typescript.javascriptDefaults.addExtraLib(lineTypeDef, 'line-types.d.ts')
  
  const defaultCode = `// JavaScript livecoding with line() function
// Use conditionals and loops around line() calls

const playFirstPattern = true
const playAlternate = false

if (playFirstPattern) {
  line(\`debug1 : seg 1 : s_tr 1 : str 1 : q 1
       => param1 0.5 0.8\`)
}

line(\`debug1 : seg 1 : s_tr 2 : str 1 : q 1
     => param1 0.5 0.8
     => param3 0.6 0.7\`)

if (playAlternate) {
  line(\`debug1 : seg 1 : s_tr 4 : str 1 : q 1\`)
}

line(\`debug1 : seg 1 : s_tr 3 : str 1 : q 1\`)
`

  const editor = monaco.editor.create(container, {
    value: defaultCode,
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    wordWrap: 'on'
  })
  
  // Sync Monaco content to CodeMirror when it changes
  editor.onDidChangeModelContent(() => {
    // Sync content to CodeMirror editor if it exists
    const codeMirrorEditor = codeMirrorEditors[voiceIndex]
    if (codeMirrorEditor) {
      const newContent = editor.getValue()
      codeMirrorEditor.dispatch({
        changes: {
          from: 0,
          to: codeMirrorEditor.state.doc.length,
          insert: newContent
        }
      })
      
      // Update UUID mappings when Monaco content changes
      const { mappings } = preprocessJavaScript(newContent, voiceIndex)
      uuidMappings.set(voiceIndex.toString(), mappings)
    }
  })
  
  monacoEditors[voiceIndex] = editor
}

const initializeCodeMirrorEditor = (containerId: string, voiceIndex: number) => {
  const container = document.getElementById(containerId)
  if (!container) return

  // Get initial content from Monaco editor or use default
  const monacoEditor = monacoEditors[voiceIndex]
  const initialContent = monacoEditor ? monacoEditor.getValue() : `// Voice ${voiceIndex + 1} - JavaScript Livecoding
line(\`debug1 : seg 1\`)
line(\`debug2 : seg 2\`)
line(\`debug3 : seg 3\`)`

  const editor = new EditorView({
    doc: initialContent,
    extensions: [
      basicSetup,
      javascript(),
      oneDark,
      lineHighlightField,
      EditorView.editable.of(false), // Read-only for visualization
      EditorView.theme({
        '&': { 
          maxHeight: '400px',
          minHeight: '200px'
        },
        '.cm-gutter, .cm-content': { 
          minHeight: '200px' 
        },
        '.cm-scroller': { 
          overflow: 'auto',
          maxHeight: '400px'
        },
        '.cm-scheduled-line': {
          backgroundColor: 'rgba(106, 155, 209, 0.15)',
          borderLeft: '3px solid #6a9bd1'
        },
        '.cm-current-line': {
          backgroundColor: 'rgba(74, 92, 42, 0.4)',
          borderLeft: '3px solid #4a5c2a',
          animation: 'pulse-line 1s ease-in-out infinite alternate'
        }
      })
    ],
    parent: container
  })
  
  codeMirrorEditors[voiceIndex] = editor
  
  // Test decorator functionality after a short delay
  // setTimeout(() => {
  //   console.log(`Testing decorators for voice ${voiceIndex}`)
  //   // Test scheduled line decorator on line 1
  //   editor.dispatch({
  //     effects: scheduledLineEffect.of({ lineNumbers: [1] })
  //   })
  //   // Test current line decorator on line 2 after 2 seconds
  //   setTimeout(() => {
  //     editor.dispatch({
  //       effects: currentLineEffect.of({ lineNumber: 2 })
  //     })
  //   }, 2000)
  // }, 1000)
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
    codeMirrorEditor.dispatch({
      changes: {
        from: 0,
        to: codeMirrorEditor.state.doc.length,
        insert: content
      }
    })
  }
}

// Code transformation pipeline
type UUIDMapping = {
  uuid: string
  sourceLineNumber: number
  sourceLineText: string
  endLineNumber?: number  // For multiline spans
}

const uuidMappings = new Map<string, UUIDMapping[]>() // voiceIndex -> mappings

const generateUUID = (): string => {
  return crypto.randomUUID()
}

// Common function to find all line() calls in JavaScript code
const findLineCallMatches = (jsCode: string): { 
  start: number, 
  end: number, 
  templateStart: number, 
  templateEnd: number, 
  content: string,
  lines: { content: string, startIndex: number, endIndex: number }[]
}[] => {
  const matches: { 
    start: number, 
    end: number, 
    templateStart: number, 
    templateEnd: number, 
    content: string,
    lines: { content: string, startIndex: number, endIndex: number }[]
  }[] = []
  let searchIndex = 0
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const start = jsCode.indexOf('line(`', searchIndex)
    if (start === -1) break
    
    // Find the matching `)` - look for backtick followed by closing paren
    const backtickEnd = jsCode.indexOf('`)', start + 6)
    if (backtickEnd === -1) {
      searchIndex = start + 6
      continue
    }
    
    const end = backtickEnd + 2 // Include the `)
    const templateStart = jsCode.indexOf('`', start)
    const templateEnd = backtickEnd
    const content = jsCode.substring(templateStart + 1, templateEnd)
    
    // Parse individual lines within the template literal
    const lines: { content: string, startIndex: number, endIndex: number }[] = []
    const contentLines = content.split('\n')
    let currentIndex = 0
    
    contentLines.forEach((lineContent, index) => {
      const trimmedContent = lineContent.trim()
      if (trimmedContent) { // Skip empty lines
        const lineStartIndex = templateStart + 1 + currentIndex
        const lineEndIndex = lineStartIndex + lineContent.length
        
        lines.push({
          content: trimmedContent,
          startIndex: lineStartIndex,
          endIndex: lineEndIndex
        })
      }
      // +1 for the newline character (except for the last line)
      currentIndex += lineContent.length + (index < contentLines.length - 1 ? 1 : 0)
    })
    
    matches.push({ start, end, templateStart, templateEnd, content, lines })
    searchIndex = end
  }
  
  return matches
}

// Step 1: Preprocessor - transforms line() calls to include UUIDs
const preprocessJavaScript = (inputCode: string, voiceIndex: number): { visualizeCode: string, mappings: UUIDMapping[] } => {
  const mappings: UUIDMapping[] = []
  let processedCode = inputCode
  
  // Find all line() calls using common function
  const matches = findLineCallMatches(processedCode)
  
  // Process matches from end to beginning to avoid offset issues
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]
    const uuid = generateUUID()
    
    // Get the complete line() call
    const fullCallText = processedCode.substring(match.start, match.end)
    
    // Calculate line numbers for the span
    const beforeCall = processedCode.substring(0, match.start)
    const startLineNumber = beforeCall.split('\n').length
    const endLineNumber = startLineNumber + fullCallText.split('\n').length - 1
    
    // Create mapping
    mappings.unshift({
      uuid,
      sourceLineNumber: startLineNumber,
      sourceLineText: fullCallText,
      endLineNumber: endLineNumber
    })
    
    // Extract just the template literal part
    const templateLiteral = processedCode.substring(match.templateStart, match.templateEnd + 1)
    
    // Replace with UUID version
    const replacement = `line(${templateLiteral}, "${uuid}")`
    processedCode = processedCode.substring(0, match.start) + replacement + processedCode.substring(match.end)
  }
  
  uuidMappings.set(voiceIndex.toString(), mappings)
  return { visualizeCode: processedCode, mappings }
}

// Step 2: Runtime transformer - converts line() calls to runLine() calls
const transformToRuntime = (visualizeCode: string, voiceIndex: number): string => {
  let runtimeCode = visualizeCode
  
  // Find and replace line() calls that may span multiple lines
  const lineCallRegex = /line\s*\(\s*(`(?:[^`\\]|\\.)*`)\s*,\s*"([^"]+)"\s*\)/gs
  
  runtimeCode = runtimeCode.replace(
    lineCallRegex,
    `await runLine($1, ctx, "$2", ${voiceIndex})`
  )
  
  return runtimeCode
}

// Step 3: Create executable function from JavaScript code
const createExecutableFunction = (inputCode: string, voiceIndex: number): { 
  executableFunc: Function | null, 
  visualizeCode: string, 
  mappings: UUIDMapping[] 
} => {
  try {
    const { visualizeCode, mappings } = preprocessJavaScript(inputCode, voiceIndex)
    const runtimeCode = transformToRuntime(visualizeCode, voiceIndex)
    
    // Create async function with proper context  
    const executableFunc = new Function('ctx', 'runLine', `
      async function execute() {
        ${runtimeCode}
      }
      return execute();
    `)
    
    return { executableFunc, visualizeCode, mappings }
  } catch (error) {
    console.error('Error creating executable function:', error)
    return { executableFunc: null, visualizeCode: '', mappings: [] }
  }
}

// Helper to get mappings for a voice
const getMappingsForVoice = (voiceIndex: number): UUIDMapping[] => {
  return uuidMappings.get(voiceIndex.toString()) || []
}

// Line highlighting system using CodeMirror decorations
const scheduledLineEffect = StateEffect.define<{lineNumbers: number[]}>()
const currentLineEffect = StateEffect.define<{lineNumber: number | null, endLineNumber?: number}>()

// Decoration themes
const scheduledLineDeco = Decoration.line({
  attributes: { class: 'cm-scheduled-line' }
})

const currentLineDeco = Decoration.line({
  attributes: { class: 'cm-current-line' }
})

// State field to manage line decorations
const lineHighlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes)
    
    for (let effect of tr.effects) {
      if (effect.is(scheduledLineEffect)) {
        // console.log('Processing scheduled line effect:', effect.value)
        // Remove old scheduled line decorations and add new ones
        decorations = decorations.update({
          filter: (from, to, decoration) => {
            // Keep current line decorations, remove scheduled line decorations
            const keepDeco = !decoration.spec.attributes?.class?.includes('cm-scheduled-line')
            // console.log('Filtering scheduled decoration:', decoration.spec, 'keep:', keepDeco)
            return keepDeco
          }
        })
        
        // Add new scheduled line decorations
        const ranges = []
        effect.value.lineNumbers.forEach(lineNum => {
          if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
            const line = tr.state.doc.line(lineNum)
            // console.log(`Adding scheduled decoration to line ${lineNum} at position ${line.from}`)
            ranges.push(scheduledLineDeco.range(line.from))
          }
        })
        
        decorations = decorations.update({ add: ranges })
        // console.log('Updated decorations after scheduled effect:', decorations)
      }
      
      if (effect.is(currentLineEffect)) {
        // console.log('Processing current line effect:', effect.value)
        // Remove old current line decorations
        decorations = decorations.update({
          filter: (from, to, decoration) => {
            const keepDeco = !decoration.spec.attributes?.class?.includes('cm-current-line')
            // console.log('Filtering current decoration:', decoration.spec, 'keep:', keepDeco)
            return keepDeco
          }
        })
        
        // Add new current line decoration(s) if lineNumber is not null
        if (effect.value.lineNumber !== null) {
          const startLineNum = effect.value.lineNumber
          const endLineNum = effect.value.endLineNumber || startLineNum
          const ranges = []
          
          // Highlight all lines in the span
          for (let lineNum = startLineNum; lineNum <= endLineNum; lineNum++) {
            if (lineNum >= 1 && lineNum <= tr.state.doc.lines) {
              const line = tr.state.doc.line(lineNum)
              // console.log(`Adding current decoration to line ${lineNum} at position ${line.from}`)
              ranges.push(currentLineDeco.range(line.from))
            }
          }
          
          decorations = decorations.update({ add: ranges })
        }
        // console.log('Updated decorations after current effect:', decorations)
      }
    }
    
    return decorations
  },
  provide: f => EditorView.decorations.from(f)
})

// Functions to control line highlighting
const highlightScheduledLines = (voiceIndex: number, uuids: string[]) => {
  console.log(`highlightScheduledLines called for voice ${voiceIndex} with UUIDs:`, uuids)
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) {
    console.log(`No editor found for voice ${voiceIndex}`)
    return
  }
  
  // Map UUIDs to line numbers (including multiline spans)
  const mappings = getMappingsForVoice(voiceIndex)
  console.log(`Mappings for voice ${voiceIndex}:`, mappings)
  const lineNumbers: number[] = []
  
  uuids.forEach(uuid => {
    const mapping = mappings.find(m => m.uuid === uuid)
    if (mapping) {
      const startLine = mapping.sourceLineNumber
      const endLine = mapping.endLineNumber || startLine
      
      // Add all lines in the span
      for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
        lineNumbers.push(lineNum)
      }
    }
  })
  
  console.log(`Highlighting scheduled lines:`, lineNumbers)
  editor.dispatch({
    effects: scheduledLineEffect.of({ lineNumbers })
  })
}

const highlightCurrentLine = (voiceIndex: number, lineNumber: number | null) => {
  const editor = codeMirrorEditors[voiceIndex]
  if (editor) {
    editor.dispatch({
      effects: currentLineEffect.of({ lineNumber })
    })
  }
}

// Helper to highlight current line by UUID (handles multiline spans)
const highlightCurrentLineByUUID = (voiceIndex: number, uuid: string | null) => {
  // console.log(`highlightCurrentLineByUUID called for voice ${voiceIndex} with UUID:`, uuid)
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) {
    // console.log(`No editor found for voice ${voiceIndex}`)
    return
  }
  
  if (uuid === null) {
    // console.log(`Clearing current line highlighting`)
    // Clear current line highlighting
    editor.dispatch({
      effects: currentLineEffect.of({ lineNumber: null })
    })
    return
  }
  
  const mappings = getMappingsForVoice(voiceIndex)
  const mapping = mappings.find(m => m.uuid === uuid)
  if (!mapping) {
    console.log(`No mapping found for UUID: ${uuid}`)
    return
  }
  
  // For multiline spans, highlight all lines
  const startLine = mapping.sourceLineNumber
  const endLine = mapping.endLineNumber || startLine
  
  // console.log(`Highlighting current line(s) ${startLine} to ${endLine}`)
  // Use a special effect for multiline current highlighting
  editor.dispatch({
    effects: currentLineEffect.of({ lineNumber: startLine, endLineNumber: endLine })
  })
}

// Function to analyze JavaScript code by executing visualize-time version and tracking line() calls
const analyzeExecutableLines = (jsCode: string, voiceIndex: number): string[] => {
  const executedUUIDs: string[] = []
  
  try {
    // Get the visualize-time code with UUIDs
    const { visualizeCode } = preprocessJavaScript(jsCode, voiceIndex)
    
    // Create line function that tracks which UUIDs are called (analysis mode)
    const line = (text: string, uuid: string) => {
      executedUUIDs.push(uuid)
      // No execution - just tracking
    }
    
    // Create and execute the visualize-time function
    const visualizeFunc = new Function('line', visualizeCode)
    
    // Execute with the line function to see which UUIDs would be called
    visualizeFunc(line)
    
    return executedUUIDs // Return UUIDs of lines that will execute
    
  } catch (error) {
    console.error('Error analyzing executable lines:', error)
    return []
  }
}

// runLine function - executes livecoding lines and manages highlighting
const runLine = async (lineText: string, ctx: TimeContext, uuid: string, voiceIndex: number) => {
  // Highlight the current line being executed using UUID
  highlightCurrentLineByUUID(voiceIndex, uuid)
  
  try {
    // Parse the line using existing parsing logic
    const groups = splitTextToGroups(lineText)
    if (!groups.length) return
    
    const group = groups[0] // runLine handles one group at a time
    const { clip: curClip, updatedClipLine } = buildClipFromLine(group.clipLine)
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
    highlightCurrentLineByUUID(voiceIndex, null)
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
        
        // Analyze and highlight scheduled lines (returns UUIDs)
        //todo - using a seeded random number generator here would make this work properly with "randomness"
        const executableUUIDs = analyzeExecutableLines(jsCode, voiceIdx)
        highlightScheduledLines(voiceIdx, executableUUIDs)
      }
      
      // Create executable function
      const { executableFunc } = createExecutableFunction(jsCode, voiceIdx)
      if (!executableFunc) {
        console.error('Failed to create executable function for voice', voiceIdx)
        return
      }
      
      try {
        // Execute the JavaScript code with proper context
        await executableFunc(ctx, runLine)
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
  
  // Switch back to input mode when stopping in JavaScript mode
  if (isJavascriptMode.value) {
    switchToInputMode(voiceIdx)
    // Clear all highlighting
    highlightScheduledLines(voiceIdx, []) // Empty UUID array
    highlightCurrentLineByUUID(voiceIdx, null)
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
  const dataStr = serialize(appState.snapshots)
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

// Shared validation function for snapshots
const validateSnapshots = (snapshots: any, source: string) => {
  if (!Array.isArray(snapshots)) {
    throw new Error(`Invalid ${source} format: expected array of snapshots`)
  }
  
  // Basic validation of snapshot structure
  for (const snapshot of snapshots) {
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
      // Validate FX banks if present (optional for backwards compatibility)
      if (voice.fxBanks && !Array.isArray(voice.fxBanks)) {
        throw new Error('Invalid voice format: invalid fxBanks array')
      }
    }
    
    // Validate slider banks if present (optional for backwards compatibility)
    if (snapshot.sliderBanks) {
      if (!snapshot.sliderBanks.topLevel || !Array.isArray(snapshot.sliderBanks.topLevel)) {
        throw new Error('Invalid snapshot format: invalid topLevel slider banks')
      }
    }
  }
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
        
        // Use shared validation
        validateSnapshots(loadedSnapshots, 'file')
        
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

// Add localStorage functions for both snapshots and current live state
const LOCAL_SNAP_KEY = 'sonar_snapshots'
const LOCAL_STATE_KEY = 'sonar_current_state'

const saveToLocalStorage = () => {
  try {
    localStorage.setItem(LOCAL_SNAP_KEY, serialize(appState.snapshots))
    localStorage.setItem(LOCAL_STATE_KEY, serialize(buildCurrentLiveState()))
    // console.log('State auto-saved to localStorage (snapshots + current state)')
  } catch (err) {
    console.error('Error saving to localStorage:', err)
  }
}

const loadFromLocalStorage = () => {
  try {
    const savedSnapshots = localStorage.getItem(LOCAL_SNAP_KEY)
    if (savedSnapshots) {
      const loaded = JSON.parse(savedSnapshots)
      validateSnapshots(loaded, 'localStorage')
      appState.snapshots = loaded
      console.log(`Loaded ${loaded.length} snapshots from localStorage`)
    }

    const savedState = localStorage.getItem(LOCAL_STATE_KEY)
    if (savedState) {
      const state = JSON.parse(savedState)
      if (Array.isArray(state.sliders)) appState.sliders = [...state.sliders]
      if (Array.isArray(state.voices)) {
        state.voices.forEach((sv: SaveableProperties, i: number) => {
          if (i < appState.voices.length) appState.voices[i].saveable = sv
        })
      }
      if (state.sliderBanks?.topLevel) appState.sliderBanks.topLevel = state.sliderBanks.topLevel.map((b: number[]) => [...b])
      if (typeof state.currentTopLevelBank === 'number') appState.currentTopLevelBank = state.currentTopLevelBank
      console.log('Loaded current live state from localStorage')
    }
  } catch (err) {
    console.error('Error loading from localStorage:', err)
  }
}

onMounted(async() => {
  try {
    // Load from localStorage first (both snapshots and current state)
    loadFromLocalStorage()
    
    // Initialize editors for all voices
    await nextTick() // Ensure DOM is ready
    for (let i = 0; i < appState.voices.length; i++) {
      initializeMonacoEditor(`monacoEditorContainer-${i}`, i)
      initializeCodeMirrorEditor(`codeMirrorEditorContainer-${i}`, i)
    }
    
    // Initialize test piano roll
    testPianoRoll = new PianoRoll<{}>('testPianoRollHolder', () => {}, () => {}, true)
    
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
      //todo - get this to use duration and have midi output signature for consistency
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
  
  // Clean up auto-save interval
  if (appState.autoSaveInterval) {
    clearInterval(appState.autoSaveInterval)
  }
  
  // Clean up editors
  monacoEditors.forEach(editor => editor?.dispose())
  codeMirrorEditors.forEach(editor => editor?.destroy())
  
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  clearDrawFuncs()
  timeLoops.forEach(tl => tl.cancel())
})


// Generic bank helpers
const deepClone = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj))
function saveBank<T>(bankArr: T[], bankIdx: number, data: T): void {
  if (bankIdx < 0 || bankIdx >= bankArr.length) return
  bankArr[bankIdx] = deepClone(data)
}

function loadBank<T>(bankArr: T[], bankIdx: number): T | undefined {
  if (bankIdx < 0 || bankIdx >= bankArr.length) return
  return deepClone(bankArr[bankIdx])
}

// Generic click-handler factory – hoisted because it is a function decl.
function makeBankClickHandler(
  saveFn: (idx: number) => void,
  loadFn: (idx: number) => void,
  selectFn?: (idx: number) => void
) {
  return (idx: number, ev: MouseEvent) => {
    if (ev.shiftKey) {
      saveFn(idx)
      selectFn?.(idx)
    } else {
      loadFn(idx)
    }
  }
}

// JSON helper
const serialize = (data: any) => JSON.stringify(data, null, 2)

// Build a snapshot of the current editable state (sliders + voices + banks)
function buildCurrentLiveState() {
  return {
    sliders: [...appState.sliders],
    voices: appState.voices.map(v => deepClone(v.saveable) as SaveableProperties),
    sliderBanks: {
      topLevel: appState.sliderBanks.topLevel.map(bank => [...bank])
    },
    currentTopLevelBank: appState.currentTopLevelBank
  }
}

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

// Produce the fully-resolved slice text (slider expressions evaluated)
const computeDisplayTextForVoice = (voice: VoiceState): string => {
  const groups = splitTextToGroups(voice.saveable.sliceText)
  const lines: string[] = []

  groups.forEach(group => {
    const { updatedClipLine } = buildClipFromLine(group.clipLine, true)
    if (group.rampLines.length) {
      lines.push(updatedClipLine, ...group.rampLines)
    } else {
      lines.push(updatedClipLine)
    }
  })

  return lines.join('\n')
}

// Function to resolve slider expressions in JavaScript code with line() calls
const resolveSliderExpressionsInJavaScript = (jsCode: string): string => {
  let processedCode = jsCode
  
  // Find all line() calls using common function
  const matches = findLineCallMatches(processedCode)
  
  // Process matches from end to beginning to avoid offset issues
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]
    
    try {
      // Find the main clip line (first non-empty, non-modifier line)
      const mainClipLine = match.lines.find(line => !line.content.trim().startsWith('=>'))
      
      if (mainClipLine) {
        // Transform only the main clip line
        const { updatedClipLine } = buildClipFromLine(mainClipLine.content, true)
        
        // Replace just the main clip line in the original code, leaving modifiers unchanged
        const beforeMainLine = processedCode.substring(0, mainClipLine.startIndex)
        const afterMainLine = processedCode.substring(mainClipLine.endIndex)
        processedCode = beforeMainLine + updatedClipLine + afterMainLine
      }
      
    } catch (error) {
      console.warn('Failed to resolve slider expressions in line:', match.lines[0]?.content || match.content, error)
      // Keep original if resolution fails
    }
  }
  
  return processedCode
}

// Enhanced update function that handles both text display and CodeMirror
const updateVoiceDisplays = (voiceIndex: number) => {
  const voice = appState.voices[voiceIndex]
  
  // Update the old text display (for non-JavaScript mode)
  voice.playingText = computeDisplayTextForVoice(voice)
  
  // Update CodeMirror editor if in JavaScript mode and it exists
  const codeMirrorEditor = codeMirrorEditors[voiceIndex]
  if (codeMirrorEditor && isJavascriptMode.value) {
    // Get the original Monaco content (with raw slider expressions)
    const monacoEditor = monacoEditors[voiceIndex]
    if (monacoEditor) {
      const originalJsCode = monacoEditor.getValue()
      
      // Resolve slider expressions in the JavaScript code
      const resolvedJsCode = resolveSliderExpressionsInJavaScript(originalJsCode)
      
      // Check if content has actually changed to avoid unnecessary updates
      const currentContent = codeMirrorEditor.state.doc.toString()
      if (currentContent !== resolvedJsCode) {
        codeMirrorEditor.dispatch({
          changes: {
            from: 0,
            to: codeMirrorEditor.state.doc.length,
            insert: resolvedJsCode
          }
        })
      }
    }
  }
}

// Set up a debounced watcher per-voice that recomputes the display text at
// most 10×/second whenever its slice definition OR any slider value changes.
appState.voices.forEach((voice, vIdx) => {
  const debouncedUpdate = debounce(() => {
    updateVoiceDisplays(vIdx)
  }, 100) // 100 ms → 10 Hz max

  // Initial computation
  debouncedUpdate()

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
  
  <!-- Top Level Slider Banks -->
  <div class="slider-banks-section">
    <h4>Top Level Slider Banks (Click: Load, Shift+Click: Save)</h4>
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
              @input="updatePianoFX(idx, paramName)" 
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
</style>