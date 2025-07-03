// editorManager.ts – common editor setup & decoration utilities

import * as monaco from 'monaco-editor'
import { EditorView, basicSetup } from 'codemirror'
import { Decoration, type DecorationSet } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { buildClipFromLine, findLineCallMatches, splitTextToGroups, type UUIDMapping, resolveSliderExpressionsInJavaScript } from './transformHelpers'
import type { NoteInfo, PianoRoll } from '@/music/pianoRoll'
import type { SonarAppState } from '../appState'

// ---------------------------------------------------------------------------
//  Shared arrays so callers can address editors by voice-index
// ---------------------------------------------------------------------------
export const monacoEditors: (monaco.editor.IStandaloneCodeEditor | undefined)[] = []
export const codeMirrorEditors: (EditorView | undefined)[] = []

// ---------------------------------------------------------------------------
//  Helper to check if content is a DSL line and extract the DSL text
// ---------------------------------------------------------------------------
function extractDslFromLine(lineContent: string): { isDsl: boolean, dslText?: string, prefixLength?: number } {
  // Check if line starts with line(`
  const lineCallMatch = lineContent.match(/^(\s*line\(`\s*)/)
  
  if (!lineCallMatch) {
    return { isDsl: false }
  }
  
  const prefix = lineCallMatch[1]
  const prefixLength = prefix.length
  const afterPrefix = lineContent.substring(prefixLength)
  
  // Check if this is a DSL line (not a ramp line)
  const isDslLine = /^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(afterPrefix) && 
                   !afterPrefix.trim().startsWith('=>')
  
  if (!isDslLine) {
    return { isDsl: false }
  }
  
  // Extract just the DSL pattern, removing trailing `) or `)
  const dslMatch = afterPrefix.match(/^([a-zA-Z_][a-zA-Z0-9_]*\s*:.*?)(?:\s*`\)|\s*$)/)
  if (dslMatch) {
    return { isDsl: true, dslText: dslMatch[1], prefixLength }
  }
  
  return { isDsl: false }
}



// ---------------------------------------------------------------------------
//  CodeMirror line-highlight decorations
// ---------------------------------------------------------------------------
export const scheduledLineEffect = StateEffect.define<{ lineNumbers: number[] }>()
export const currentLineEffect   = StateEffect.define<{ lineNumber: number | null; endLineNumber?: number }>()
export const dslOutlineEffect    = StateEffect.define<{ ranges: { from: number, to: number }[] }>()
export const clickedDslEffect   = StateEffect.define<{ range: { from: number, to: number } | null }>()

const scheduledLineDeco = Decoration.line({ attributes: { class: 'cm-scheduled-line' } })
const currentLineDeco   = Decoration.line({ attributes: { class: 'cm-current-line'   } })
const dslOutlineDeco    = Decoration.mark({ attributes: { class: 'cm-dsl-outline'     } })
const clickedDslDeco    = Decoration.mark({ attributes: { class: 'cm-clicked-dsl'    } })

export const lineHighlightField = StateField.define<DecorationSet>({
  create() { return Decoration.none },
  update(decos, tr) {
    decos = decos.map(tr.changes)

    for (const effect of tr.effects) {
      if (effect.is(scheduledLineEffect)) {
        decos = decos.update({
          filter: (_f, _t, d) => !d.spec.attributes?.class?.includes('cm-scheduled-line')
        })
        const adds = effect.value.lineNumbers.flatMap((ln) => {
          if (ln < 1 || ln > tr.state.doc.lines) return []
          const line = tr.state.doc.line(ln)
          return [scheduledLineDeco.range(line.from)]
        })
        decos = decos.update({ add: adds })
      }

      if (effect.is(currentLineEffect)) {
        decos = decos.update({
          filter: (_f, _t, d) => !d.spec.attributes?.class?.includes('cm-current-line')
        })
        if (effect.value.lineNumber !== null) {
          const from = effect.value.lineNumber
          const to   = effect.value.endLineNumber ?? from
          const adds = [] as any[]
          for (let ln = from; ln <= to; ln++) {
            if (ln < 1 || ln > tr.state.doc.lines) continue
            const line = tr.state.doc.line(ln)
            adds.push(currentLineDeco.range(line.from))
          }
          decos = decos.update({ add: adds })
        }
      }

      if (effect.is(dslOutlineEffect)) {
        decos = decos.update({
          filter: (_f, _t, d) => !d.spec.attributes?.class?.includes('cm-dsl-outline')
        })
        const adds = effect.value.ranges.map(range => 
          dslOutlineDeco.range(range.from, range.to)
        )
        decos = decos.update({ add: adds })
      }

      if (effect.is(clickedDslEffect)) {
        decos = decos.update({
          filter: (_f, _t, d) => !d.spec.attributes?.class?.includes('cm-clicked-dsl')
        })
        if (effect.value.range !== null) {
          decos = decos.update({ 
            add: [clickedDslDeco.range(effect.value.range.from, effect.value.range.to)] 
          })
        }
      }
    }

    return decos
  },
  provide: f => EditorView.decorations.from(f)
})

