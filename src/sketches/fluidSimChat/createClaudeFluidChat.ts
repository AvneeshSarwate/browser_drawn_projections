import { ref, type Ref } from 'vue'
import Anthropic, { type ContentBlockParam, type ImageBlockParam } from '@anthropic-ai/sdk'
import type { ParamDef } from './appState'
import type { Screenshot, ScreenshotSummary } from './types/screenshot'

export interface ToolCall {
  name: string
  displayName?: string
  input: Record<string, unknown>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  toolCalls?: ToolCall[]
  attachments?: ScreenshotSummary[]
}

export interface ClaudeFluidChat {
  messages: Ref<ChatMessage[]>
  isWaiting: Ref<boolean>
  error: Ref<string | null>
  send: (apiKey: string, userText: string) => Promise<void>
  reset: () => void
}

const MODEL_NAME = 'claude-sonnet-4-5-20250929'
const MAX_TOOL_ITERATIONS = 6

const PARAMETER_DESCRIPTIONS: Record<string, string> = {
  densityDissipation:
    'Density Dissipation controls how quickly dye fades as it is advected through the velocity field. Higher values fade color faster. Range [0.0, 1.0], step 0.01.',
  velocityDissipation:
    'Velocity Dissipation is a numerical viscosity term that damps the velocity field over time. Higher values produce a thicker, more resistive fluid. Range [0.0, 4.0], step 0.05.',
  pressure:
    'Pressure Damping is the relaxation factor for the pressure solver. It stabilises the Poisson solve that enforces incompressibility. Range [0.0, 1.0], step 0.01.',
  pressureIterations:
    'Pressure Iterations are the number of Jacobi iterations run for the Poisson pressure solve. More iterations reduce divergence but cost performance. Range [1, 80], step 1.',
  curl:
    'Vorticity (curl) confinement injects rotational energy to preserve small eddies lost to numerical dissipation. Higher values exaggerate swirling motion. Range [0, 60], step 1.',
  splatRadius:
    'Splat Radius sets the normalised radius of the Gaussian impulse applied when interacting. Larger values smear forces and dye over a wider area. Range [0.01, 1.0], step 0.01.',
  forceStrength:
    'Splat Force strength controls how much momentum user gestures inject. Higher values impart stronger velocity impulses. Range [0, 20000], step 100.',
  dyeInjectionStrength:
    'Dye Injection strength controls how much dye is deposited per interaction. Higher values produce denser colour. Range [0.0, 2.0], step 0.01.'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function snapToStep(value: number, min: number, step: number): number {
  if (step <= 0) {
    return parseFloat(value.toFixed(6))
  }
  const stepCount = Math.round((value - min) / step)
  const snapped = min + stepCount * step
  return parseFloat(snapped.toFixed(6))
}

function buildSystemPrompt(params: ParamDef[]): string {
  const paramLines = params
    .map(param => {
      const description = PARAMETER_DESCRIPTIONS[param.name] ||
        `${param.label} has range [${param.min}, ${param.max}] with step ${param.step}.`
      return `- **${param.name}** (${param.label}): ${description}`
    })
    .join('\n')

  return `You are Claude-4.5 Sonnet running as a control assistant for a browser fluid simulation.
This tool is a port of Pavel DoGreat's WebGL Fluid Simulation with inspiration from:
- https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
- Jos Stam, "Stable Fluids" (SIGGRAPH 1999)
- Jos Stam, "Real-Time Fluid Dynamics for Games" (GDC 2003)
- Mark Harris, "Fast Fluid Dynamics Simulation on the GPU" (GPU Gems, Chapter 38)
- https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu

You are helping users explore the parameter space. Respect the physical interpretations and limits of each control.

Parameter reference:
${paramLines}

Tool usage rules:
1. Always call readParameters first when you need to reason about the current state. Never guess parameter values.
2. When setting values, stay within the provided ranges. The tool will clamp and snap to step increments; acknowledge when clamping occurs.
3. Snap values to the provided step size (the tool enforces this).
4. Ask for clarification when requests are ambiguous or incomplete.
5. When a request involves theory, feel free to use search to cite authoritative sources.

search the web and refer to the references if you think you need very specific information about fluid simulations.`
}

function formatParameterSnapshot(param: ParamDef) {
  return {
    name: param.name,
    label: param.label,
    value: param.value.value,
    min: param.min,
    max: param.max,
    step: param.step
  }
}

function buildTools(params: ParamDef[]) {
  const nameEnum = params.map(param => param.name)

  const readParametersTool: Anthropic.Tool = {
    name: 'readParameters',
    description: 'Inspect the current fluid simulation parameters. Provide an optional list of parameter names to filter the result.',
    input_schema: {
      type: 'object',
      properties: {
        names: {
          type: 'array',
          description: 'Optional list of parameter names to inspect',
          items: {
            type: 'string',
            enum: nameEnum
          }
        }
      }
    }
  }

  const setParametersTool: Anthropic.Tool = {
    name: 'setParameters',
    description: 'Update any subset of fluid parameters. Values will be clamped to the allowed range and snapped to the configured step.',
    input_schema: {
      type: 'object',
      properties: params.reduce<Record<string, unknown>>((acc, param) => {
        acc[param.name] = {
          type: 'number',
          description: `${param.label} range [${param.min}, ${param.max}], step ${param.step}`,
          minimum: param.min,
          maximum: param.max
        }
        return acc
      }, {}),
      additionalProperties: false
    }
  }

  const handlers = new Map<string, (input: any) => Promise<any>>()

  handlers.set('readParameters', async (input: any) => {
    const names: string[] | undefined = Array.isArray(input?.names) ? input.names : undefined
    if (!names || names.length === 0) {
      return params.map(param => formatParameterSnapshot(param))
    }

    const found: ReturnType<typeof formatParameterSnapshot>[] = []
    const missing: string[] = []

    for (const name of names) {
      const param = params.find(p => p.name === name)
      if (param) {
        found.push(formatParameterSnapshot(param))
      } else {
        missing.push(name)
      }
    }

    return {
      parameters: found,
      missing: missing.length > 0 ? missing : undefined
    }
  })

  handlers.set('setParameters', async (input: Record<string, unknown>) => {
    if (!input || typeof input !== 'object') {
      return {
        changes: [],
        skipped: [],
        error: 'No parameters provided'
      }
    }

    const changes: Array<Record<string, unknown>> = []
    const skipped: Array<{ name: string; reason: string }> = []

    for (const [name, rawValue] of Object.entries(input)) {
      const param = params.find(p => p.name === name)
      if (!param) {
        skipped.push({ name, reason: 'Unknown parameter' })
        continue
      }

      if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) {
        skipped.push({ name, reason: 'Value must be a number' })
        continue
      }

      const clamped = clamp(rawValue, param.min, param.max)
      const snapped = snapToStep(clamped, param.min, param.step)
      const finalValue = clamp(snapped, param.min, param.max)

      const previous = param.value.value
      param.value.value = finalValue

      changes.push({
        name: param.name,
        label: param.label,
        requested: rawValue,
        applied: finalValue,
        previous,
        min: param.min,
        max: param.max,
        step: param.step,
        clamped: finalValue !== rawValue,
        snapped: finalValue !== clamped
      })
    }

    return {
      changes,
      skipped: skipped.length > 0 ? skipped : undefined
    }
  })

  return {
    tools: [readParametersTool, setParametersTool],
    handlers
  }
}

