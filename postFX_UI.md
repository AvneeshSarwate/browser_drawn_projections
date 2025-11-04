# PostFX UI Implementation Plan

## Overview

Auto-generate a Vue UI for Babylon.js fragment shader post-processing chains that:
- Displays an interactive left-to-right graph visualization of shader effect nodes
- Surfaces sliders for all float parameters when clicking nodes
- Shows animated, non-interactive sliders for Dynamic (function-controlled) parameters
- Works automatically for all derived shader effect classes

## Architecture

### Core Principles
1. **Source of truth**: Effect instances (CustomShaderEffect) hold inputs (graph edges) and uniforms (parameters)
2. **Introspection layer**: Metadata flows from WGSL shader → codegen → CustomShaderEffect → UI
3. **Zero config for derived classes**: All shader effects automatically get UI for free

### Data Flow
```
WGSL Shader Comments (UI hints)
    ↓
generateFragmentShader (parse & emit UniformDescriptor[])
    ↓
Generated Effect Class (passes meta to CustomShaderEffect)
    ↓
CustomShaderEffect (tracks live values, graph structure)
    ↓
Vue UI (reads graph & params, renders Cytoscape + sliders)
```

## Graph Library Selection

### Recommendation: **Cytoscape.js + dagre layout**

**Justification:**
1. **DAG Layout**: Built-in dagre extension provides proven left-to-right hierarchical layout for directed acyclic graphs
2. **Complete Feature Set**: Native support for zoom, pan, and node click events
3. **Framework Agnostic**: Pure JavaScript library that integrates cleanly with Vue 3 via component wrapper
4. **Performance**: Optimized for medium-sized graphs with clean edge routing

**Alternatives Considered:**
- **Vue Flow**: Vue 3 native, excellent DX, but unclear DAG auto-layout support (would require custom layout algorithm)
- **v-network-graph**: Vue 3 native, good interactivity, but lacks explicit left-to-right DAG layout

**Trade-off**: Cytoscape.js requires manual Vue integration vs. Vue Flow's native Vue components, but provides robust DAG layout out-of-the-box with lower implementation risk.

## Required Changes

### 1. CustomShaderEffect Class (shaderFXBabylon.ts)

#### New Type Definitions
```typescript
export interface UniformDescriptor {
  name: string
  kind: 'f32' | 'i32' | 'u32' | 'bool' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f'
  bindingName: string
  default?: unknown
  ui?: {
    min?: number
    max?: number
    step?: number
  }
}

export interface UniformRuntime {
  isDynamic: boolean  // true if controlled by function
  current?: number    // latest evaluated value
  min?: number        // observed minimum (for dynamic range)
  max?: number        // observed maximum (for dynamic range)
}

export interface GraphNode {
  id: string
  name: string
  ref: ShaderEffect
}

export interface GraphEdge {
  from: string  // source effect ID
  to: string    // target effect ID
}

export interface ShaderGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
```

#### Extend CustomShaderEffectOptions
```typescript
export interface CustomShaderEffectOptions<U, I> {
  // ... existing fields
  uniformMeta?: UniformDescriptor[]
}
```

#### New CustomShaderEffect Fields
```typescript
class CustomShaderEffect {
  // Existing fields...
  
  public readonly uniformMeta: UniformDescriptor[]
  private readonly uniformRuntime: Record<string, UniformRuntime> = {}
  
  constructor(engine: BABYLON.WebGPUEngine, inputs: I, options: CustomShaderEffectOptions<U, I>) {
    super()
    this.uniformMeta = options.uniformMeta ?? []
    // ... existing constructor code
  }
}
```

#### New CustomShaderEffect Methods

**Introspection Methods:**
```typescript
// Get uniform metadata (type, defaults, UI hints)
public getUniformsMeta(): UniformDescriptor[] {
  return this.uniformMeta
}

// Get runtime tracking (current value, observed range, dynamic status)
public getUniformRuntime(): Record<string, UniformRuntime> {
  return this.uniformRuntime
}

// Helper to filter float uniforms for UI
public getFloatUniformNames(): string[] {
  return this.uniformMeta.filter(m => m.kind === 'f32').map(m => m.name)
}
```

