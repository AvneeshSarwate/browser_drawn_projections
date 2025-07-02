// editorManager.ts – common editor setup & decoration utilities

import * as monaco from 'monaco-editor'
import { EditorView, basicSetup } from 'codemirror'
import { Decoration, type DecorationSet } from '@codemirror/view'
import { StateField, StateEffect } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'

// ---------------------------------------------------------------------------
//  Shared arrays so callers can address editors by voice-index
// ---------------------------------------------------------------------------
export const monacoEditors: (monaco.editor.IStandaloneCodeEditor | undefined)[] = []
export const codeMirrorEditors: (EditorView | undefined)[] = []



// ---------------------------------------------------------------------------
//  CodeMirror line-highlight decorations
// ---------------------------------------------------------------------------
export const scheduledLineEffect = StateEffect.define<{ lineNumbers: number[] }>()
export const currentLineEffect   = StateEffect.define<{ lineNumber: number | null; endLineNumber?: number }>()

const scheduledLineDeco = Decoration.line({ attributes: { class: 'cm-scheduled-line' } })
const currentLineDeco   = Decoration.line({ attributes: { class: 'cm-current-line'   } })

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
//  DSL Line Click Decorator Plugin
// ---------------------------------------------------------------------------
export const createDslClickPlugin = (
  voiceIndex: number, 
  onDslLineClick: (lineContent: string, lineNumber: number, voiceIndex: number) => void
) => {
  return ViewPlugin.fromClass(class {
    constructor() {}
    
    update(update: ViewUpdate) {
      // Plugin updates when needed
    }
  }, {
    eventHandlers: {
      click: (event: MouseEvent, view: EditorView) => {
        const target = event.target as HTMLElement
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (!pos) return false
        
        const doc = view.state.doc
        const line = doc.lineAt(pos)
        const lineContent = line.text.trim()
        
        // Check if this looks like a DSL line (contains line() call or simple DSL pattern)
        const isDslLine = lineContent.includes('line(`') || 
                         /^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(lineContent)
        
        if (isDslLine) {
          onDslLineClick(lineContent, line.number, voiceIndex)
          return true
        }
        
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
    extensions.push(createDslClickPlugin(voiceIndex, onDslLineClick))
  }

  const editor = new EditorView({
    doc: initialContent,
    extensions,
    parent: container
  })
  
  codeMirrorEditors[voiceIndex] = editor
} 
