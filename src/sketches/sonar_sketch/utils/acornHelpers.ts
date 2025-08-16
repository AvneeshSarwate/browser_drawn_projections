// acornHelpers.ts - AST-based helpers for JavaScript code transformation
import * as acorn from 'acorn'
import * as walk from 'acorn-walk'

/** Patch represents a text replacement with optional UUID */
interface Patch { 
  start: number
  end: number 
  text: string
  id?: string 
}

/** Line section within a template literal */
interface LineSection { 
  content: string
  startIndex: number
  endIndex: number 
}

/** Group of clip line and associated ramp lines */
interface Group { 
  clipLine: string
  rampLines: string[] 
}

/** Result of finding line() call matches */
export interface LineCallMatch {
  start: number
  end: number
  templateStart: number
  templateEnd: number
  templateStartLine: number
  content: string
  lines: LineSection[]
  groups: Group[]
}

/**
 * Transform line() calls to include UUIDs using AST parsing
 * Returns the transformed code and count of patches applied
 */
export function transformLineCalls(source: string): { code: string; patches: Patch[] } {
  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  })

  const patches: Patch[] = []

  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee?.type !== 'Identifier' || node.callee.name !== 'line') return
      if (!node.arguments?.length) return

      const arg0 = node.arguments[0]
      const isTemplate = arg0.type === 'TemplateLiteral'
      const isStringLiteral = arg0.type === 'Literal' && typeof arg0.value === 'string'
      if (!isTemplate && !isStringLiteral) return // skip non-string calls

      // Respect user's rule: no expressions allowed in template literals
      if (isTemplate && arg0.expressions && arg0.expressions.length > 0) return

      // Preserve exact text (including quotes/backticks & newlines) for the first arg
      const arg0Text = source.slice(arg0.start, arg0.end)

      // Generate a UUID and embed it as a string literal
      const id = crypto.randomUUID()

      const replacement = `line(${arg0Text}, "${id}")`
      patches.push({ start: node.start, end: node.end, text: replacement, id })
    },
  })

  // Apply patches right-to-left so indexes don't shift
  patches.sort((a, b) => b.start - a.start)

  let out = source
  for (const p of patches) {
    out = out.slice(0, p.start) + p.text + out.slice(p.end)
  }
  
  return { code: out, patches }
}

/**
 * Find all line() calls in JavaScript code and return match information
 * AST-based implementation that replaces the regex version
 */
export function findLineCallMatches(jsCode: string): LineCallMatch[] {
  const ast = acorn.parse(jsCode, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  })

  const matches: LineCallMatch[] = []

  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee?.type !== 'Identifier' || node.callee.name !== 'line') return
      if (!node.arguments?.length) return

      const arg0 = node.arguments[0]
      const isTemplate = arg0.type === 'TemplateLiteral'
      const isStringLiteral = arg0.type === 'Literal' && typeof arg0.value === 'string'
      if (!isTemplate && !isStringLiteral) return // skip non-string calls

      // For template literals, require no expressions to mirror original semantics
      if (isTemplate && arg0.expressions && arg0.expressions.length > 0) return

      const start = node.start
      const end = node.end
      const templateStart = arg0.start // index of opening backtick or quote
      const templateEnd = arg0.end - 1 // index of closing backtick or quote

      const content = isTemplate
        ? jsCode.slice(templateStart + 1, templateEnd)
        : String(arg0.value)

      const beforeCallText = jsCode.slice(0, start)
      // Count newlines correctly
      const templateStartLine = (beforeCallText.match(/\n/g) || []).length // 0-based, like original

      // Parse individual lines within the template/string
      const lines: LineSection[] = []
      const contentLines = content.split('\n')
      let currentIndex = 0

      contentLines.forEach((lineContent, index) => {
        const trimmedContent = lineContent.trim()
        if (trimmedContent) {
          const lineStartIndex = templateStart + 1 + currentIndex
          const lineEndIndex = lineStartIndex + lineContent.length
          lines.push({ content: trimmedContent, startIndex: lineStartIndex, endIndex: lineEndIndex })
        }
        currentIndex += lineContent.length + (index < contentLines.length - 1 ? 1 : 0)
      })

      // Grouping logic (clip line + optional ramp lines)
      const allLines = content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)

      const groups: Group[] = []
      let currentClipLine = ''
      let currentRampLines: string[] = []

      for (const l of allLines) {
        if (l.startsWith('=> ')) {
          currentRampLines.push(l)
        } else {
          if (currentClipLine) {
            groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] })
          }
          currentClipLine = l
          currentRampLines = []
        }
      }
      if (currentClipLine) {
        groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] })
      }

      matches.push({ start, end, templateStart, templateEnd, templateStartLine, content, lines, groups })
    },
  })

  return matches
}

/**
 * Transform visualize code to runtime code using AST parsing
 * Takes visualizeCode (output of transformLineCalls) and a voiceIndex,
 * and rewrites:
 * - line(template, "uuid") -> hotswapCued = await runLine(template, ctx, "uuid", voiceIndex); if(hotswapCued) return true
 * - resolveBarrier(string) -> resolveBarrier(string, ctx)  
 * - awaitBarrier(string) -> awaitBarrier(string, ctx)
 */
export function transformToRuntime(visualizeCode: string, voiceIndex: number): string {
  const ast = acorn.parse(visualizeCode, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
  })

  const patches: Patch[] = []

  // Transform function calls
  walk.simple(ast, {
    CallExpression(node) {
      if (node.callee?.type !== 'Identifier') return
      const functionName = node.callee.name
      const args = node.arguments || []

      // Transform line() calls to runLine() calls with hotswap logic
      if (functionName === 'line') {
        if (args.length < 2) return // expect template + uuid from transformLineCalls

        const arg0 = args[0]
        const arg1 = args[1]
        const isTemplate = arg0.type === 'TemplateLiteral'
        const isStringLit = arg0.type === 'Literal' && typeof arg0.value === 'string'
        if (!isTemplate && !isStringLit) return
        if (isTemplate && arg0.expressions && arg0.expressions.length > 0) return

        const arg0Text = visualizeCode.slice(arg0.start, arg0.end)
        const arg1Text = visualizeCode.slice(arg1.start, arg1.end)

        const replacement = `hotswapCued = await runLine(${arg0Text}, ctx, ${arg1Text}, ${voiceIndex})
     if(hotswapCued) return true`
        patches.push({ start: node.start, end: node.end, text: replacement })
      }
      
      // Transform resolveBarrier(string) -> resolveBarrier(string, ctx)
      else if (functionName === 'resolveBarrier') {
        if (args.length !== 1) return // expect exactly one string argument
        
        const arg0 = args[0]
        const arg0Text = visualizeCode.slice(arg0.start, arg0.end)
        
        const replacement = `resolveBarrier(${arg0Text}, ctx)`
        patches.push({ start: node.start, end: node.end, text: replacement })
      }
      
      // Transform awaitBarrier(string) -> awaitBarrier(string, ctx)
      else if (functionName === 'awaitBarrier') {
        if (args.length !== 1) return // expect exactly one string argument
        
        const arg0 = args[0]
        const arg0Text = visualizeCode.slice(arg0.start, arg0.end)
        
        const replacement = `await awaitBarrier(${arg0Text}, ctx)`
        patches.push({ start: node.start, end: node.end, text: replacement })
      }
    },
  })

  patches.sort((a, b) => b.start - a.start)
  let out = visualizeCode
  for (const p of patches) {
    out = out.slice(0, p.start) + p.text + out.slice(p.end)
  }
  return out
}