**Graph Structure Methods:**
```typescript
// Get topological order without rendering (refactor existing renderAll logic)
public getOrderedEffects(): ShaderEffect[] {
  const ordered: ShaderEffect[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const visit = (effect: ShaderEffect): void => {
    if (visited.has(effect.id)) return
    if (visiting.has(effect.id)) {
      throw new Error(`Cycle detected at ${effect.effectName}`)
    }
    visiting.add(effect.id)
    for (const input of Object.values(effect.inputs)) {
      if (input instanceof ShaderEffect) {
        visit(input)
      }
    }
    visiting.delete(effect.id)
    visited.add(effect.id)
    ordered.push(effect)
  }

  visit(this)
  return ordered
}

// Build graph structure for visualization
public getGraph(): ShaderGraph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const visited = new Set<string>()

  const visit = (effect: ShaderEffect): void => {
    if (visited.has(effect.id)) return
    visited.add(effect.id)
    
    nodes.push({
      id: effect.id,
      name: effect.effectName,
      ref: effect
    })

    for (const input of Object.values(effect.inputs)) {
      if (input instanceof ShaderEffect) {
        edges.push({
          from: input.id,
          to: effect.id
        })
        visit(input)
      }
    }
  }

  visit(this)
  return { nodes, edges }
}
```

**Runtime Tracking in updateUniforms():**
```typescript
updateUniforms(): void {
  const resolvedUniforms: Record<string, unknown> = {}
  for (const key in this.uniforms) {
    resolvedUniforms[key] = extract(this.uniforms[key])
  }
  
  // Track numeric runtime values for UI
  for (const key in resolvedUniforms) {
    const value = resolvedUniforms[key]
    if (typeof value === 'number') {
      const isDynamic = typeof this.uniforms[key] === 'function'
      let runtime = this.uniformRuntime[key] ?? { isDynamic, current: value }
      
      runtime.current = value
      runtime.isDynamic = isDynamic
      
      // Track observed range for dynamic parameters
      if (runtime.min === undefined || value < runtime.min) {
        runtime.min = value
      }
      if (runtime.max === undefined || value > runtime.max) {
        runtime.max = value
      }
      
      this.uniformRuntime[key] = runtime
    }
  }
  
  const partial = resolvedUniforms as Partial<U>
  for (const handles of this.passHandles) {
    handles.setUniforms(partial)
  }
}
```

### 2. generateFragmentShader.ts (Codegen)

#### Extend UniformField Interface
```typescript
interface UniformField {
  name: string
  bindingName: string
  wgslType: string
  defaultExpression?: string
  uiMin?: number
  uiMax?: number
  uiStep?: number
}
```

#### Parse UI Hints from WGSL Comments

Support inline UI hints in WGSL struct comments:
```wgsl
struct WobbleUniforms {
  xStrength: f32,  // 0.05 min=0 max=0.2 step=0.01
  yStrength: f32,  // 0.05 min=0 max=0.2 step=0.01
  time: f32,
}
```

Parsing logic (extend `extractUniformDefaults`):
```typescript
function parseUIHints(comment: string): {
  default?: string
  min?: number
  max?: number
  step?: number
} {
  const trimmed = comment.trim()
  const hints: any = {}
  
  // Parse default value (existing logic)
  const defaultMatch = trimmed.match(/^[\d.eE+-]+/)
  if (defaultMatch) {
    hints.default = defaultMatch[0]
  }
  
  // Parse min/max/step
  const minMatch = trimmed.match(/min=([\d.eE+-]+)/)
  const maxMatch = trimmed.match(/max=([\d.eE+-]+)/)
  const stepMatch = trimmed.match(/step=([\d.eE+-]+)/)
  
  if (minMatch) hints.min = parseFloat(minMatch[1])
  if (maxMatch) hints.max = parseFloat(maxMatch[1])
  if (stepMatch) hints.step = parseFloat(stepMatch[1])
  
  return hints
}
```

