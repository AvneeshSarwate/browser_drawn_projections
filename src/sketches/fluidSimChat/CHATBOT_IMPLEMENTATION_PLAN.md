# Fluid Simulation Chatbot Implementation Plan

## Overview
Add a Claude-powered chatbot to explore the fluid simulation parameter space. Fully client-side implementation using the Anthropic SDK with web search enabled.

## Architecture

### 1. Dependencies & Model
- **SDK**: Reuse existing `@anthropic-ai/sdk` dependency
- **Model**: `claude-3-7-sonnet` (supports web search)
- **Pattern**: Follow `claudeChat.example.ts` approach

### 2. Core Components

#### A. Chat Composable (`src/sketches/fluidSimChat/createClaudeFluidChat.ts`)
**Purpose**: Encapsulate Claude API interaction with fluid sim tools

**Key Features**:
- Dynamic tool definitions built from `fluidParams` array (ensures correct ranges)
- Two tools: `readParameters` and `setParameters`
- System prompt with Pavel DoGreat attribution and fluid sim references
- Web search enabled: `search: { enabled: true }`
- Direct manipulation of Vue refs for immediate parameter updates

**System Prompt Contents**:
```
- Introduction: Port of Pavel DoGreat's WebGL-Fluid-Simulation
- References:
  * https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
  * Jos Stam "Stable Fluids" SIGGRAPH 1999
  * Jos Stam "Real-Time Fluid Dynamics for Games" GDC 2003
  * Mark Harris "Fast Fluid Dynamics Simulation on the GPU" GPU Gems Chapter 38
  * https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu
- Parameter descriptions with physical meaning
- Tool usage rules (always read first, clamp to ranges, snap to steps)
```

**Tools**:

1. **readParameters**
   - Returns: `{ name, label, value, min, max, step }[]`
   - Optional filter by parameter names

2. **setParameters**
   - Input: `{ [paramName]: number }`
   - Accepts any subset of parameters
   - Validates: clamps to [min,max], snaps to step granularity
   - Returns: list of changes applied

**Implementation Details**:
- `clamp(value, min, max)`: enforce bounds
- `snapToStep(value, min, step)`: round to nearest step increment (6 decimal precision to avoid float drift)
- `MAX_TOOL_ITERATIONS = 6`: limit tool-use loops to control API costs
- Single-turn conversation (MVP): only current user message + tool results in context

#### B. Chat UI Component (`src/sketches/fluidSimChat/FluidChat.vue`)
**Purpose**: Minimal, dense chat interface matching current dark theme

**Layout Structure**:
```
┌─────────────────────────────┐
│ API Key Input               │
├─────────────────────────────┤
│ Message History             │
│ (max-height: 280px, scroll) │
│                             │
│ ┌─user bubble────┐          │
│ └────────────────┘          │
│          ┌─assistant─────┐  │
│          └───────────────┘  │
│          [tool chips]       │
├─────────────────────────────┤
│ Text Input | Send Button    │
├─────────────────────────────┤
│ [Error Display - hidden]    │
└─────────────────────────────��
```

**Styling**:
- **Base**: `#08090f` background, `#dde0ff` text (match current page)
- **Container**: 380px width, `rgba(255,255,255,0.05)` background, 8px border-radius
- **User bubbles**: `rgba(102,122,255,0.2)` background, align-right
- **Assistant bubbles**: `rgba(255,255,255,0.06)` background, align-left
- **Tool chips**: Small pill-shaped tags showing tool calls
- **Error**: `#ff9aa2` text, hidden by default, appears below composer on error
- **Density**: Tight gaps (4-8px), compact padding, small fonts (0.85-0.9rem)
- **Greyscale theme**: No color except simulation canvas and subtle accent on user bubbles

**Features**:
- Password input for API key (stored only in component state)
- Auto-scroll message history
- Enter key to send
- Disabled send button while waiting
- Loading indicator: "Thinking…"
- Tool call visualization: small chips showing which tools were used

### 3. Integration with Existing Code

#### A. Update `SketchHtml.vue`
**Template Changes**:
```vue
<template>
  <div class="container">
    <!-- Existing canvas-controls-wrapper unchanged -->
    <div class="canvas-controls-wrapper">...</div>

    <!-- NEW: below-row layout -->
    <div class="below-row">
      <div class="instructions">
        <!-- Existing instructions content -->
      </div>
      <FluidChat />
    </div>
  </div>
</template>
```

**Script Changes**:
```typescript
import FluidChat from './FluidChat.vue'
```

**Style Changes**:
```css
.below-row {
  display: flex;
  gap: 15px;
  align-items: flex-start;
  width: 100%;
  max-width: 1200px;
}

.below-row .instructions {
  flex: 1;
  text-align: left;
}
```

#### B. No Changes Needed to:
- `appState.ts`: Already exports `ParamDef` interface
- `LivecodeHolder.vue`: Already has watchers that react to `param.value.value` changes
- Parameter change propagation: Works automatically via Vue reactivity

### 4. Parameter Change Flow
```
User asks Claude to change parameter
  ↓
Claude calls setParameters tool
  ↓
Tool handler clamps & snaps value
  ↓
Writes to param.value.value (Vue ref)
  ↓
LivecodeHolder watcher fires
  ↓
Calls fluidSim.setUniforms()
  ↓
Simulation updates immediately (no animation)
```

