import Anthropic from '@anthropic-ai/sdk'

export type FMSynthPreset = {
  attack: number
  decay: number
  sustain: number
  release: number
  distortion: number
  chorusWet: number
  chorusDepth: number
  chorusRate: number
  filterFreq: number
  filterRes: number
  filter2Freq: number
  filter2Res: number
  delayTime: number
  delayFeedback: number
  delayMix: number
  reverb: number
  gain: number
  pan: number
}

const FM_SYNTH_PRESET_SYSTEM_PROMPT = `You are an audio producer designing one global FM synthesizer preset for a full haiku performance. Analyze the haiku's emotional character and map it to normalized parameters (0-1) for a Tone.js FM synth chain with this topology:
FMSynth → Distortion → Chorus → Filter → Delay (with crossfader) → Filter2 → Reverb → Phaser → Gain → Panner

Guidelines for mapping:
1) Emotional axes to infer (internally):
   - Valence (negative ↔ positive)
   - Arousal/Energy (calm ↔ intense)
   - Space/Depth (intimate/close ↔ vast/distant)
   - Brightness/Texture (dark/soft ↔ bright/metallic)
   - Motion/Flow (still/sustained ↔ restless/staccato)
   Also consider imagery: water/air (fluid, shimmering), earth/stone/metal (dense, gritty), urban/industrial (edgy, harsh), nature/organic (warm, lush).

2) Parameter heuristics (normalized 0-1):
   - ADSR (FMSynth envelope):
     • attack: calmer/warm/legato → higher; urgent/percussive → lower.
     • decay: shorter with higher arousal; longer with gentler motion.
     • sustain: higher with positive/soothing mood, pad-like textures; lower for brittle/tense or plucky.
     • release: longer with space/ambience/poignancy; shorter for tight/close/urgent.
   - distortion: higher with harsh/industrial/metal/struggle; lower for pure/soft/serene.
   - chorusWet/Depth/Rate:
     • Wet/Depth: higher for water/air/shimmer/nostalgia; lower for dry/intimate.
     • Rate: slower for calm/contemplative; faster for nervous energy. Keep subtle unless explicitly lively.
   - filterFreq (post-chorus): brightness. Darker moods → lower; bright/hopeful → higher.
     filterRes: more resonance for tension/nasal/fragile; less for smooth/natural.
   - delayTime/Feedback/Mix:
     • Time: short slap (~0-0.3) for immediacy; medium (~0.3-0.6) for reflective; long only if echoes explicitly fit.
     • Feedback/Mix: higher for echoic/reflective/nostalgic; lower for dry/intimate/forward.
   - filter2Freq/filter2Res (post-delay): shape the tail.
     • Darker tails for intimacy or melancholy; brighter for sparkly air. Use moderate resonance unless a special effect is implied.
   - reverb: higher for vast/open/distant; lower for intimate/close/dry.
   - gain: keep conservative to avoid clipping when reverb/delay/distortion are high. Typical 0.15-0.35.
   - pan: keep near center unless imagery suggests lateral bias; small offsets preferred.

3) Guardrails - Keep these typical ranges for musicality:
   • attack 0.05-0.8, decay 0.05-0.6, sustain 0.3-0.9, release 0.1-0.8
   • distortion 0-0.4
   • chorusWet 0-0.6, chorusDepth 0.2-0.7, chorusRate 0-0.4 (slow), 0.4-0.8 (faster)
   • filterFreq 0.2-0.9, filterRes 0.1-0.7
   • filter2Freq 0.2-0.8, filter2Res 0.1-0.6
   • delayTime 0.05-0.7, delayFeedback 0.05-0.6, delayMix 0-0.6
   • reverb 0-0.7
   • gain 0.15-0.35
   • pan 0.4-0.6 unless a motif suggests otherwise

4) Call the setFMSynthPreset tool with all 18 parameters. Do not output free text.`