#### Emit UniformMeta Constant

Add to generated TypeScript:
```typescript
import { 
  CustomShaderEffect, 
  type ShaderSource, 
  type RenderPrecision, 
  type ShaderUniforms, 
  type Dynamic,
  type UniformDescriptor  // NEW
} from '../shaderFXBabylon'

export const WobbleUniformMeta: UniformDescriptor[] = [
  {
    name: 'xStrength',
    kind: 'f32',
    bindingName: 'uniforms_xStrength',
    default: 0.05,
    ui: { min: 0, max: 0.2, step: 0.01 }
  },
  {
    name: 'yStrength',
    kind: 'f32',
    bindingName: 'uniforms_yStrength',
    default: 0.05,
    ui: { min: 0, max: 0.2, step: 0.01 }
  },
  {
    name: 'time',
    kind: 'f32',
    bindingName: 'uniforms_time'
  }
]
```

#### Pass Meta to Effect Constructor

Modify generated effect class:
```typescript
export class WobbleEffect extends CustomShaderEffect<WobbleUniforms, WobbleInputs> {
  effectName = 'Wobble'

  constructor(
    engine: BABYLON.WebGPUEngine,
    inputs: WobbleInputs,
    width = 1280,
    height = 720,
    sampleMode: 'nearest' | 'linear' = 'linear',
    precision: RenderPrecision = 'half_float'
  ) {
    super(engine, inputs, {
      factory: (sceneRef, options) => createWobbleMaterial(sceneRef, options),
      textureInputKeys: ['src'],
      width,
      height,
      materialName: 'WobbleMaterial',
      sampleMode,
      precision,
      uniformMeta: WobbleUniformMeta  // NEW
    })
  }
}
```

### 3. Vue Component Structure

#### Component Hierarchy
```
ShaderGraphUI.vue (root component)
├── GraphPanel.vue (Cytoscape wrapper)
└── ParamsPanel.vue (sliders for selected effect)
    └── FloatSlider.vue (individual parameter slider)
```

#### ShaderGraphUI.vue
```vue
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ShaderEffect } from '@/rendering/shaderFXBabylon'
import GraphPanel from './GraphPanel.vue'
import ParamsPanel from './ParamsPanel.vue'

const props = defineProps<{
  finalEffect: ShaderEffect
}>()

const selectedEffect = ref<ShaderEffect | null>(null)

const graph = computed(() => {
  if ('getGraph' in props.finalEffect) {
    return (props.finalEffect as any).getGraph()
  }
  return { nodes: [], edges: [] }
})

const orderedEffects = computed(() => {
  if ('getOrderedEffects' in props.finalEffect) {
    return (props.finalEffect as any).getOrderedEffects()
  }
  return []
})

function onNodeClick(nodeId: string) {
  const node = graph.value.nodes.find(n => n.id === nodeId)
  if (node) {
    selectedEffect.value = node.ref
  }
}
</script>

<template>
  <div class="shader-graph-ui">
    <div class="graph-section">
      <h3>Effect Chain</h3>
      <GraphPanel 
        :nodes="graph.nodes" 
        :edges="graph.edges"
        @node-click="onNodeClick"
      />
    </div>
    
    <div class="params-section">
      <h3>Parameters</h3>
      <ParamsPanel 
        v-if="selectedEffect" 
        :effect="selectedEffect"
      />
      <div v-else class="no-selection">
        Click a node to view parameters
      </div>
    </div>
  </div>
</template>

<style scoped>
.shader-graph-ui {
  display: flex;
  gap: 1rem;
  height: 100%;
}

.graph-section {
  flex: 1;
  min-width: 400px;
}

.params-section {
  width: 300px;
  overflow-y: auto;
}
</style>
```

