import { ref } from 'vue'
import Anthropic from '@anthropic-ai/sdk'
import type { NoteDataInput } from '../components/pianoRoll/pianoRollState'
import type { TransformRegistry } from './useTransformRegistry'

export interface ToolCall {
  name: string
  displayName?: string
  input: Record<string, any>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  toolCalls?: ToolCall[]
}

interface GridInfo {
  maxLength: number
  timeSignature: number
  subdivision: number
}

interface ClaudeChatConfig {
  getNotes: () => NoteDataInput[]
  setNotes: (notes: NoteDataInput[]) => void
  getGrid: () => GridInfo
  registry?: TransformRegistry
}

const MAX_NOTES = 512
const MAX_TOOL_ITERATIONS = 10

const MODEL_NAME = 'claude-sonnet-4-5'

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

export function createClaudeChat(config: ClaudeChatConfig) {
  const { getNotes, setNotes, getGrid, registry } = config
  
  const messages = ref<ChatMessage[]>([])
  const isWaiting = ref(false)
  const error = ref<string | null>(null)
  
  const midiNotesTool: Anthropic.Tool = {
    name: "midi_notes",
    description: "Read or write the piano roll MIDI notes. Use action='read' to fetch all notes. Use action='write' with a notes array to replace the current notes.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read", "write"],
          description: "Whether to read current notes or write new notes"
        },
        notes: {
          type: "array",
          description: "Array of MIDI notes to write (only for 'write' action)",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Optional unique identifier" },
              pitch: { 
                type: "number", 
                minimum: 0, 
                maximum: 127,
                description: "MIDI pitch (0-127, 60=middle C)"
              },
              position: { 
                type: "number", 
                minimum: 0,
                description: "Note start position in quarter notes"
              },
              duration: { 
                type: "number", 
                minimum: 0,
                description: "Note duration in quarter notes"
              },
              velocity: { 
                type: "number", 
                minimum: 0, 
                maximum: 127,
                description: "Note velocity (0-127, default 100)"
              }
            },
            required: ["pitch", "position", "duration"]
          }
        }
      },
      required: ["action"]
    }
  }
  
  const writeTransformTool: Anthropic.Tool = {
    name: "write_transform_function",
    description: "Create or overwrite a transform function in a given slot (0-7). Provide complete JavaScript code with a function named 'transform' that takes notes as first parameter, followed by numeric parameters. Include JSDoc comments with one line per parameter.",
    input_schema: {
      type: "object",
      properties: {
        slotIndex: {
          type: "number",
          minimum: 0,
          maximum: 7,
          description: "Slot index (0-7) where to write the transform"
        },
        code: {
          type: "string",
          description: "Complete JavaScript code defining the transform function"
        }
      },
      required: ["slotIndex", "code"]
    }
  }
  
  function buildSystemPrompt(): string {
    const grid = getGrid()
    
    let prompt = `You are a music composition assistant for a MIDI piano roll editor.

IMPORTANT RULES:
- Always use the midi_notes tool to read or write notes - never hallucinate note data
- Grid constraints: maxLength=${grid.maxLength} quarter notes, timeSignature=${grid.timeSignature}/4, subdivision=1/${grid.subdivision}
- Time units: 1.0 represents one quarter note across all positions and durations
- When writing notes:
  - Pitch must be 0-127 (60=middle C, 62=D, 64=E, 65=F, 67=G, 69=A, 71=B, 72=high C)
  - Position must be >= 0 and position+duration should stay within maxLength
  - Duration must be > 0 (minimum 1/${grid.subdivision} quarter notes recommended)
  - Velocity defaults to 100 if not specified (range 0-127)
- Keep responses concise and acknowledge changes after writing
- Consider musical context when suggesting edits (key, rhythm, harmony)
- When creating chords, use simultaneous notes at the same position`

    if (registry) {
      prompt += `

TRANSFORM FUNCTIONS:
Before modifying notes, determine the best approach:
- For simple operations (add/remove individual notes, simple pitch/position changes), use midi_notes tool directly
- For pattern-based operations (transpose all notes, quantize, humanize), check if an existing transform tool matches
- For complex multi-step operations, consider combining multiple transform tools in sequence
- Only create new transforms if no existing tool or combination fits the need

Available transform tools:
${registry.summarizeTransforms()}

When using a transform tool:
1. First, determine if you have all required parameter values
2. If any required parameter is missing and cannot be reasonably inferred from context, ask the user for it
3. Do NOT invoke the tool with placeholder or guessed values for missing required parameters
4. Optional parameters can be omitted if not provided

CREATING NEW TRANSFORMS:
Use write_transform_function(code, slotIndex) only when:
- The user explicitly asks you to create a transform function
- No existing transform or combination can accomplish the task
- The operation would be reusable for future requests

Transform code requirements:
- Must define a function with notes as first parameter, libs as second parameter, then numeric parameters
- Function can have any name (e.g., transpose, quantize, humanize)
- First parameter must be 'notes' (the input array)
- Second parameter must be 'libs' (utility library object, automatically provided)
- Additional parameters must be numbers that configure the transformation
- Must include JSDoc with @param tags for each parameter (including libs)
- Should return a new array, not modify input array

LIBS PARAMETER - Available utilities:
The 'libs' object provides music theory and MIDI manipulation utilities:

1. libs.Scale - Class for working with musical scales
   - new libs.Scale([intervals], rootPitch) - Create scale (e.g., [0,2,4,5,7,9,11,12] for major scale, root like 60 for C)
   - scale.getByIndex(index) - Get MIDI pitch at scale degree (0=root, 1=second, etc.)
   - scale.getIndFromPitch(pitch) - Get scale degree from MIDI pitch (returns fractional if pitch not in scale)
   - scale.cycle(n) - Rotate scale modes (n=1 for next mode, e.g., Ionian->Dorian)
   - scale.invert(n) - Invert scale to different root

2. libs.bestFitScale(clip) - Analyzes an AbletonClip and returns the best-fitting diatonic scale
   - Tries all 12 chromatic roots × 7 modes
   - Uses fractional indices to detect out-of-scale notes
   - Scores based on fit + bonus points for root/4th/5th emphasis
   - Returns a Scale object

3. libs.fitToScale(clip, scale?) - Quantizes all notes in clip to nearest scale degree
   - If no scale provided, uses bestFitScale() automatically
   - Rounds fractional scale indices to nearest in-scale pitch
   - Returns { clip: AbletonClip, scale: Scale } - both the corrected clip and the scale used

4. libs.scaleFromClip(clip, rootPicker?) - Creates a Scale from actual unique pitches in clip
   - Uses first note as root by default
   - Optional rootPicker function: (clip) => midiPitch to choose different root
   - Returns Scale containing only the pitches that appear in the clip

5. libs.AbletonClip - Class for advanced MIDI manipulation
   - new libs.AbletonClip(name, duration, notes) - Create clip from notes array
   - clip.transpose(semitones) - Transpose by chromatic semitones
   - clip.scaleTranspose(degrees, scale) - Transpose by scale degrees
   - clip.scale(factor) - Time stretch (factor=2 doubles duration)
   - clip.shift(delta) - Time shift (delta in quarter notes)

Example transform structure:
/**
 * Add harmony notes at specified scale degree interval
 * @param {Note[]} notes - Input notes array
 * @param {object} libs - Utility library (automatically provided)
 * @param {number} degrees - Scale degrees to harmonize (e.g., 3 for thirds, -2 for seconds below)
 */
function harmonize(notes, libs, degrees) {
  // Convert to AbletonClip and find best-fitting scale
  const clip = new libs.AbletonClip('temp', 4, notes);
  const { clip: quantized, scale } = libs.fitToScale(clip);
  
  // Create harmony notes
  const harmony = quantized.notes.map(n => {
    const scaleIndex = scale.getIndFromPitch(n.pitch);
    const harmonyPitch = scale.getByIndex(Math.round(scaleIndex) + degrees);
    return { ...n, pitch: harmonyPitch };
  });
  
  // Return original notes plus harmony
  return [...notes, ...harmony];
}`
    }
    
    return prompt
  }
  
  async function executeMidiNotesTool(input: any) {
    const grid = getGrid()
    
    if (input.action === 'read') {
      return {
        notes: getNotes(),
        grid
      }
    } else if (input.action === 'write') {
      const normalized = validateClampNotes(input.notes || [], grid)
      setNotes(normalized)
      return {
        status: 'ok',
        count: normalized.length,
        grid
      }
    }
    
    return { error: 'Invalid action' }
  }
  
  async function send(userText: string, apiKey: string): Promise<void> {
    if (!apiKey.trim()) {
      error.value = 'Please provide an API key'
      return
    }
    
    if (!userText.trim()) {
      return
    }
    
    messages.value.push({
      role: 'user',
      text: userText,
      timestamp: Date.now()
    })
    
    isWaiting.value = true
    error.value = null
    
    try {
      const client = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true
      })
      
      // Build tools dynamically
      const tools: Anthropic.Tool[] = [midiNotesTool]
      
      const handlers = new Map<string, (input: any) => Promise<any>>()
      handlers.set('midi_notes', executeMidiNotesTool)
      
      if (registry) {
        tools.push(writeTransformTool)
        handlers.set('write_transform_function', async (input: any) => {
          const result = registry.writeTransformFunction(input.slotIndex, input.code)
          return {
            status: result.valid ? 'validated' : 'invalid',
            errors: result.errors,
            toolName: result.valid ? `transform_slot_${input.slotIndex + 1}` : undefined,
            params: result.params
          }
        })
        
        // Add transform tools
        const transformTools = registry.getToolDefs()
        tools.push(...transformTools)
        
        // Add transform handlers
        const transformHandlers = registry.getToolHandlers()
        transformHandlers.forEach((handler, name) => {
          handlers.set(name, handler)
        })
      }
      
      const conversationMessages: Anthropic.MessageParam[] = [
        { role: 'user', content: userText }
      ]
      
      let response = await client.messages.create({
        model: MODEL_NAME,
        system: buildSystemPrompt(),
        tools,
        max_tokens: 1000,
        messages: conversationMessages
      })
      
      const allToolCalls: ToolCall[] = []
      
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        )
        
        if (toolUses.length === 0) break
        
        // Track tool calls with display names
        for (const toolUse of toolUses) {
          let displayName = toolUse.name
          
          // Get function name for transform tools
          if (toolUse.name.startsWith('transform_slot_') && registry) {
            const slotIndex = parseInt(toolUse.name.replace('transform_slot_', '')) - 1
            const slot = registry.slots[slotIndex]
            if (slot && slot.functionName) {
              displayName = slot.functionName
            }
          }
          
          allToolCalls.push({
            name: toolUse.name,
            displayName,
            input: toolUse.input as Record<string, any>
          })
        }
        
        conversationMessages.push({
          role: 'assistant',
          content: response.content
        })
        
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        
        for (const toolUse of toolUses) {
          const handler = handlers.get(toolUse.name)
          if (handler) {
            const result = await handler(toolUse.input)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            })
          }
        }
        
        conversationMessages.push({
          role: 'user',
          content: toolResults
        })
        
        response = await client.messages.create({
          model: MODEL_NAME,
          system: buildSystemPrompt(),
          tools,
          max_tokens: 1000,
          messages: conversationMessages
        })
      }
      
      const finalText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      
      messages.value.push({
        role: 'assistant',
        text: finalText || 'No response',
        timestamp: Date.now(),
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
      })
      
    } catch (err: any) {
      error.value = err.message || 'Failed to communicate with Claude'
      console.error('Claude API error:', err)
    } finally {
      isWaiting.value = false
    }
  }
  
  function reset() {
    messages.value = []
    error.value = null
    isWaiting.value = false
  }
  
  return {
    messages,
    isWaiting,
    error,
    send,
    reset
  }
}
