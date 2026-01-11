// editorManager.ts – common editor setup & decoration utilities

const EDITOR_MAX_HEIGHT = '400px'

import * as monaco from 'monaco-editor'
import { EditorView, basicSetup } from 'codemirror'
import { Decoration, type DecorationSet } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { buildClipFromLine, findLineCallMatches, type UUIDMapping } from './transformHelpers'
import type { NoteInfo, PianoRoll } from '@/music/pianoRoll'
import type { SonarAppState } from '../appState'

// ---------------------------------------------------------------------------
//  Shared arrays so callers can address editors by voice-index
// ---------------------------------------------------------------------------
export const monacoEditors: (monaco.editor.IStandaloneCodeEditor | undefined)[] = []
export const codeMirrorEditors: (EditorView | undefined)[] = []
export const codeMirrorEditorsByName: Map<string, EditorView> = new Map()

// ---------------------------------------------------------------------------
//  Helper to check if content is a DSL line and extract the DSL text
// ---------------------------------------------------------------------------
export function extractDslFromLine(lineContent: string): { isDsl: boolean, dslText?: string, prefixLength?: number } {
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
//  Helper to get partial DSL text up to a hover position
// ---------------------------------------------------------------------------
function getPartialDslAtPosition(dslText: string, relativePos: number): { partialDsl: string | null, partialLength: number, segmentCount: number } {
  // Split by colon but keep the structure
  const parts = dslText.split(/\s*:\s*/)
  let currentPos = 0
  let segmentCount = 0
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const partEnd = currentPos + part.length
    
    // Check if position is within this part
    if (relativePos <= partEnd || i === parts.length - 1) {
      segmentCount = i + 1
      // Reconstruct the partial DSL with proper formatting
      const partialDsl = parts.slice(0, segmentCount).join(' : ')
      // Calculate actual length including colons and spaces
      const partialLength = partialDsl.length
      return { partialDsl, partialLength, segmentCount }
    }
    
    // Move past this part and the colon/spaces
    currentPos = partEnd
    // Account for the " : " separator if not the last part
    if (i < parts.length - 1) {
      const nextColonIndex = dslText.indexOf(':', currentPos)
      if (nextColonIndex !== -1) {
        currentPos = nextColonIndex + 1
        // Skip spaces after colon
        while (currentPos < dslText.length && dslText[currentPos] === ' ') {
          currentPos++
        }
      }
    }
  }
  
  return { partialDsl: dslText, partialLength: dslText.length, segmentCount: parts.length }
}

// ---------------------------------------------------------------------------
//  Helper to get partial DSL by segment count from original text
// ---------------------------------------------------------------------------
function getPartialDslBySegmentCount(dslText: string, segmentCount: number): string {
  const parts = dslText.split(/\s*:\s*/)
  return parts.slice(0, segmentCount).join(' : ')
}



// ---------------------------------------------------------------------------
//  CodeMirror line-highlight decorations
// ---------------------------------------------------------------------------
export const scheduledLineEffect = StateEffect.define<{ lineNumbers: number[] }>()
export const currentLineEffect   = StateEffect.define<{ lineNumber: number | null; endLineNumber?: number }>()
export const dslOutlineEffect    = StateEffect.define<{ ranges: { from: number, to: number }[] }>()
export const clickedDslEffect   = StateEffect.define<{ range: { from: number, to: number } | null }>()
export const hoverDslEffect     = StateEffect.define<{ range: { from: number, to: number } | null }>()

