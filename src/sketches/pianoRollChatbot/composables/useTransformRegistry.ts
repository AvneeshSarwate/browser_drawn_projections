import { ref, reactive } from 'vue'
import { Parser } from 'acorn'
import * as walk from 'acorn-walk'
import type { NoteDataInput } from '../components/pianoRoll/pianoRollState'
import type Anthropic from '@anthropic-ai/sdk'
import { transformLibs, type TransformLibs } from '@/music/transformLibs'

interface GridInfo {
  maxLength: number
  timeSignature: number
  subdivision: number
}

interface ParamInfo {
  name: string
  description?: string
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  functionName?: string
  params?: ParamInfo[]
  jsdocSummary?: string
  compiled?: (notes: NoteDataInput[], libs: TransformLibs, ...args: number[]) => NoteDataInput[]
}

export interface TransformSlot {
  code: string
  isValid: boolean
  name: string
  functionName?: string
  params: ParamInfo[]
  errors: string[]
  compiled?: (notes: NoteDataInput[], libs: TransformLibs, ...args: number[]) => NoteDataInput[]
  jsdocSummary?: string
}

interface TransformRegistryConfig {
  getNotes: () => NoteDataInput[]
  setNotes: (notes: NoteDataInput[]) => void
  getGrid: () => GridInfo
}

const MAX_NOTES = 512
const MAX_UNDO_STACK = 20

function validateClampNotes(inputNotes: any[], grid: GridInfo): NoteDataInput[] {
  const notes = inputNotes.slice(0, MAX_NOTES)
  
  return notes.map((n, i) => {
    const pitch = Math.max(0, Math.min(127, Math.round(n.pitch ?? 60)))
    const position = Math.max(0, n.position ?? 0)
    const minDuration = 1 / grid.subdivision
    const duration = Math.max(minDuration, n.duration ?? 0.25)
    const velocity = Math.max(0, Math.min(127, n.velocity ?? 100))
    
    const maxDuration = Math.max(minDuration, grid.maxLength - position)
    
    return {
      id: n.id || `note-${Date.now()}-${i}`,
      pitch,
      position,
      duration: Math.min(duration, maxDuration),
      velocity
    }
  })
}

function extractJSDocParams(comments: any[], paramNames: string[]): { params: ParamInfo[]; summary?: string } {
  const params: ParamInfo[] = paramNames.map(name => ({ name }))
  let summary: string | undefined
  
  for (const comment of comments) {
    if (comment.type === 'Block' && comment.value.trim().startsWith('*')) {
      const lines = comment.value.split('\n').map((l: string) => l.trim())
      
      // Extract first non-empty line as summary
      for (const line of lines) {
        const cleaned = line.replace(/^\*\s*/, '').trim()
        if (cleaned && !cleaned.startsWith('@')) {
          summary = cleaned
          break
        }
      }
      
      // Extract param descriptions
      for (const line of lines) {
        const paramMatch = line.match(/@param\s*\{[^}]+\}\s*(\w+)\s*-?\s*(.*)/)
        if (paramMatch) {
          const [, name, description] = paramMatch
          const param = params.find(p => p.name === name)
          if (param && description) {
            param.description = description.trim()
          }
        }
      }
      
      // Fallback: check if each param name appears in any line
      for (const param of params) {
        if (param.name === 'notes' || param.name === 'libs') continue // Skip notes and libs parameters
        if (!param.description) {
          for (const line of lines) {
            if (line.includes(param.name) && !line.startsWith('function')) {
              param.description = line.replace(/^\*\s*/, '').replace(/@param.*/, '').trim()
              break
            }
          }
        }
      }
      
      break
    }
  }
  
  return { params, summary }
}

