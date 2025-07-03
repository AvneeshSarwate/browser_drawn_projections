// transformHelpers.ts - Pure helper utilities for Sonar sketch clip transformations

import { AbletonClip, clipMap } from '@/io/abletonClips'
import { TRANSFORM_REGISTRY } from '../clipTransforms'
import { evaluate } from '../sliderExprParser'
import type { SonarAppState, VoiceState } from '../appState'

/** Split a full transform chain line into the source clip name and an array of command strings */
export const splitTransformChainToCommandStrings = (line: string) => {
  const tokens = line.split(/\s*:\s*/).map((t) => t.trim()).filter(Boolean)
  return { srcName: tokens[0], commandStrings: tokens.slice(1) }
}

/** Parse a single command string (symbol + params) */
export const parseCommandString = (cmdString: string) => {
  const parts = cmdString.split(/\s+/).filter(Boolean)
  const symbol = parts[0]
  const params = parts.slice(1)
  return { symbol, params }
}

/** Detect if a parameter string references a slider expression (e.g. "s1*2") */
export const paramUsesSliderExpression = (paramString: string) => {
  return typeof paramString === 'string' && /s\d+/.test(paramString)
}

/** Evaluate an expression that may reference sliders. */
export function evaluateSliderExpression(
  expression: string,
  sliderScaleFunc: (val: number, clip: AbletonClip) => number,
  origClip: AbletonClip,
  sliders: number[],
) {
  const sliderVars: Record<string, number> = {}
  const sliderMatches = expression.match(/s\d+/g) || []
  const usedSliders = new Set<string>(sliderMatches)

  for (const sliderRef of sliderMatches) {
    const idx = parseInt(sliderRef.slice(1)) - 1
    if (idx >= 0 && idx < sliders.length) {
      sliderVars[sliderRef] = sliderScaleFunc(sliders[idx], origClip)
    }
  }

  try {
    const result = evaluate(expression, sliderVars)
    return { success: true, value: result, usedSliders }
  } catch (err) {
    console.warn('Failed to evaluate slider expression', expression, err)
    return { success: false, value: 0, usedSliders }
  }
}

/** Build a clip from a line, returning the transformed clip and the updated display line */
export function buildClipFromLine(
  clipLine: string,
  sliders: number[],
  skipClipTransform = false,
): { clip: AbletonClip | undefined; updatedClipLine: string } {
  const { srcName, commandStrings } = splitTransformChainToCommandStrings(clipLine)
  if (!commandStrings.length) return { clip: undefined, updatedClipLine: clipLine }

  const srcClip = clipMap.get(srcName)
  if (!srcClip) return { clip: undefined, updatedClipLine: clipLine }

  let curClip = srcClip.clone()
  const origClip = srcClip.clone()
  const updatedTokens: string[] = [srcName]

  commandStrings.forEach((cmdString) => {
    const { symbol, params } = parseCommandString(cmdString)
    const tf = TRANSFORM_REGISTRY[symbol as keyof typeof TRANSFORM_REGISTRY]
    const parsedParams = tf.argParser(params)
    const updatedParams = [...params]

    parsedParams.forEach((param, idx) => {
      if (paramUsesSliderExpression(param)) {
        const res = evaluateSliderExpression(param, tf.sliderScale[idx], origClip, sliders)
        if (res.success) {
          parsedParams[idx] = res.value
          updatedParams[idx] = `${res.value.toFixed(2)}-${Array.from(res.usedSliders).join('')}`
        }
      }
    })

    if (tf && !skipClipTransform) curClip = tf.transform(curClip, ...(parsedParams as any))
    updatedTokens.push(`${symbol} ${updatedParams.join(' ')}`)
  })

  return { clip: curClip, updatedClipLine: updatedTokens.join(' : ') }
}

/** Split multiline slice text into groups of main line + optional ramp lines */
export const splitTextToGroups = (text: string): { clipLine: string; rampLines: string[] }[] => {
  const allLines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const groups: { clipLine: string; rampLines: string[] }[] = []
  let currentClipLine = ''
  let currentRampLines: string[] = []

  for (const line of allLines) {
    if (line.startsWith('=> ')) {
      currentRampLines.push(line)
    } else {
      if (currentClipLine) {
        groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] })
      }
      currentClipLine = line
      currentRampLines = []
    }
  }

  if (currentClipLine) {
    groups.push({ clipLine: currentClipLine, rampLines: [...currentRampLines] })
  }

  return groups
}

// ============================================================================
// JavaScript Code Transformation Functions
// ============================================================================

/** Type definition for UUID mapping data */
export type UUIDMapping = {
  uuid: string
  startLineNumber: number
  sourceLineText: string
  endLineNumber?: number  // For multiline spans
}

/** Generate a UUID using crypto.randomUUID() */
export const generateUUID = (): string => {
  return crypto.randomUUID()
}