const FM_SYNTH_PRESET_TOOL: Anthropic.Tool = {
  name: 'setFMSynthPreset',
  description: 'Set the FM synthesizer preset parameters based on haiku emotional analysis.',
  input_schema: {
    type: 'object',
    required: [
      'attack', 'decay', 'sustain', 'release',
      'distortion',
      'chorusWet', 'chorusDepth', 'chorusRate',
      'filterFreq', 'filterRes',
      'filter2Freq', 'filter2Res',
      'delayTime', 'delayFeedback', 'delayMix',
      'reverb', 'gain', 'pan'
    ],
    properties: {
      attack: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Envelope attack time. Higher for calm/warm/legato, lower for urgent/percussive.'
      },
      decay: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Envelope decay time. Shorter with higher arousal, longer with gentler motion.'
      },
      sustain: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Envelope sustain level. Higher for positive/pad-like, lower for brittle/plucky.'
      },
      release: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Envelope release time. Longer with space/ambience, shorter for tight/urgent.'
      },
      distortion: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Distortion amount. Higher for harsh/industrial, lower for pure/soft/serene.'
      },
      chorusWet: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Chorus wet/dry mix. Higher for water/air/shimmer, lower for dry/intimate.'
      },
      chorusDepth: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Chorus modulation depth. Higher for rich/warbly, lower for subtle.'
      },
      chorusRate: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Chorus modulation rate. Slower for calm, faster for nervous energy.'
      },
      filterFreq: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Filter cutoff frequency. Lower for dark moods, higher for bright/hopeful.'
      },
      filterRes: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Filter resonance. More for tension/fragile, less for smooth/natural.'
      },
      filter2Freq: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Second filter cutoff (tail shaping). Lower for dark tails, higher for sparkly.'
      },
      filter2Res: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Second filter resonance. Use moderately unless special effect needed.'
      },
      delayTime: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Delay time. Short slap for immediacy, medium for reflective, long for ambient.'
      },
      delayFeedback: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Delay feedback. Higher for cascading echoes, lower for single repeats.'
      },
      delayMix: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Delay wet/dry mix. Higher for echoic/reflective, lower for dry/forward.'
      },
      reverb: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Reverb amount. Higher for vast/open/distant, lower for intimate/close.'
      },
      gain: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Output gain. Keep 0.15-0.35 to avoid clipping when FX are high.'
      },
      pan: { 
        type: 'number', 
        minimum: 0, 
        maximum: 1,
        description: 'Stereo panning. 0=left, 0.5=center, 1=right. Keep near center unless imagery suggests bias.'
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function validateAndClampPreset(preset: any): FMSynthPreset {
  const validatedPreset: FMSynthPreset = {
    attack: clamp(preset.attack ?? 0.5, 0, 1),
    decay: clamp(preset.decay ?? 0.5, 0, 1),
    sustain: clamp(preset.sustain ?? 0.5, 0, 1),
    release: clamp(preset.release ?? 0.5, 0, 1),
    distortion: clamp(preset.distortion ?? 0, 0, 1),
    chorusWet: clamp(preset.chorusWet ?? 0, 0, 1),
    chorusDepth: clamp(preset.chorusDepth ?? 0.3, 0, 1),
    chorusRate: clamp(preset.chorusRate ?? 0.2, 0, 1),
    filterFreq: clamp(preset.filterFreq ?? 1, 0, 1),
    filterRes: clamp(preset.filterRes ?? 0.5, 0, 1),
    filter2Freq: clamp(preset.filter2Freq ?? 0.5, 0, 1),
    filter2Res: clamp(preset.filter2Res ?? 0.5, 0, 1),
    delayTime: clamp(preset.delayTime ?? 0.5, 0, 1),
    delayFeedback: clamp(preset.delayFeedback ?? 0.1, 0, 1),
    delayMix: clamp(preset.delayMix ?? 0, 0, 1),
    reverb: clamp(preset.reverb ?? 0.1, 0, 1),
    gain: clamp(preset.gain ?? 0.2, 0, 1),
    pan: clamp(preset.pan ?? 0.5, 0, 1)
  }
  return validatedPreset
}

export async function generateHaikuSynthPreset(apiKey: string, haikuText: string): Promise<FMSynthPreset> {
  if (!apiKey) {
    throw new Error('API key is required')
  }

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true
  })

  const response = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    system: FM_SYNTH_PRESET_SYSTEM_PROMPT,
    tools: [FM_SYNTH_PRESET_TOOL],
    max_tokens: 1024,
    temperature: 0.5,
    messages: [
      {
        role: 'user',
        content: `Analyze this haiku and create an FM synth preset:\n\n${haikuText}`
      }
    ]
  })

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'setFMSynthPreset'
  )

  if (!toolUse) {
    throw new Error('LLM did not call setFMSynthPreset tool')
  }

  const rawPreset = toolUse.input as FMSynthPreset
  return validateAndClampPreset(rawPreset)
}