function validateTransform(code: string): ValidationResult {
  const errors: string[] = []
  const comments: any[] = []
  
  try {
    // Parse the code
    const ast = Parser.parse(code, {
      ecmaVersion: 'latest',
      locations: true,
      onComment: (isBlock: boolean, text: string, start: number, end: number) => {
        comments.push({ type: isBlock ? 'Block' : 'Line', value: text, start, end })
      }
    } as any)
    
    // Find any function (not just "transform")
    let transformNode: any = null
    let functionName: string | undefined
    let transformParams: string[] = []
    let leadingComment: any = null
    
    walk.simple(ast, {
      FunctionDeclaration(node: any) {
        if (node.id && !transformNode) {
          transformNode = node
          functionName = node.id.name
          transformParams = node.params.map((p: any) => p.name)
          
          // Find preceding comment
          for (const comment of comments) {
            if (comment.end < node.start) {
              leadingComment = comment
            }
          }
        }
      },
      VariableDeclarator(node: any) {
        if (node.id && !transformNode &&
            node.init && (node.init.type === 'FunctionExpression' || node.init.type === 'ArrowFunctionExpression')) {
          transformNode = node.init
          functionName = node.id.name
          transformParams = node.init.params.map((p: any) => p.name)
          
          // Find preceding comment
          const parentStart = (node as any).start
          for (const comment of comments) {
            if (comment.end < parentStart) {
              leadingComment = comment
            }
          }
        }
      }
    })
    
    if (!transformNode) {
      errors.push('No function found. Please define a function with notes as the first parameter.')
      return { valid: false, errors }
    }
    
    if (transformParams.length < 2) {
      errors.push('Transform function must have at least two parameters (notes, libs)')
      return { valid: false, errors }
    }
    
    if (transformParams[0] !== 'notes') {
      errors.push('First parameter must be named "notes"')
      return { valid: false, errors }
    }
    
    if (transformParams[1] !== 'libs') {
      errors.push('Second parameter must be named "libs"')
      return { valid: false, errors }
    }
    
    // Check for JSDoc
    if (!leadingComment || leadingComment.type !== 'Block' || !leadingComment.value.trim().startsWith('*')) {
      errors.push('Transform function must have a JSDoc comment')
      return { valid: false, errors }
    }
    
    // Extract JSDoc info
    const { params, summary } = extractJSDocParams([leadingComment], transformParams)
    
    // Validate that all params are documented
    for (let i = 1; i < transformParams.length; i++) {
      const paramName = transformParams[i]
      const documented = leadingComment.value.includes(paramName)
      if (!documented) {
        errors.push(`Parameter "${paramName}" is not documented in JSDoc`)
      }
    }
    
    if (errors.length > 0) {
      return { valid: false, errors }
    }
    
    // Compile the function
    const factory = new Function(
      '"use strict";\n' + 
      code + 
      `\nif (typeof ${functionName} !== "function") throw new Error("${functionName} is not defined");\n` +
      `return ${functionName};`
    )
    
    const compiledFn = factory()
    
    // Smoke test with libs
    const testResult = compiledFn([], transformLibs)
    if (!Array.isArray(testResult)) {
      errors.push('Function must return an array')
      return { valid: false, errors }
    }
    
    return {
      valid: true,
      errors: [],
      functionName,
      params,
      jsdocSummary: summary,
      compiled: compiledFn as any
    }
    
  } catch (err: any) {
    errors.push(`Parse error: ${err.message}`)
    return { valid: false, errors }
  }
}