// ---------------------------------------------------------------------------
//  Helper to update CodeMirror text programmatically
// ---------------------------------------------------------------------------
export function setCodeMirrorContent(voiceIndex: number, newContent: string) {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: newContent } })
  
  //todo - should setting DSL decet+click decorators happen here? in general, decorator logic needs consolidation

  // Update DSL outlines after content change
  updateDslOutlines(voiceIndex, newContent)
  
  // Restore clicked DSL range if it exists
  const clickedRange = clickedDslRanges.get(voiceIndex.toString())
  if (clickedRange !== null && clickedRange !== undefined) {
    highlightClickedDsl(voiceIndex, clickedRange)
  }
}

// ---------------------------------------------------------------------------
//  Highlight helpers (current-line only – scheduled is caller-specific)
// ---------------------------------------------------------------------------
export function highlightCurrentLine(voiceIndex: number, lineNumber: number | null, endLineNumber?: number) {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  editor.dispatch({ effects: currentLineEffect.of({ lineNumber, endLineNumber }) })
}

// ---------------------------------------------------------------------------
//  Scheduled line highlight helper – caller supplies exact line numbers
// ---------------------------------------------------------------------------
export function highlightScheduledLines(voiceIndex: number, lineNumbers: number[]) {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  editor.dispatch({ effects: scheduledLineEffect.of({ lineNumbers }) })
}

// ---------------------------------------------------------------------------
//  DSL outline highlight helper - highlights clickable DSL lines
// ---------------------------------------------------------------------------
export function highlightDslOutlines(voiceIndex: number, ranges: { from: number, to: number }[]) {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  editor.dispatch({ effects: dslOutlineEffect.of({ ranges }) })
}

// ---------------------------------------------------------------------------
//  Clicked DSL highlight helper - highlights a clicked DSL line
// ---------------------------------------------------------------------------
export function highlightClickedDsl(voiceIndex: number, range: { from: number, to: number } | null) {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  editor.dispatch({ effects: clickedDslEffect.of({ range }) })
}

// ---------------------------------------------------------------------------
//  DSL Line Click Decorator Plugin
// ---------------------------------------------------------------------------
export const createDslClickPlugin = (
  voiceIndex: number, 
  onDslLineClick: (lineContent: string, lineNumber: number, voiceIndex: number) => void,
  clickedDslRanges: Map<string, { from: number, to: number } | null>
) => {
  return ViewPlugin.fromClass(class {
    constructor() {}
    
    update(update: ViewUpdate) {
      // Plugin updates when needed
    }
  }, {
    eventHandlers: {
      click: (event: MouseEvent, view: EditorView) => {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (!pos) return false
        
        const doc = view.state.doc
        const line = doc.lineAt(pos)
        const lineContent = line.text
        
        // Use helper to extract DSL
        const dslExtract = extractDslFromLine(lineContent)
        
        if (dslExtract.isDsl && dslExtract.dslText && dslExtract.prefixLength !== undefined) {
          const from = line.from + dslExtract.prefixLength
          const to = from + dslExtract.dslText.length
          
          // Check if click is within DSL text
          if (pos >= from && pos <= to) {
            const range = { from, to }
            
            // Set highlight
            clickedDslRanges.set(voiceIndex.toString(), range)
            highlightClickedDsl(voiceIndex, range)
            onDslLineClick(dslExtract.dslText, line.number, voiceIndex)
            return true
          }
        }
        
        // If clicked outside any DSL pattern, clear highlight
        clickedDslRanges.set(voiceIndex.toString(), null)
        highlightClickedDsl(voiceIndex, null)
        return false
      }
    }
  })
}