### 5. Web Search Configuration
```typescript
const response = await client.messages.create({
  model: 'claude-3-7-sonnet',
  system: buildSystemPrompt(),
  tools,
  max_tokens: 1000,
  messages: conversation,
  search: { enabled: true }  // ← Enables web search
})
```

**Use Case**: When users ask about fluid simulation theory, Claude can search the referenced papers and documentation to provide accurate, non-hallucinated explanations.

## Parameter Descriptions for System Prompt

### Physical Meaning
- **densityDissipation** (Density Dissipation): Dye fade rate via advection loss. Higher = faster fade. Range [0.0, 1.0], step 0.01
- **velocityDissipation** (Velocity Dissipation): Velocity decay (numerical viscosity). Higher = more damping. Range [0.0, 4.0], step 0.05
- **pressure** (Pressure Damping): Pressure solver relaxation factor. Range [0.0, 1.0], step 0.01
- **pressureIterations** (Pressure Iterations): Jacobi/Poisson solver iterations. Higher = better incompressibility, slower. Range [1, 80], step 1
- **curl** (Vorticity): Vorticity confinement strength. Higher = more swirls/turbulence. Range [0, 60], step 1
- **splatRadius** (Splat Radius): Normalized radius of input force/dye Gaussian blob. Range [0.01, 1.0], step 0.01
- **forceStrength** (Splat Force): Scale of velocity impulse from user drag. Range [0, 20000], step 100
- **dyeInjectionStrength** (Dye Injection): Amount of dye injected per interaction. Range [0.0, 2.0], step 0.01

## Error Handling
- **Invalid API key**: Display "Please provide an API key"
- **Network/API errors**: Show error message in dedicated error div below chat
- **Out-of-range values**: Clamp silently, return actual applied values
- **Invalid tool inputs**: Skip parameter, return status in tool result
- **Rate limits**: Caught and displayed in error section

## Security & Privacy
- API key stored only in component state (Vue ref)
- No localStorage/sessionStorage persistence
- No server-side storage
- Warn users: This is a prototype, key is exposed in browser memory
- No logging of API key

## Testing Checklist
- [ ] Chat appears to right of instructions, below canvas
- [ ] API key input works (password field)
- [ ] "What are the current parameters?" → readParameters called, lists all
- [ ] "Increase vorticity to 45" → setParameters called, value changes, slider updates
- [ ] "Set pressure iterations to 200" → clamped to 80 (max), still works
- [ ] Invalid API key → error displays below chat
- [ ] Web search: "Explain vorticity confinement" → Claude searches and cites sources
- [ ] Parameter changes are immediate (no animation)
- [ ] Tool chips show in message history
- [ ] Chat scrolls properly with many messages

## File Structure
```
src/sketches/fluidSimChat/
├── createClaudeFluidChat.ts    # NEW: Composable for Claude chat
├── FluidChat.vue               # NEW: Chat UI component
├── SketchHtml.vue              # MODIFIED: Add chat to layout
├── LivecodeHolder.vue          # UNCHANGED: Watchers already work
├── appState.ts                 # UNCHANGED: Already exports types
├── claudeChat.example.ts       # REFERENCE: Pattern to follow
└── CHATBOT_IMPLEMENTATION_PLAN.md  # THIS FILE
```

## Effort Estimate
- **Composable** (createClaudeFluidChat.ts): 1-3 hours
  - System prompt with references
  - Dynamic tool schemas
  - Tool handlers with clamping/snapping
  - Web search configuration

- **Chat UI** (FluidChat.vue): 1-3 hours
  - Component structure
  - Flat/dense styling matching theme
  - Message display with tool chips
  - Error handling UI

- **Integration** (SketchHtml.vue): 30-60 minutes
  - Layout changes (below-row)
  - Import and mount chat component

- **Testing & Polish**: 30-60 minutes
  - Verify parameter flow
  - Test edge cases
  - UI tweaks for density/alignment

**Total**: 3-7 hours

## Future Enhancements (Not in MVP)
- [ ] Multi-turn conversation history (maintain full context)
- [ ] Streaming responses for longer explanations
- [ ] Additional tools: getDebugMode, setDebugMode, resetFluid, applyPreset
- [ ] Preferred domains for web search (e.g., physics education sites)
- [ ] Server proxy to hide API key (Cloudflare Worker)
- [ ] LocalStorage API key persistence with clear button
- [ ] Export chat history
- [ ] Show web search sources in UI
- [ ] Parameter presets suggested by Claude
- [ ] Visual diff of parameter changes

## References
- **Original Simulation**: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
- **Fluid Simulation Theory**:
  - Jos Stam. "Stable Fluids." SIGGRAPH 1999
  - Jos Stam. "Real-Time Fluid Dynamics for Games." GDC 2003
  - Mark Harris. "Fast Fluid Dynamics Simulation on the GPU." GPU Gems Chapter 38. 2004
  - https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu
- **Claude API**: https://docs.anthropic.com/
- **Web Search in Claude**: search.enabled parameter in API calls