const scheduledLineDeco = Decoration.line({ attributes: { class: 'cm-scheduled-line' } })
const currentLineDeco   = Decoration.line({ attributes: { class: 'cm-current-line'   } })
const dslOutlineDeco    = Decoration.mark({ attributes: { class: 'cm-dsl-outline'     } })
const clickedDslDeco    = Decoration.mark({ attributes: { class: 'cm-clicked-dsl'    } })
const hoverDslDeco      = Decoration.mark({ attributes: { class: 'cm-hover-dsl'      } })

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

      if (effect.is(hoverDslEffect)) {
        // Debug log before update
        const before: any[] = []
        decos.between(0, tr.state.doc.length, (from, to, decoration) => {
          if (decoration.spec.attributes?.class?.includes('cm-hover-dsl')) {
            before.push({ from, to })
          }
        })
        
        decos = decos.update({
          filter: (_f, _t, d) => !d.spec.attributes?.class?.includes('cm-hover-dsl')
        })
        if (effect.value.range !== null) {
          decos = decos.update({ 
            add: [hoverDslDeco.range(effect.value.range.from, effect.value.range.to)] 
          })
          addLog(`Hover update: cleared ${before.length} old hover decos, added new hover [${effect.value.range.from}-${effect.value.range.to}]`)
        } else {
          addLog(`Hover update: cleared ${before.length} hover decos`)
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
  
  //todo - should setting DSL decet+click decorators happen here? in general, decorator logic + state-flow needs consolidation

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
//  Hover DSL highlight helper - highlights a hovered DSL section
// ---------------------------------------------------------------------------
export function highlightHoverDsl(voiceIndex: number, range: { from: number, to: number } | null) {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  editor.dispatch({ effects: hoverDslEffect.of({ range }) })
}

// ---------------------------------------------------------------------------
//  Decorator Debug Logging
// ---------------------------------------------------------------------------
let lastLoggedDecorators = ''
let lastLoggedLineNumber = -1

// Store logs in a global array
const dslDecoratorLogs: string[] = []

// Make logs accessible via window
if (typeof window !== 'undefined') {
  (window as any).dslDecoratorLogs = dslDecoratorLogs;
  
  // Add download function
  (window as any).downloadDslLogs = () => {
    const logContent = dslDecoratorLogs.join('\n')
    const blob = new Blob([logContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dsl-decorator-logs-${new Date().toISOString()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    console.log(`Downloaded ${dslDecoratorLogs.length} log entries`)
  }
  
  // Add clear function
  (window as any).clearDslLogs = () => {
    dslDecoratorLogs.length = 0
    console.log('DSL decorator logs cleared')
  }
  
  // Add copy to clipboard function
  (window as any).copyDslLogs = async () => {
    const logContent = dslDecoratorLogs.join('\n')
    try {
      await navigator.clipboard.writeText(logContent)
      console.log(`Copied ${dslDecoratorLogs.length} log entries to clipboard`)
    } catch (err) {
      console.error('Failed to copy logs to clipboard:', err)
      // Fallback method
      const textArea = document.createElement('textarea')
      textArea.value = logContent
      textArea.style.position = 'fixed'
      textArea.style.top = '0'
      textArea.style.left = '0'
      textArea.style.width = '2em'
      textArea.style.height = '2em'
      textArea.style.padding = '0'
      textArea.style.border = 'none'
      textArea.style.outline = 'none'
      textArea.style.boxShadow = 'none'
      textArea.style.background = 'transparent'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      try {
        document.execCommand('copy')
        console.log(`Copied ${dslDecoratorLogs.length} log entries to clipboard (fallback method)`)
      } catch (err2) {
        console.error('Fallback copy also failed:', err2)
      }
      document.body.removeChild(textArea)
    }
  }
}

function addLog(message: string) {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}`
  dslDecoratorLogs.push(logEntry)
  console.log(`[DSL Decorators] ${message}`)
}

function logLineDecorators(view: EditorView, lineNumber: number, mousePos: number, hoverRange: { from: number, to: number } | null) {
  const line = view.state.doc.line(lineNumber)
  const decorations = view.state.field(lineHighlightField)
  
  // Find all decorations that overlap with this line
  const lineDecorators: Array<{ from: number, to: number, class: string }> = []
  
  decorations.between(line.from, line.to, (from, to, decoration) => {
    const spec = decoration.spec
    const className = spec?.attributes?.class || 'unknown'
    lineDecorators.push({ from, to, class: className })
  })
  
  // Sort by position for consistent output
  lineDecorators.sort((a, b) => a.from - b.from || a.to - b.to)
  
  // Create a string representation
  const decoratorInfo = lineDecorators.map(d => 
    `[${d.from}-${d.to}:${d.class}]`
  ).join(' ')
  
  // Check if this is first or last line
  const isFirstLine = lineNumber === 1
  const isLastLine = lineNumber === view.state.doc.lines
  const boundary = isFirstLine || isLastLine ? ` (${isFirstLine ? 'FIRST' : ''}${isLastLine ? 'LAST' : ''} LINE)` : ''
  
  // Extract DSL info for this line
  const lineContent = line.text
  const dslExtract = extractDslFromLine(lineContent)
  let dslInfo = ''
  if (dslExtract.isDsl && dslExtract.dslText && dslExtract.prefixLength !== undefined) {
    const dslStart = line.from + dslExtract.prefixLength
    const dslEnd = dslStart + dslExtract.dslText.length
    dslInfo = ` DSL[${dslStart}-${dslEnd}]`
    
    // Calculate relative mouse position within DSL
    if (mousePos >= dslStart && mousePos <= dslEnd) {
      const relPos = mousePos - dslStart
      dslInfo += ` relPos:${relPos}`
    }
  }
  
  const logString = `Line ${lineNumber}${boundary} (mouse@${mousePos}${dslInfo}, hover:${hoverRange ? `${hoverRange.from}-${hoverRange.to}` : 'none'}): ${decoratorInfo || 'no decorators'}`
  
  // Only log if something changed
  if (logString !== lastLoggedDecorators || lineNumber !== lastLoggedLineNumber) {
    addLog(logString)
    lastLoggedDecorators = logString
    lastLoggedLineNumber = lineNumber
  }
}

// ---------------------------------------------------------------------------
//  DSL Hover Handler Plugin
// ---------------------------------------------------------------------------
const createDslHoverPlugin = (voiceIndex: number) => {
  let currentHoverRange: { from: number, to: number } | null = null
  
  return EditorView.domEventHandlers({
    mousemove: (event, view) => {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (!pos) {
        if (currentHoverRange) {
          view.dispatch({ effects: hoverDslEffect.of({ range: null }) })
          currentHoverRange = null
        }
        return false
      }
      
      const doc = view.state.doc
      const line = doc.lineAt(pos)
      const lineContent = line.text
      
      // Extract DSL from line
      const dslExtract = extractDslFromLine(lineContent)
      if (!dslExtract.isDsl || !dslExtract.dslText || dslExtract.prefixLength === undefined) {
        if (currentHoverRange) {
          view.dispatch({ effects: hoverDslEffect.of({ range: null }) })
          currentHoverRange = null
        }
        return false
      }
      
      // Check if hover is within DSL text
      const dslStart = line.from + dslExtract.prefixLength
      const dslEnd = dslStart + dslExtract.dslText.length
      
      if (pos < dslStart || pos > dslEnd) {
        if (currentHoverRange) {
          view.dispatch({ effects: hoverDslEffect.of({ range: null }) })
          currentHoverRange = null
        }
        return false
      }
      
      // Get the relative position within the DSL text
      const relativePos = pos - dslStart
      const { partialDsl, partialLength, segmentCount } = getPartialDslAtPosition(dslExtract.dslText, relativePos)
      
      if (!partialDsl) {
        if (currentHoverRange) {
          view.dispatch({ effects: hoverDslEffect.of({ range: null }) })
          currentHoverRange = null
        }
        return false
      }
      
      // For resolved DSL, we need to recalculate the actual length since it may differ
      // Just use the position we calculated
      const partialEnd = dslStart + partialLength
      const newRange = { from: dslStart, to: partialEnd }
      
      // Debug log the calculation
      if (!currentHoverRange || currentHoverRange.from !== newRange.from || currentHoverRange.to !== newRange.to) {
        addLog(`Hover calc: pos=${pos}, dslStart=${dslStart}, relPos=${relativePos}, dslText="${dslExtract.dslText}", partialDsl="${partialDsl}", partialLength=${partialLength}, newRange=${newRange.from}-${newRange.to}`)
      }
      
      // Only update if range changed
      if (!currentHoverRange || currentHoverRange.from !== newRange.from || currentHoverRange.to !== newRange.to) {
        view.dispatch({ effects: hoverDslEffect.of({ range: newRange }) })
        currentHoverRange = newRange
      }
      
      // Log decorators after potential update
      logLineDecorators(view, line.number, pos, currentHoverRange)
      
      return false
    },
    
    mouseleave: (event, view) => {
      if (currentHoverRange) {
        addLog('Mouse leave - clearing hover decoration')
        view.dispatch({ effects: hoverDslEffect.of({ range: null }) })
        currentHoverRange = null
      }
      return false
    }
  })
}

// ---------------------------------------------------------------------------
//  DSL Line Click Decorator Plugin
// ---------------------------------------------------------------------------
export const createDslClickPlugin = (
  voiceIndex: number, 
  onDslLineClick: (lineContent: string, lineNumber: number, voiceIndex: number, originalText?: string) => void,
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
            // Get the relative position within the DSL text for partial selection
            const relativePos = pos - from
            const { partialDsl, partialLength, segmentCount } = getPartialDslAtPosition(dslExtract.dslText, relativePos)
            
            if (!partialDsl) return false
            
            // Calculate the range for the partial DSL
            const partialEnd = from + partialLength
            const range = { from, to: partialEnd }
            
            // Get the original DSL text from Monaco editor at the same line
            const monacoEditor = monacoEditors[voiceIndex]
            let originalDslText: string | undefined
            
            if (monacoEditor) {
              const monacoModel = monacoEditor.getModel()
              if (monacoModel) {
                // Get the same line from Monaco editor
                const monacoLine = monacoModel.getLineContent(line.number)
                const monacoExtract = extractDslFromLine(monacoLine)
                if (monacoExtract.isDsl && monacoExtract.dslText) {
                  // Use segment count to get the same partial from original
                  originalDslText = getPartialDslBySegmentCount(monacoExtract.dslText, segmentCount)
                }
              }
            }
            
            // Clear hover effect
            view.dispatch({ effects: hoverDslEffect.of({ range: null }) })
            
            // Set highlight
            clickedDslRanges.set(voiceIndex.toString(), range)
            highlightClickedDsl(voiceIndex, range)
            // Store the segment count for re-rendering on slider changes
            clickedDslSegmentCounts.set(voiceIndex.toString(), segmentCount)
            onDslLineClick(partialDsl, line.number, voiceIndex, originalDslText)
            return true
          }
        }
        
        // Don't clear highlight when clicking non-DSL lines
        // The highlight should persist to show which DSL is in the piano roll
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
) {
  const container = document.getElementById(containerId)
  if (!container) return

  // Apply max-width and horizontal scrolling styles to the container
  container.style.maxWidth = '800px'
  container.style.width = '100%'
  container.style.overflow = 'auto'

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
    wordWrap: 'off', // Disable word wrap to enable horizontal scrolling
    scrollBeyondLastLine: false,
    scrollbar: {
      horizontal: 'auto',
      vertical: 'auto'
    }
  })
  
  // Persist and sync content on change
  editor.onDidChangeModelContent(() => {
    const newContent = editor.getValue()
    onContentChange(newContent, voiceIndex)
  })
  
  monacoEditors[voiceIndex] = editor
  onContentChange(initialCode, voiceIndex) // Ensure initial code is stored
}

// Store clicked DSL ranges and original text per voice
export const clickedDslRanges = new Map<string, { from: number, to: number } | null>()
export const clickedDslOriginalText = new Map<string, string | null>()
export const clickedDslSegmentCounts = new Map<string, number>()

export function initializeCodeMirrorEditorComplete(
  containerId: string,
  voiceIndex: number,
  getInitialContent: () => string,
  onDslLineClick?: (lineContent: string, lineNumber: number, voiceIndex: number, originalText: string) => void,
  isMusicCodeEditor: boolean = true,
  editorName: string = ''
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
    EditorView.theme({
      '&': { 
        maxHeight: EDITOR_MAX_HEIGHT,
        maxWidth: '800px',
        width: '100%'
      },
      '.cm-scroller': { 
        overflow: 'auto',
        maxHeight: EDITOR_MAX_HEIGHT,
        overflowX: 'auto',
        overflowY: 'auto'
      },
      '.cm-content': {
        whiteSpace: 'pre',
        wordWrap: 'normal',
        overflowWrap: 'normal'
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
        boxShadow: '0 0 0 2px #ff8c00',
        cursor: 'pointer',
        borderRadius: '2px'
      },
      '.cm-clicked-dsl': {
        backgroundColor: 'rgba(255, 140, 0, 0.3)',
        boxShadow: '0 0 0 2px #ff8c00',
        borderRadius: '2px'
      },
      '.cm-hover-dsl': {
        backgroundColor: 'rgba(255, 140, 0, 0.15)',
        borderRadius: '2px',
        transition: 'background-color 0.1s ease'
      },
      '.cm-dsl-clickable': {
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.1)'
        }
      }
    })
  ]

  if (isMusicCodeEditor) {
    extensions.push(EditorView.editable.of(false)) // Read-only for visualization
    // Add DSL click plugin if callback provided
    if (onDslLineClick) {
      extensions.push(createDslClickPlugin(voiceIndex, onDslLineClick, clickedDslRanges))
    }
    
    // Add hover handler for DSL partial highlighting
    extensions.push(createDslHoverPlugin(voiceIndex))
  }

  const editor = new EditorView({
    doc: initialContent,
    extensions,
    parent: container
  })

  if(editorName) codeMirrorEditorsByName.set(editorName, editor)
  
  if (isMusicCodeEditor) {
    codeMirrorEditors[voiceIndex] = editor
    codeMirrorEditorsByName.set('voice-'+voiceIndex, editor)
    
    // Apply initial DSL outlines
    updateDslOutlines(voiceIndex, initialContent)
  }
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

export const handleDslLineClick = (lineContent: string, lineNumber: number, voiceIndex: number, appState: SonarAppState, debugPianoRolls: PianoRoll<{}>[], originalDslText?: string) => {
  console.log(`DSL line clicked - Voice ${voiceIndex}, Line ${lineNumber}: ${lineContent}`)

  const lineIndex = lineNumber - 1
  
  // Get the debug piano roll for this voice
  const debugPianoRoll = debugPianoRolls[voiceIndex]
  if (!debugPianoRoll) {
    console.warn(`Debug piano roll not found for voice ${voiceIndex}`)
    return
  }
  
  // If we have the original DSL text, use it directly
  if (originalDslText) {
    clickedDslOriginalText.set(voiceIndex.toString(), originalDslText)
    setPianoRollFromDslLine(originalDslText, voiceIndex, appState, debugPianoRolls)
    return
  }
  
  // Otherwise fall back to the old method
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
    clickedDslOriginalText.set(voiceIndex.toString(), clipLine)
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

export const clearPianoRoll = (voiceIndex: number, debugPianoRolls: PianoRoll<{}>[]) => {
  const debugPianoRoll = debugPianoRolls[voiceIndex]
  if (!debugPianoRoll) {
    console.warn(`Debug piano roll not found for voice ${voiceIndex}`)
    return
  }
  
  // Clear the piano roll
  debugPianoRoll.setNoteData([])
  console.log(`Cleared debug piano roll for voice ${voiceIndex}`)
}

export const clearAllDslHighlights = (voiceIndex: number) => {
  const editor = codeMirrorEditors[voiceIndex]
  if (!editor) return
  
  // Clear hover, clicked, and any other DSL highlights
  editor.dispatch({ 
    effects: [
      hoverDslEffect.of({ range: null }),
      clickedDslEffect.of({ range: null })
    ]
  })
  
  // Clear stored state
  clickedDslRanges.set(voiceIndex.toString(), null)
  clickedDslOriginalText.set(voiceIndex.toString(), null)
  clickedDslSegmentCounts.delete(voiceIndex.toString())
}