// ---------------------------------------------------------------------------
//  Complete editor initialization functions
// ---------------------------------------------------------------------------
export function initializeMonacoEditorComplete(
  containerId: string,
  voiceIndex: number,
  getInitialCode: () => string,
  onContentChange: (code: string, voiceIndex: number) => void,
  syncToCodeMirror: (voiceIndex: number, content: string) => void
) {
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

  const initialCode = getInitialCode() || defaultCode

  const editor = monaco.editor.create(container, {
    value: initialCode,
    language: 'javascript',
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: 'on',
    wordWrap: 'on'
  })
  
  // Persist and sync content on change
  editor.onDidChangeModelContent(() => {
    const newContent = editor.getValue()
    onContentChange(newContent, voiceIndex)
    syncToCodeMirror(voiceIndex, newContent)
  })
  
  monacoEditors[voiceIndex] = editor
  onContentChange(initialCode, voiceIndex) // Ensure initial code is stored
}

// Store clicked DSL ranges per voice
export const clickedDslRanges = new Map<string, { from: number, to: number } | null>()

export function initializeCodeMirrorEditorComplete(
  containerId: string,
  voiceIndex: number,
  getInitialContent: () => string,
  onDslLineClick?: (lineContent: string, lineNumber: number, voiceIndex: number) => void
) {
  const container = document.getElementById(containerId)
  if (!container) return

  const initialContent = getInitialContent() || `// Voice ${voiceIndex + 1} - JavaScript Livecoding
line(\`debug1 : seg 1\`)
line(\`debug2 : seg 2\`)
line(\`debug3 : seg 3\`)`

  const extensions = [
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
      },
      '.cm-dsl-outline': {
        outline: '2px solid #ff8c00',
        outlineOffset: '1px',
        cursor: 'pointer',
        borderRadius: '2px'
      },
      '.cm-clicked-dsl': {
        backgroundColor: 'rgba(255, 140, 0, 0.3)',
        outline: '2px solid #ff8c00',
        outlineOffset: '1px',
        borderRadius: '2px'
      },
      '.cm-dsl-clickable': {
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.1)'
        }
      }
    })
  ]

  // Add DSL click plugin if callback provided
  if (onDslLineClick) {
    extensions.push(createDslClickPlugin(voiceIndex, onDslLineClick, clickedDslRanges))
  }

  const editor = new EditorView({
    doc: initialContent,
    extensions,
    parent: container
  })
  
  codeMirrorEditors[voiceIndex] = editor
  
  // Apply initial DSL outlines
  updateDslOutlines(voiceIndex, initialContent)
} 

// Helper to identify DSL lines in content and update decorators
export function updateDslOutlines(voiceIndex: number, content: string) {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  
  const dslRanges: { from: number, to: number }[] = []
  const lines = content.split('\n')
  let offset = 0
  
  // Use helper to find DSL lines
  lines.forEach((line, index) => {
    const dslExtract = extractDslFromLine(line)
    
    if (dslExtract.isDsl && dslExtract.dslText && dslExtract.prefixLength !== undefined) {
      const from = offset + dslExtract.prefixLength
      const to = from + dslExtract.dslText.length
      dslRanges.push({ from, to })
    }
    
    // Update offset for next line (+1 for newline)
    offset += line.length + (index < lines.length - 1 ? 1 : 0)
  })
  
  // Apply decorators
  highlightDslOutlines(voiceIndex, dslRanges)
}