export function createTransformRegistry(config: TransformRegistryConfig) {
  const { getNotes, setNotes, getGrid } = config
  
  const slots = reactive<TransformSlot[]>(
    Array.from({ length: 8 }, (_, i) => ({
      code: '',
      isValid: false,
      name: `Slot ${i + 1}`,
      params: [],
      errors: [],
      compiled: undefined,
      jsdocSummary: undefined
    }))
  )
  
  const undoStack = ref<NoteDataInput[][]>([])
  const redoStack = ref<NoteDataInput[][]>([])
  
  function setCode(slotIndex: number, code: string) {
    if (slotIndex < 0 || slotIndex >= 8) return
    
    const slot = slots[slotIndex]!
    slot.code = code
    slot.isValid = false
    slot.errors = []
    slot.compiled = undefined
    slot.params = []
    slot.jsdocSummary = undefined
  }
  
  function validateSlot(slotIndex: number): ValidationResult {
    if (slotIndex < 0 || slotIndex >= 8) {
      return { valid: false, errors: ['Invalid slot index'] }
    }
    
    const slot = slots[slotIndex]!
    const result = validateTransform(slot.code)
    
    slot.isValid = result.valid
    slot.errors = result.errors
    
    if (result.valid && result.compiled) {
      slot.compiled = result.compiled
      slot.functionName = result.functionName
      slot.params = result.params || []
      slot.jsdocSummary = result.jsdocSummary
    }
    
    return result
  }
  
  function applyTransform(slotIndex: number, args: number[]): { status: string; count: number; error?: string } {
    if (slotIndex < 0 || slotIndex >= 8) {
      return { status: 'error', count: 0, error: 'Invalid slot index' }
    }
    
    const slot = slots[slotIndex]!
    if (!slot.isValid || !slot.compiled) {
      return { status: 'error', count: 0, error: 'Slot not validated' }
    }
    
    try {
      const prevNotes = getNotes()
      undoStack.value.push(prevNotes)
      if (undoStack.value.length > MAX_UNDO_STACK) {
        undoStack.value.shift()
      }
      redoStack.value = []
      
      const result = slot.compiled(prevNotes, transformLibs, ...args)
      const normalized = validateClampNotes(result, getGrid())
      
      setNotes(normalized)
      
      return { status: 'ok', count: normalized.length }
    } catch (err: any) {
      return { status: 'error', count: 0, error: err.message }
    }
  }
  
  function undo() {
    if (undoStack.value.length === 0) return
    
    const current = getNotes()
    const prev = undoStack.value.pop()!
    
    redoStack.value.push(current)
    setNotes(prev)
  }
  
  function redo() {
    if (redoStack.value.length === 0) return
    
    const current = getNotes()
    const next = redoStack.value.pop()!
    
    undoStack.value.push(current)
    setNotes(next)
  }
  
  function getToolDefs(): Anthropic.Tool[] {
    const tools: Anthropic.Tool[] = []
    
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!
      if (!slot.isValid) continue
      
      const properties: Record<string, any> = {}
      const required: string[] = []
      
      for (const param of slot.params) {
        if (param.name === 'notes' || param.name === 'libs') continue
        
        properties[param.name] = {
          type: 'number',
          description: param.description || `Parameter ${param.name}`
        }
        required.push(param.name)
      }
      
      tools.push({
        name: `transform_slot_${i + 1}`,
        description: slot.jsdocSummary || `User-defined transform in ${slot.name}`,
        input_schema: {
          type: 'object',
          properties,
          required
        }
      })
    }
    
    return tools
  }
  
  function getToolHandlers(): Map<string, (input: any) => Promise<any>> {
    const handlers = new Map<string, (input: any) => Promise<any>>()
    
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!
      if (!slot.isValid) continue
      
      const toolName = `transform_slot_${i + 1}`
      handlers.set(toolName, async (input: any) => {
        const args = slot.params
          .filter(p => p.name !== 'notes' && p.name !== 'libs')
          .map(p => input[p.name] || 0)
        
        const result = applyTransform(i, args)
        const grid = getGrid()
        
        return {
          status: result.status,
          count: result.count,
          error: result.error,
          grid
        }
      })
    }
    
    return handlers
  }
  
  function writeTransformFunction(slotIndex: number, code: string): ValidationResult {
    setCode(slotIndex, code)
    return validateSlot(slotIndex)
  }
  
  function summarizeTransforms(): string {
    const validSlots = slots.filter(s => s.isValid)
    
    if (validSlots.length === 0) {
      return 'No transform tools currently available.'
    }
    
    const lines: string[] = []
    
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!
      if (!slot.isValid) continue
      
      const toolName = `transform_slot_${i + 1}`
      const functionName = slot.functionName || 'unnamed'
      const summary = slot.jsdocSummary || 'User-defined transform'
      const paramList = slot.params
        .filter(p => p.name !== 'notes' && p.name !== 'libs')
        .map(p => `${p.name}${p.description ? ` (${p.description})` : ''}`)
        .join(', ')
      
      lines.push(`- ${toolName} (${functionName}): ${summary}${paramList ? ` | Params: ${paramList}` : ''}`)
    }
    
    return lines.join('\n')
  }
  
  function canUndo() {
    return undoStack.value.length > 0
  }
  
  function canRedo() {
    return redoStack.value.length > 0
  }
  
  return {
    slots,
    setCode,
    validateSlot,
    applyTransform,
    undo,
    redo,
    canUndo,
    canRedo,
    getToolDefs,
    getToolHandlers,
    writeTransformFunction,
    summarizeTransforms
  }
}

export type TransformRegistry = ReturnType<typeof createTransformRegistry>
