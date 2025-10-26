import { AbletonClip } from '@/io/abletonClips'
import { ease } from '@/sketches/sonar_sketch/clipTransforms'
import Anthropic from '@anthropic-ai/sdk'

export type TransformOp = 'easeIn' | 'easeOut' | 'octaveShift'

export type PipelineStep =
  | { op: 'easeIn'; amount: number }
  | { op: 'easeOut'; amount: number }
  | { op: 'octaveShift'; semitones: -12 | 12 }

export type LineAnalysis = {
  text: string
  valence: number
  arousal: number
  motion: 'up' | 'down' | 'neutral'
  tension: 'rising' | 'falling' | 'steady'
  confidence: number
  rationale?: string
}

export type LinePipeline = {
  lineIndex: 0 | 1 | 2
  analysis: LineAnalysis
  pipeline: { steps: PipelineStep[]; notes?: string }
}

const HAIKU_TRANSFORM_SYSTEM_PROMPT = `You are a music co-creator that transforms three melody clips derived from a haiku. You will:

1) Analyze each haiku line (0..2) for emotions:
   - valence: [-1..1] (negative to positive)
   - arousal: [0..1] (calm to energetic)
   - motion: up|down|neutral (imagery: rising/falling/neutral)
   - tension: rising|falling|steady (does the line build or release energy?)
   - confidence: [0..1]

2) For each line, propose a short pipeline of 1-3 steps using only:
   - easeIn(amount) → a function that warps the melody so that it speeds up over time (but keeps the same duration)
   - easeOut(amount) → a function that warps the melody so that it slows down over time (but keeps the same duration)
   - octaveShift(semitones) → a function that transposes the melody by ±12 semitones

3) Composition rules:
   - If tension is rising or the line feels like "waking/building/approaching," add easeIn. Amount ≈ arousal (0.3 for gentle, 0.6 medium, 0.9 intense).
   - If tension is falling or the line feels like "sigh/release/settling," add easeOut. Amount ≈ arousal.
   - If imagery/valence imply lift/brightness (sky, dawn, hope) and valence > 0, consider octaveShift +12.
   - If imagery/valence imply heaviness/descend (night, sink, sorrow) and valence < 0, consider octaveShift -12.
   - Prefer at most one easing op plus optionally one octave shift. Keep pipelines minimal and ordered as they should be applied.

4) Output exactly one tool call: setHaikuTransformPipelines with 3 entries (lineIndex 0,1,2). Put any explanation inside analysis.rationale and pipeline.notes. Do not output free-text outside the tool call.`

const HAIKU_TRANSFORM_TOOL: Anthropic.Tool = {
  name: 'setHaikuTransformPipelines',
  description: 'Define transformation pipelines for all 3 haiku lines based on emotional analysis.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      lines: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        description: 'One entry per haiku line, indexed 0..2',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['lineIndex', 'analysis', 'pipeline'],
          properties: {
            lineIndex: { type: 'integer', enum: [0, 1, 2] },
            analysis: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'valence', 'arousal', 'motion', 'tension', 'confidence'],
              properties: {
                text: { type: 'string', description: 'Original haiku line' },
                valence: { type: 'number', minimum: -1, maximum: 1, description: '-1=negative, +1=positive' },
                arousal: { type: 'number', minimum: 0, maximum: 1, description: '0=calm, 1=energetic' },
                motion: { type: 'string', enum: ['up', 'down', 'neutral'] },
                tension: { type: 'string', enum: ['rising', 'falling', 'steady'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                rationale: { type: 'string' }
              }
            },
            pipeline: {
              type: 'object',
              additionalProperties: false,
              required: ['steps'],
              properties: {
                notes: { type: 'string', description: 'Why these steps fit the analysis' },
                steps: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 3,
                  description: 'Each step must have "op" (easeIn|easeOut|octaveShift) and either "amount" (0-1 for ease ops) or "semitones" (-12 or 12 for octaveShift)',
                  items: {
                    type: 'object',
                    required: ['op'],
                    properties: {
                      op: { 
                        type: 'string', 
                        enum: ['easeIn', 'easeOut', 'octaveShift'],
                        description: 'Transform operation: easeIn (accelerate), easeOut (decelerate), octaveShift (transpose)'
                      },
                      amount: { 
                        type: 'number', 
                        minimum: 0, 
                        maximum: 1,
                        description: 'For easeIn/easeOut: blend amount (0.3=gentle, 0.6=medium, 0.9=intense). Omit for octaveShift.'
                      },
                      semitones: { 
                        type: 'integer',
                        enum: [-12, 12],
                        description: 'For octaveShift: -12 (down one octave) or 12 (up one octave). Omit for ease ops.'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    required: ['lines']
  }
}

export function applyPipeline(clip: AbletonClip, steps: PipelineStep[]): AbletonClip {
  return steps.reduce((acc, step) => {
    switch (step.op) {
      case 'easeIn':
        return ease(acc, 'in2', Math.max(0, Math.min(1, step.amount ?? 1)))
      case 'easeOut':
        return ease(acc, 'out2', Math.max(0, Math.min(1, step.amount ?? 1)))
      case 'octaveShift':
        return acc.transpose(step.semitones === -12 ? -12 : 12)
    }
  }, clip)
}

export async function generateHaikuTransformPipelines(
  apiKey: string,
  haikuText: string
): Promise<Map<0 | 1 | 2, LinePipeline>> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true
  })

  const haikuPipelines = new Map<0 | 1 | 2, LinePipeline>()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    system: HAIKU_TRANSFORM_SYSTEM_PROMPT,
    tools: [HAIKU_TRANSFORM_TOOL],
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `Analyze this haiku and create transformation pipelines for each line:\n\n${haikuText}`
      }
    ]
  })

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'setHaikuTransformPipelines'
  )

  if (!toolUse) {
    throw new Error('LLM did not call setHaikuTransformPipelines tool')
  }

  const input = toolUse.input as { lines: LinePipeline[] }
  if (!Array.isArray(input?.lines) || input.lines.length !== 3) {
    throw new Error('Expected exactly 3 pipeline entries')
  }

  input.lines.forEach((entry) => {
    haikuPipelines.set(entry.lineIndex, entry)
  })

  return haikuPipelines
}

export function transformHaikuClips(rawClips: AbletonClip[], pipelines: Map<0 | 1 | 2, LinePipeline>): AbletonClip[] {
  return rawClips.map((clip, i) => {
    const entry = pipelines.get(i as 0 | 1 | 2)
    if (!entry) return clip.clone()
    return applyPipeline(clip, entry.pipeline.steps)
  })
}