/** Find all line() calls in JavaScript code and return match information */
export const findLineCallMatches = (jsCode: string): { 
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

const uuidCache = new Map<string, { visualizeCode: string, inputCode: string, mappings: UUIDMapping[] }>()
const makeCacheKey = (jsCode: string, voiceIndex: number) => `voice: ${voiceIndex} ${jsCode}`

/** 
 * Step 1: Preprocessor - transforms line() calls to include UUIDs 
 * Returns the processed code and UUID mappings without storing them globally
 * 
 * note - needs to be run with code from the INPUT editor for cache stuff to work
 */
export const preprocessJavaScript = (inputCode: string, voiceIndex: number): { visualizeCode: string, mappings: UUIDMapping[] } => {

  /**
   * this is necessary for allowing re-evaluation of what lines run when toggles/flags change - 
   * you want to re-run the visualization code, but maintain the same UUID mappings for lines()
   */  
  const cacheKey = makeCacheKey(inputCode, voiceIndex)
  if(uuidCache.has(cacheKey)) return uuidCache.get(cacheKey)

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
      startLineNumber,
      sourceLineText: fullCallText,
      endLineNumber
    })
    
    // Extract just the template literal part
    const templateLiteral = processedCode.substring(match.templateStart, match.templateEnd + 1)
    
    // Replace with UUID version
    const replacement = `line(${templateLiteral}, "${uuid}")`
    processedCode = processedCode.substring(0, match.start) + replacement + processedCode.substring(match.end)
  }

  uuidCache.set(cacheKey, { visualizeCode: processedCode, inputCode, mappings })
  
  return { visualizeCode: processedCode, mappings }
}

/** Step 2: Runtime transformer - converts line() calls to runLine() calls */
export const transformToRuntime = (visualizeCode: string, voiceIndex: number): string => {
  let runtimeCode = visualizeCode
  
  // Find and replace line() calls that may span multiple lines
  const lineCallRegex = /line\s*\(\s*(`(?:[^`\\]|\\.)*`)\s*,\s*"([^"]+)"\s*\)/gs
  
  runtimeCode = runtimeCode.replace(
    lineCallRegex,
    `await runLine($1, ctx, "$2", ${voiceIndex})`
  )
  
  return runtimeCode
}

/** Step 3: Create executable function from JavaScript code */
export const createExecutableFunction = (visualizeCode: string, mappings: UUIDMapping[], voiceIndex: number): { 
  executableFunc: Function | null, 
  visualizeCode: string, 
  mappings: UUIDMapping[] 
} => {
  try {
    const runtimeCode = transformToRuntime(visualizeCode, voiceIndex)
    
    // Create async function with proper context  
    const executableFunc = new Function('ctx', 'runLine', 'flags', `
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

/** Resolve slider expressions in JavaScript code with line() calls */
export const resolveSliderExpressionsInJavaScript = (jsCode: string, sliders: number[]): string => {
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
        const { updatedClipLine } = buildClipFromLine(mainClipLine.content, sliders, true)
        
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


// Produce the fully-resolved slice text (slider expressions evaluated)
export const computeDisplayTextForVoice = (voice: VoiceState, appState: SonarAppState): string => {
  const groups = splitTextToGroups(voice.saveable.sliceText)
  const lines: string[] = []

  groups.forEach(group => {
    const { updatedClipLine } = buildClipFromLine(group.clipLine, appState.sliders, true)
    if (group.rampLines.length) {
      lines.push(updatedClipLine, ...group.rampLines)
    } else {
      lines.push(updatedClipLine)
    }
  })

  return lines.join('\n')
}

export const parseRampLine = (rampLine: string) => {
  const parts = rampLine.split(/\s+/).filter(Boolean) //[=>, param, startVal, endVal]
  const paramName = parts[1]
  const startVal = parseFloat(parts[2])
  const endVal = parseFloat(parts[3])
  return { paramName, startVal, endVal }
}

// Function to analyze JavaScript code by executing visualize-time version and tracking line() calls
export const analyzeExecutableLines = (jsCode: string, voiceIndex: number, appState: SonarAppState, uuidMappings: Map<string, UUIDMapping[]>): { executedUUIDs: string[], mappings: UUIDMapping[], visualizeCode: string } => {
  const executedUUIDs: string[] = []
  
  try {
    // Get the visualize-time code with UUIDs
    const { visualizeCode, mappings } = preprocessJavaScript(jsCode, voiceIndex)
    
    // Store mappings for this voice
    uuidMappings.set(voiceIndex.toString(), mappings)
    
    // Create line function that tracks which UUIDs are called (analysis mode)
    const line = (text: string, uuid: string) => {
      executedUUIDs.push(uuid)
      // No execution - just tracking
    }
    
    // Create and execute the visualize-time function
    const visualizeFunc = new Function('line', 'flags', visualizeCode)
    
    // Execute with the line function to see which UUIDs would be called
    visualizeFunc(line, appState.toggles)
    console.log("executedUUIDs", voiceIndex, executedUUIDs)
    return { executedUUIDs, mappings, visualizeCode } // Return UUIDs of lines that will execute
    
  } catch (error) {
    console.error('Error analyzing executable lines:', error)
    return { executedUUIDs: [], mappings: [], visualizeCode: '' }
  }
}