// Helper: convert a list of UUIDs to line numbers then call highlightScheduledLines from editorManager
export const applyScheduledHighlightByUUID = (voiceIndex: number, uuids: string[], voiceScheduledUUIDs: Map<string, string[]>, getMappingsForVoice: (voiceIndex: number) => UUIDMapping[]) => {
  voiceScheduledUUIDs.set(voiceIndex.toString(), uuids)
  const mappings = getMappingsForVoice(voiceIndex)
  const lineNumbers: number[] = []
  uuids.forEach(uuid => {
    const m = mappings.find(mi => mi.uuid === uuid)
    if (m) {
      for (let ln = m.startLineNumber; ln <= (m.endLineNumber || m.startLineNumber); ln++) {
        lineNumbers.push(ln)
      }
    }
  })
  highlightScheduledLines(voiceIndex, lineNumbers)
}

// Highlight current-line (or span) in CodeMirror based on UUID mapping
export const highlightCurrentLineByUUID = (voiceIndex: number, uuid: string | null, voiceActiveUUIDs: Map<string, string>, getMappingsForVoice: (voiceIndex: number) => UUIDMapping[]) => {
  voiceActiveUUIDs.set(voiceIndex.toString(), uuid)

  if (uuid === null) {
    highlightCurrentLine(voiceIndex, null)
    return
  }

  const mapping = getMappingsForVoice(voiceIndex).find(m => m.uuid === uuid)
  if (!mapping) return

  highlightCurrentLine(voiceIndex, mapping.startLineNumber, mapping.endLineNumber)
}

export const handleDslLineClick = (lineContent: string, lineNumber: number, voiceIndex: number, appState: SonarAppState, debugPianoRolls: PianoRoll<{}>[], ) => {
  console.log(`DSL line clicked - Voice ${voiceIndex}, Line ${lineNumber}: ${lineContent}`)

  const lineIndex = lineNumber - 1
  
  // Get the debug piano roll for this voice
  const debugPianoRoll = debugPianoRolls[voiceIndex]
  if (!debugPianoRoll) {
    console.warn(`Debug piano roll not found for voice ${voiceIndex}`)
    return
  }
  
  // Get the full content from the CodeMirror editor to find complete DSL group
  const codeMirrorEditor = codeMirrorEditors[voiceIndex]
  if (!codeMirrorEditor) {
    console.warn(`CodeMirror editor not found for voice ${voiceIndex}`)
    return
  }

  const monacoEditor = monacoEditors[voiceIndex]
  if (!monacoEditor) {
    console.warn(`Monaco editor not found for voice ${voiceIndex}`)
    return
  }
  
  const fullContent = monacoEditor.getValue()
  
  let clipLine = ''
  
  // First, check if this line is part of a line() call using the existing parser
  const lineMatches = findLineCallMatches(fullContent)
  
  for (const match of lineMatches) {
    // Check if the clicked line is the line() call itself
    if (lineIndex === match.templateStartLine) {
      // Found the line() call that contains the clicked line
      clipLine = match.lines[0].content
      break
    }
  }
  
  console.log(`Complete DSL group:`, clipLine)
  
  // Try to parse the DSL and update piano roll
  try {    
    setPianoRollFromDslLine(clipLine, voiceIndex, appState, debugPianoRolls)
  } catch (error) {
    console.error('Error updating debug piano roll from DSL line:', error)
  }
}

export const setPianoRollFromDslLine = (lineContent: string, voiceIndex: number, appState: SonarAppState, debugPianoRolls: PianoRoll<{}>[]) => {
  const debugPianoRoll = debugPianoRolls[voiceIndex]
  if (!debugPianoRoll) {
    console.warn(`Debug piano roll not found for voice ${voiceIndex}`)
    return
  }

  const { clip } = buildClipFromLine(lineContent, appState.sliders)
  if (!clip) return

  // Convert AbletonClip to PianoRoll NoteInfo format
  const noteInfos: NoteInfo<{}>[] = clip.notes.map(note => ({
    pitch: note.pitch,
    position: note.position,
    duration: note.duration,
    velocity: note.velocity,
    metadata: {}
  }))

  // Clear and refill the existing piano roll
  debugPianoRoll.setNoteData(noteInfos)
  debugPianoRoll.setViewportToShowAllNotes()
  
  console.log(`Updated debug piano roll for voice ${voiceIndex} with ${noteInfos.length} notes`)
  
  return noteInfos
}