#### GraphPanel.vue (Cytoscape wrapper)
```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import type { GraphNode, GraphEdge } from '@/rendering/shaderFXBabylon'

cytoscape.use(dagre)

const props = defineProps<{
  nodes: GraphNode[]
  edges: GraphEdge[]
}>()

const emit = defineEmits<{
  'node-click': [nodeId: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
let cy: cytoscape.Core | null = null

onMounted(() => {
  if (!containerRef.value) return

  cy = cytoscape({
    container: containerRef.value,
    
    elements: {
      nodes: props.nodes.map(n => ({
        data: { id: n.id, label: n.name }
      })),
      edges: props.edges.map(e => ({
        data: { source: e.from, target: e.to }
      }))
    },
    
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'background-color': '#666',
          'color': '#fff',
          'text-valign': 'center',
          'text-halign': 'center',
          'width': 120,
          'height': 40,
          'shape': 'roundrectangle'
        }
      },
      {
        selector: 'node:selected',
        style: {
          'background-color': '#0af'
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#999',
          'target-arrow-color': '#999',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier'
        }
      }
    ],
    
    // @ts-ignore - dagre layout options not in base cytoscape types
    layout: {
      name: 'dagre',
      rankDir: 'LR',  // Left to right
      nodeSep: 50,
      rankSep: 100
    },
    
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false
  })

  cy.on('tap', 'node', (evt) => {
    const nodeId = evt.target.id()
    emit('node-click', nodeId)
  })
})

onUnmounted(() => {
  cy?.destroy()
})

// Rebuild graph when nodes/edges change
watch(() => [props.nodes, props.edges], () => {
  if (!cy) return
  
  cy.elements().remove()
  cy.add([
    ...props.nodes.map(n => ({ data: { id: n.id, label: n.name } })),
    ...props.edges.map(e => ({ data: { source: e.from, target: e.to } }))
  ])
  // @ts-ignore - dagre layout options
  cy.layout({ name: 'dagre', rankDir: 'LR' }).run()
}, { deep: true })
</script>

<template>
  <div ref="containerRef" class="cytoscape-container"></div>
</template>

<style scoped>
.cytoscape-container {
  width: 100%;
  height: 400px;
  border: 1px solid #ccc;
  background: #f8f8f8;
}
</style>
```

#### ParamsPanel.vue
```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { ShaderEffect } from '@/rendering/shaderFXBabylon'
import FloatSlider from './FloatSlider.vue'

const props = defineProps<{
  effect: ShaderEffect
}>()

const floatParams = computed(() => {
  if (!('getUniformsMeta' in props.effect)) return []
  
  const meta = (props.effect as any).getUniformsMeta()
  return meta.filter((m: any) => m.kind === 'f32')
})
</script>

<template>
  <div class="params-panel">
    <h4>{{ effect.effectName }}</h4>
    
    <div v-if="floatParams.length === 0" class="no-params">
      No float parameters
    </div>
    
    <FloatSlider
      v-for="param in floatParams"
      :key="param.name"
      :effect="effect"
      :param="param"
    />
  </div>
</template>

<style scoped>
.params-panel {
  padding: 0.5rem;
}

.no-params {
  color: #999;
  font-style: italic;
}
</style>
```