interface ClaudeFluidChatOptions {
  getFluidParams: () => ParamDef[] | undefined
  getAttachments?: () => Screenshot[]
}

function buildUserText(prompt: string, attachments: Screenshot[]): string {
  const trimmed = prompt.trim()
  if (attachments.length === 0) {
    return trimmed
  }

  const header = trimmed ? `${trimmed}\n\n` : ''
  const lines = attachments.map((shot, index) => {
    const captured = new Date(shot.createdAt).toLocaleString()
    return `${index + 1}. ${shot.label} - mode: ${shot.debugMode} - captured ${captured} - ${shot.width}x${shot.height}`
  })

  return `${header}Attached screenshots:\n${lines.join('\n')}`
}

function buildUserContentBlocks(prompt: string, attachments: Screenshot[]): ContentBlockParam[] {
  const blocks: ContentBlockParam[] = []
  const userText = buildUserText(prompt, attachments)

  if (userText) {
    blocks.push({
      type: 'text',
      text: userText
    })
  }

  for (const shot of attachments) {
    const imageBlock: ImageBlockParam = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: shot.mediaType,
        data: shot.base64
      }
    }
    blocks.push(imageBlock)
  }

  return blocks
}

export function createClaudeFluidChat(options: ClaudeFluidChatOptions): ClaudeFluidChat {
  const messages = ref<ChatMessage[]>([])
  const isWaiting = ref(false)
  const error = ref<string | null>(null)

  async function send(apiKey: string, userText: string): Promise<void> {
    const prompt = userText.trim()
    const key = apiKey.trim()
    const attachments = options.getAttachments?.() ?? []

    if (!prompt && attachments.length === 0) {
      return
    }

    if (!key) {
      error.value = 'Please provide an API key.'
      return
    }

    if (isWaiting.value) {
      return
    }

    const params = options.getFluidParams() ?? []
    const attachmentSummaries: ScreenshotSummary[] = attachments.map((shot) => ({
      id: shot.id,
      label: shot.label,
      debugMode: shot.debugMode,
      mediaType: shot.mediaType,
      blobUrl: shot.blobUrl,
      sizeBytes: shot.sizeBytes,
      createdAt: shot.createdAt,
      width: shot.width,
      height: shot.height
    }))

    messages.value.push({
      role: 'user',
      text: prompt,
      timestamp: Date.now(),
      attachments: attachmentSummaries.length > 0 ? attachmentSummaries : undefined
    })

    isWaiting.value = true
    error.value = null

    try {
      const client = new Anthropic({
        apiKey: key,
        dangerouslyAllowBrowser: true
      })

      const { tools, handlers } = buildTools(params)
      // Add Anthropic server web search tool (no domain filters)
      const toolsWithSearch: Anthropic.Tool[] = [
        ...tools,
        { name: 'web_search', type: 'web_search_20250305' } as any,
      ]

      const conversationMessages: Anthropic.MessageParam[] = [
        { role: 'user', content: buildUserContentBlocks(prompt, attachments) }
      ]

      let response = await client.messages.create({
        model: MODEL_NAME,
        system: buildSystemPrompt(params),
        tools: toolsWithSearch,
        max_tokens: 1000,
        messages: conversationMessages
      })

      const allToolCalls: ToolCall[] = []

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        )

        if (toolUses.length === 0) {
          break
        }

        for (const toolUse of toolUses) {
          allToolCalls.push({
            name: toolUse.name,
            displayName: toolUse.name,
            input: toolUse.input as Record<string, unknown>
          })
        }

        conversationMessages.push({
          role: 'assistant',
          content: response.content
        })

        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const toolUse of toolUses) {
          const handler = handlers.get(toolUse.name)
          if (!handler) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: `No handler registered for ${toolUse.name}` })
            })
            continue
          }

          try {
            const result = await handler(toolUse.input)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result)
            })
          } catch (toolError: any) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                error: toolError?.message || 'Tool execution failed'
              })
            })
          }
        }

        conversationMessages.push({
          role: 'user',
          content: toolResults
        })

        response = await client.messages.create({
          model: MODEL_NAME,
          system: buildSystemPrompt(params),
          tools: toolsWithSearch,
          max_tokens: 1000,
          messages: conversationMessages
        })
      }

      const finalText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim()

      messages.value.push({
        role: 'assistant',
        text: finalText || 'No response',
        timestamp: Date.now(),
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined
      })
    } catch (err: any) {
      error.value = err?.message || 'Failed to communicate with Claude'
      console.error('Claude API error:', err)
    } finally {
      isWaiting.value = false
    }
  }

  function reset(): void {
    messages.value = []
    isWaiting.value = false
    error.value = null
  }

  return {
    messages,
    isWaiting,
    error,
    send,
    reset
  }
}