#### FloatSlider.vue
```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { ShaderEffect, UniformDescriptor } from '@/rendering/shaderFXBabylon'

const props = defineProps<{
  effect: ShaderEffect
  param: UniformDescriptor
}>()

const sliderValue = ref(0)
let animationFrameId: number | null = null

// Get runtime info
const runtime = computed(() => {
  if (!('getUniformRuntime' in props.effect)) return null
  const rt = (props.effect as any).getUniformRuntime()
  return rt[props.param.name]
})

const isDynamic = computed(() => runtime.value?.isDynamic ?? false)

const currentValue = computed(() => 
  runtime.value?.current ?? (props.param.default as number | undefined) ?? 0
)

const min = computed(() => {
  if (isDynamic.value) {
    return runtime.value?.min ?? (props.param.ui?.min ?? 0)
  }
  return props.param.ui?.min ?? 0
})

const max = computed(() => {
  if (isDynamic.value) {
    return runtime.value?.max ?? (props.param.ui?.max ?? 1)
  }
  return props.param.ui?.max ?? 1
})

const step = computed(() => props.param.ui?.step ?? 0.001)

// Update slider for dynamic params
function updateDynamicSlider() {
  if (isDynamic.value) {
    sliderValue.value = currentValue.value
    animationFrameId = requestAnimationFrame(updateDynamicSlider)
  }
}

onMounted(() => {
  sliderValue.value = currentValue.value
  if (isDynamic.value) {
    updateDynamicSlider()
  }
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})

function onInput(event: Event) {
  if (!isDynamic.value && 'setUniforms' in props.effect) {
    const value = parseFloat((event.target as HTMLInputElement).value)
    ;(props.effect as any).setUniforms({ [props.param.name]: value })
  }
}
</script>

<template>
  <div class="float-slider">
    <label>
      {{ param.name }}
      <span v-if="isDynamic" class="dynamic-badge">Dynamic</span>
    </label>
    
    <div class="slider-row">
      <span class="value-label">{{ min.toFixed(3) }}</span>
      
      <input
        type="range"
        :value="sliderValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="isDynamic"
        @input="onInput"
        class="slider"
        :class="{ dynamic: isDynamic }"
      />
      
      <span class="value-label">{{ max.toFixed(3) }}</span>
    </div>
    
    <div class="current-value">{{ currentValue.toFixed(3) }}</div>
  </div>
</template>

<style scoped>
.float-slider {
  margin-bottom: 1rem;
}

label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.dynamic-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.3rem;
  background: #f90;
  color: white;
  border-radius: 3px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.slider {
  flex: 1;
}

.slider.dynamic {
  opacity: 0.6;
  cursor: not-allowed;
}

.value-label {
  font-size: 0.7rem;
  color: #666;
  min-width: 3rem;
  text-align: center;
}

.current-value {
  text-align: center;
  font-size: 0.8rem;
  color: #333;
  margin-top: 0.25rem;
}
</style>
```

## Testing Plan

### Phase 1: Runtime Verification (Unit-level)
Test with a simple chain: `TransformEffect → WobbleEffect → PassthruEffect`

**Tests:**
1. **Graph structure**
   - `getOrderedEffects()` returns `[Transform, Wobble, Passthru]`
   - `getGraph()` nodes includes all 3 effects
   - `getGraph()` edges: `Transform→Wobble`, `Wobble→Passthru`

2. **Uniform metadata**
   - `Transform.getUniformsMeta()` includes `rotate` with kind `f32`
   - UI hints parsed correctly (min/max/step from WGSL comments)

3. **Dynamic tracking**
   - Set `wobble.setUniforms({ time: () => performance.now() / 1000 })`
   - After animation frames, `getUniformRuntime()['time'].isDynamic === true`
   - `runtime.min` and `runtime.max` expand over time

### Phase 2: UI Integration (clickAVMelodyLauncherBabylon)

**Setup:**
- Create a test shader chain in the sketch
- Mount `<ShaderGraphUI :finalEffect="finalNode" />` in a side panel

**UI Tests:**
1. **Graph rendering**
   - Graph displays with left-to-right layout
   - All nodes visible and labeled correctly
   - Edges connect in correct direction

2. **Node interaction**
   - Clicking node selects it (highlighted in blue)
   - Params panel updates to show selected node's parameters
   - Zoom and pan work smoothly

3. **Static parameters**
   - Transform.rotate slider is interactive
   - Moving slider updates the rendered output in real-time
   - Value display updates correctly

4. **Dynamic parameters**
   - Wobble.time slider is disabled (non-interactive)
   - Slider thumb animates to track live value
   - Range auto-expands from default `[0, 1]` as value increases

### Phase 3: Performance
- Monitor frame rate with UI open vs closed
- Ensure `updateUniforms` overhead is negligible (<0.1ms)
- Verify no memory leaks after repeated UI mount/unmount

## Implementation Phases

### Phase 1: Core Infrastructure (3-4 hours)
1. Add type definitions to `shaderFXBabylon.ts`
2. Implement introspection methods in `CustomShaderEffect`
3. Update `updateUniforms` to track runtime values
4. Test graph traversal with console logs

### Phase 2: Codegen Updates (2-3 hours)
1. Extend WGSL comment parser for UI hints
2. Generate `UniformMeta` constants
3. Update effect class template to pass meta
4. Regenerate all postFX shaders and verify

### Phase 3: Vue Components (4-6 hours)
1. Install dependencies: `npm install cytoscape cytoscape-dagre`
2. Create `GraphPanel.vue` with Cytoscape integration
3. Create `FloatSlider.vue` with dynamic tracking
4. Create `ParamsPanel.vue` and `ShaderGraphUI.vue`
5. Style components for usability

### Phase 4: Integration & Testing (1-2 hours)
1. Add `ShaderGraphUI` to clickAVMelodyLauncherBabylon/SketchHtml.vue
2. Test with existing shader chain in LivecodeHolder.vue (lines 152-176: p5Passthru → feedback → blur → transform → layerBlend → bloom)
3. Pass `shaderGraphEndNode` reference to SketchHtml component
4. Verify all behaviors per test plan
5. Polish UI styling and layout

### Phase 5: Documentation (1 hour)
1. Update AGENTS.md with new features
2. Add JSDoc comments to new APIs
3. Create example usage in README

**Total Estimated Effort: 11-16 hours**

## Dependencies

```bash
npm install cytoscape cytoscape-dagre
npm install --save-dev @types/cytoscape
```

## Files to Create

1. `src/components/ShaderGraphUI/ShaderGraphUI.vue`
2. `src/components/ShaderGraphUI/GraphPanel.vue`
3. `src/components/ShaderGraphUI/ParamsPanel.vue`
4. `src/components/ShaderGraphUI/FloatSlider.vue`

## Files to Modify

1. `src/rendering/shaderFXBabylon.ts` - Add introspection infrastructure
2. `node_src/wgsl/generateFragmentShader.ts` - Extend codegen for UI metadata
3. `src/sketches/clickAVMelodyLauncherBabylon/SketchHtml.vue` - Add UI component
4. `src/sketches/clickAVMelodyLauncherBabylon/LivecodeHolder.vue` - Export shaderGraphEndNode to parent

## Import Path Reference

Use `@/` alias for imports (from tsconfig path mapping):
- `@/rendering/shaderFXBabylon` - shader effect types
- `@/rendering/postFX/*.frag.generated` - generated shader effects
- Components from same directory use relative paths `./ComponentName.vue`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Performance overhead from runtime tracking | Track only numeric values; updates are O(uniform count); negligible for typical chains |
| Incomplete UI metadata in WGSL comments | Default to `[0, 1]` range; allow runtime expansion for dynamic values |
| Cytoscape integration complexity | Use minimal wrapper; follow official Vue integration examples |
| Multi-pass effects complexity | Treat one effect as one node (simpler); extend later if needed |
| Large graphs exceeding viewport | Cytoscape built-in zoom/pan handles this; test with 10+ node chain |

## Future Enhancements

1. **Vector/Matrix UI**: Custom input widgets for vec2f, vec3f, etc.
2. **Graph Editing**: Drag to rewire effect connections
3. **Pass Visualization**: Show intermediate textures as thumbnails
4. **Presets**: Save/load parameter configurations
5. **Grouping**: Collapse sub-chains into groups
6. **Live Preview**: Hover node to preview its output
7. **Animation Recording**: Record parameter changes over time
