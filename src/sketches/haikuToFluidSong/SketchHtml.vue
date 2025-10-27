<template>
  <div class="container">
    <section class="haiku-controls minimal">
      <div class="minimal-header">enter a haiku</div>
      <textarea
        class="haiku-input"
        v-model="haikuText"
        rows="5"
        spellcheck="false"
      ></textarea>
      <div class="haiku-actions">
        <button
          type="button"
          class="haiku-ready"
          :class="{ status: isStatusActive }"
          :disabled="!canRunAnalysis"
          @click="handleRunAnalysis"
        >
          {{ buttonLabel }}
        </button>
        <transition name="cancel-slide">
          <div v-if="canCancel" class="haiku-cancel-wrapper">
            <button
              type="button"
              class="haiku-cancel"
              @click="handleCancel"
            >
              cancel
            </button>
          </div>
        </transition>
      </div>
      <p v-if="pipelineError" class="haiku-controls__error">{{ pipelineError }}</p>
    </section>
    <div class="canvas-controls-wrapper center-canvas">
      <button
        type="button"
        class="param-toggle"
        @click="toggleParamWindow"
        :aria-expanded="showParamWindow ? 'true' : 'false'"
        :class="{ collapsed: !showParamWindow }"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 2 L8 6 L4 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div
        class="controls-slot"
        :class="{ collapsed: !showParamWindow }"
        :aria-hidden="showParamWindow ? 'false' : 'true'"
      >
        <div class="controls">
          <div class="control-group" v-for="param in fluidParams" :key="param.name">
            <label :for="`fluid-param-${param.name}`">{{ param.label }}</label>
            <input
              :id="`fluid-param-${param.name}`"
              type="range"
              :min="param.min"
              :max="param.max"
              :step="param.step"
              v-model.number="param.value.value"
            />
            <input
              type="number"
              :min="param.min"
              :max="param.max"
              :step="param.step"
              v-model.number="param.value.value"
              class="value-input"
            />
          </div>
        </div>
      </div>
      <div class="canvas-column">
        <div class="canvas-group">
          <div class="canvas-wrapper" ref="canvasWrapperRef">
            <canvas id="fluidCanvas" :width="width" :height="height"></canvas>
          </div>
          
        </div>
      </div>
    </div>

    <div class="description-section">
      <button 
        type="button" 
        class="description-toggle"
        @click="toggleDescription"
        :aria-expanded="showDescription ? 'true' : 'false'"
      >
        <span>{{ showDescription ? '▼' : '▶' }} About this Sketch</span>
      </button>
      <transition name="description-expand">
        <div v-if="showDescription" class="description-content">
          <div class="description-header-row">
            <h2>General Components</h2>
            <button
              type="button"
              class="popout-button"
              @click="popoutDescription"
              title="Open in new window"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M9 2L14 2L14 7M14 2L7 9M6 3H3C2.44772 3 2 3.44772 2 4V13C2 13.5523 2.44772 14 3 14H12C12.5523 14 13 13.5523 13 13V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Pop Out</span>
            </button>
          </div>
          
          <div class="component-section">
            <h3>Handwriting Animation System</h3>
            <p>A custom canvas tool that allows you draw strokes and also add metadata to help with letter alignment for typesetting</p>
            <a :href="`${currentOrigin}/handwriting_animator?preset=alphabet`" target="_blank" class="component-link">
              View Handwriting Animator →
            </a>
          </div>

          <div class="component-section">
            <h3>Fluid Simulation</h3>
            <p>A port of Pavel Dogret's WebGL fluid simulation into a modular WebGPU shader graph system to make it more hackable</p>
            <p>An LLM analyzes the haiku and picks a color per line</p>
            <a :href="`${currentOrigin}/fluidSimChat`" target="_blank" class="component-link">
              View Fluid Simulation →
            </a>
          </div>

          <div class="component-section">
            <h3>Timing Engine</h3>
            <p>A custom typescript timing library that allows you freely interleave musical and visual events and write heirarchical, generative timelines</p>
            <a href="https://github.com/AvneeshSarwate/browser_drawn_projections/?tab=readme-ov-file#sequencing-and-time" target="_blank" class="component-link">
              View Documentation →
            </a>
          </div>

          <div class="component-section">
            <h3>Haiku ⇒ Music LLM Translator</h3>
            <ul class="feature-list">
              <li><strong>LLM to Pitch:</strong> LLM analyzes haiku and picks a 5 pitch sequence</li>
              <li><strong>LLM syllables:</strong> LLM analyzes the syllable patterns of the lines of the haiku</li>
              <li><strong>Base melody generator:</strong> A handwritten melody generation system takes the pitch sequence and syllable patterns and builds the base melodies for each line</li>
              <li><strong>LLM pitch transforms:</strong> LLM analyzes each line of the haiku, and decides on a stack of transformations to apply to each line's base melody</li>
              <li><strong>LLM synth preset:</strong> LLM analyzes the haiku and generates a synth param preset to match the mood</li>
            </ul>
          </div>

          <div class="component-section">
            <h3>System Dependencies</h3>
            <div id="mermaid-diagram" class="mermaid-container"></div>
          </div>
        </div>
      </transition>
    </div>

    <!-- <WebGPUTest /> -->
  </div>
</template>

<script setup lang="ts">
import { inject, computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import mermaid from 'mermaid'
import { appStateName, type FluidReactionAppState, type FluidDebugMode } from './appState'
import FluidChat from './FluidChat.vue'
import { useScreenshotStore, type Screenshot } from './useScreenshots'
import WebGPUTest from './WebGPUTest.vue'

const state = inject<FluidReactionAppState>(appStateName)!!
const width = computed(() => state.width)
const height = computed(() => state.height)
const canvasWrapperRef = ref<HTMLDivElement>()

const haikuText = computed({
  get: () => state.haikuText.value,
  set: (value: string) => {
    state.haikuText.value = value
  },
})

const isHaikuAnimating = computed(() => state.isHaikuAnimating.value)
const isProcessing = ref(false)
const canRunAnalysis = computed(() => Boolean(state.startHaikuPipeline.value) && !!haikuText.value.trim() && !state.isHaikuAnimating.value && !isProcessing.value)
const isStatusActive = computed(() => isHaikuAnimating.value || isProcessing.value)
const buttonLabel = computed(() => {
  if (isHaikuAnimating.value) {
    return 'Animating…'
  }
  if (isProcessing.value) {
    return 'Preparing…'
  }
  return 'ready'
})
const canCancel = computed(() => isStatusActive.value && Boolean(state.cancelHaikuPipeline.value))
const canRunTest = computed(() => false)
const pipelineError = ref<string | null>(null)

async function runPipeline(skipMusic = false, useTestData = false) {
  pipelineError.value = null
  const runner = state.startHaikuPipeline.value
  if (!runner) {
    pipelineError.value = 'Sketch pipeline is not ready yet.'
    return
  }
  try {
    isProcessing.value = true
    await runner(skipMusic, useTestData)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to run haiku animation'
    pipelineError.value = message
    console.error('[fluid] haiku pipeline failed', err)
  } finally {
    isProcessing.value = false
  }
}

function handleRunAnalysis() {
  void runPipeline(false, false)
}

function handleRunTestGraphics() { /* hidden in minimal UI */ }

function handleCancel() {
  state.cancelHaikuPipeline.value?.()
}

const screenshotStore = useScreenshotStore()
const isCapturing = computed(() => screenshotStore.isCapturing.value)
const captureError = ref<string | null>(null)
const screenshots = computed(() => screenshotStore.screenshots.value)
const previewShot = ref<Screenshot | null>(null)

const fluidParams = [
  { name: 'densityDissipation', label: 'Density Dissipation', min: 0.0, max: 1.0, step: 0.01, value: ref(0.18) },
  { name: 'velocityDissipation', label: 'Velocity Dissipation', min: 0.0, max: 4.0, step: 0.05, value: ref(2.35) },
  { name: 'pressure', label: 'Pressure Damping', min: 0.0, max: 1.0, step: 0.01, value: ref(0.2) },
  { name: 'pressureIterations', label: 'Pressure Iterations', min: 1, max: 80, step: 1, value: ref(20) },
  { name: 'curl', label: 'Vorticity', min: 0, max: 60, step: 1, value: ref(2) },
  { name: 'splatRadius', label: 'Splat Radius', min: 0.01, max: 1.0, step: 0.01, value: ref(0.64) },
  { name: 'forceStrength', label: 'Splat Force', min: 0, max: 20000, step: 100, value: ref(2200) },
  { name: 'dyeInjectionStrength', label: 'Dye Injection', min: 0.0, max: 2.0, step: 0.01, value: ref(1.3) },
]

// Export params so LivecodeHolder can access them
state.fluidParams = fluidParams

// Debug mode descriptions with more context
const debugModeDescriptions: Record<FluidDebugMode, { title: string; description: string }> = {
  dye: {
    title: 'Dye Visualization',
    description: 'This view shows colored "dye" particles being carried along by the fluid flow. The dye doesn\'t affect the fluid itself—it\'s a passive tracer that reveals the motion and swirling patterns (vortices) in the flow. As you drag, the dye gets pulled along the velocity field through a process called advection, showing you exactly how the fluid is moving. Watch how the colors mix and swirl together, creating beautiful patterns that demonstrate the fluid\'s turbulent behavior.',
  },
  velocity: {
    title: 'Velocity Field',
    description: 'This visualization shows the fluid\'s velocity at every point—both its direction and speed. Brighter or more saturated colors indicate faster-moving fluid, while the hue or vector direction shows which way it\'s flowing. This is the fundamental quantity in fluid simulation: it tells you where the fluid is going and how quickly. When you drag, you\'re directly modifying this velocity field by adding momentum. The velocity field then carries itself forward through self-advection.',
  },
  divergence: {
    title: 'Divergence Field',
    description: 'Divergence measures whether velocity is "spreading out" (diverging) or "squeezing in" (converging) at each point. Positive values (bright areas) mean fluid is spreading out like a source, while negative values (dark areas) mean it\'s being compressed like a sink. For an incompressible fluid like water, divergence should be zero everywhere—the simulation enforces this by computing pressure. If you see non-zero divergence, it means the pressure solver needs to "push back" to keep the fluid from compressing or expanding.',
  },
  pressure: {
    title: 'Pressure Field',
    description: 'Pressure is the invisible force that prevents the fluid from compressing. When velocity tries to create divergence (compression or expansion), the simulation solves for pressure and uses it to correct the velocity back to an incompressible state. High pressure (bright) pushes fluid outward, low pressure (dark) pulls it inward. This is computed using the Poisson equation and creates the "squishy" behavior you expect from liquids. Pressure is what makes fluid flow around obstacles and creates the characteristic swirling patterns.',
  },
  splat: {
    title: 'Applied Forces (Splat)',
    description: 'This shows the actual forces being applied to the fluid during the current frame, typically from your mouse or touch input. When you drag, you\'re adding momentum (velocity) at a specific location, creating a "splat" of force. The color and direction encode both the strength and direction of the impulse. This force is then added to the existing velocity field before the simulation computes the next time step. The splat uses a Gaussian (bell curve) shape to create a smooth, localized push.',
  },
  splatRaw: {
    title: 'Raw Splat Impulse',
    description: 'This shows the pure Gaussian "blob" shape of your input before it\'s converted into a directional force. It\'s a smooth, circular falloff centered on your click or drag position—essentially the spatial influence function. The raw splat represents "how much" force to apply at each point near your input, independent of direction. When this gets multiplied by your drag direction and added to the velocity field, it becomes the directional splat you see in the previous view.',
  },
}

const currentDebugInfo = computed(() => debugModeDescriptions[state.debugMode.value])

function handlePreview(shot: Screenshot) {
  previewShot.value = shot
}

function closePreview() {
  previewShot.value = null
}

const programmaticSplat = state.programmaticSplat
const programmaticKeyActive = ref(false)
const showParamWindow = ref(false)
const showExtraUI = ref(false)
const showDescription = ref(false)
const currentOrigin = computed(() => window.location.origin)

function toggleParamWindow() {
  const next = !showParamWindow.value
  showParamWindow.value = next
  showExtraUI.value = next
  requestAnimationFrame(() => {
    updateCanvasScale()
  })
}

async function toggleDescription() {
  showDescription.value = !showDescription.value
  if (showDescription.value) {
    await nextTick()
    renderMermaidDiagram()
  }
}

// @ts-ignore - TypeScript incorrectly detects duplicate from HTML template string
function popoutDescription() {
  const popupWindow = window.open('', 'Haiku to Fluid Song - Description', 'width=900,height=700,menubar=no,toolbar=no,location=no,status=no')
  
  if (!popupWindow) {
    alert('Please allow popups for this site to open the description in a new window')
    return
  }

  const origin = window.location.origin
  
  popupWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Haiku to Fluid Song - Description</title>
        <style>
          body {
            margin: 0;
            padding: 20px;
            background: #08090f;
            color: #dde0ff;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
          }
          
          h1 {
            margin: 0 0 25px 0;
            font-size: 1.8rem;
            color: #f4f6ff;
            border-bottom: 2px solid rgba(102, 122, 255, 0.3);
            padding-bottom: 12px;
          }
          
          h2 {
            margin: 25px 0 15px 0;
            font-size: 1.4rem;
            color: #99aaff;
          }
          
          .component-section {
            margin-bottom: 25px;
            padding: 15px 20px;
            background: rgba(102, 122, 255, 0.08);
            border-left: 3px solid #667aff;
            border-radius: 6px;
          }
          
          .component-section h3 {
            margin: 0 0 12px 0;
            font-size: 1.15rem;
            color: #99aaff;
          }
          
          .component-section p {
            margin: 0 0 8px 0;
            line-height: 1.6;
            font-size: 0.95rem;
            color: rgba(221, 224, 255, 0.85);
          }
          
          .component-section p:last-of-type {
            margin-bottom: 12px;
          }
          
          .component-link {
            display: inline-block;
            color: #99aaff;
            text-decoration: none;
            font-size: 0.9rem;
            padding: 6px 12px;
            background: rgba(102, 122, 255, 0.15);
            border-radius: 4px;
            transition: background 0.2s ease, color 0.2s ease;
          }
          
          .component-link:hover {
            background: rgba(102, 122, 255, 0.25);
            color: #b3c4ff;
          }
          
          .feature-list {
            margin: 8px 0 0 0;
            padding-left: 20px;
            list-style-type: none;
          }
          
          .feature-list li {
            margin-bottom: 10px;
            line-height: 1.6;
            font-size: 0.95rem;
            color: rgba(221, 224, 255, 0.85);
            position: relative;
            padding-left: 15px;
          }
          
          .feature-list li::before {
            content: '→';
            position: absolute;
            left: 0;
            color: #667aff;
          }
          
          .feature-list strong {
            color: #99aaff;
          }
          
          .mermaid-container {
            margin-top: 15px;
            padding: 20px;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(102, 122, 255, 0.2);
            border-radius: 6px;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 300px;
          }
          
          .mermaid-container svg {
            max-width: 100%;
            height: auto;
          }
        </style>
        <script type="module">
          import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
          
          mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeVariables: {
              primaryColor: '#1a1d2e',
              primaryTextColor: '#dde0ff',
              primaryBorderColor: '#667aff',
              lineColor: '#667aff',
              secondaryColor: '#1a1d2e',
              tertiaryColor: '#1a1d2e',
              background: '#08090f',
              mainBkg: '#1a1d2e',
              secondBkg: '#1a1d2e',
              tertiaryBkg: '#1a1d2e',
              nodeBorder: '#667aff',
              clusterBkg: '#1a1d2e',
              clusterBorder: '#667aff',
              textColor: '#dde0ff',
              edgeLabelBackground: '#08090f',
              fontSize: '14px'
            }
          });
          
          const diagramDefinition = 'graph TD\\n' +
    '    Haiku[Haiku Input]\\n' +
    '    LLMPitch[LLM to Pitch]\\n' +
    '    LLMSyllables[LLM Syllables]\\n' +
    '    LLMSynth[LLM Synth Preset]\\n' +
    '    BaseGen[Base Melody Generator]\\n' +
    '    LLMTransforms[LLM Pitch Transforms]\\n' +
    '    Final[Final Output]\\n' +
    '    \\n' +
    '    Haiku --> LLMPitch\\n' +
    '    Haiku --> LLMSyllables\\n' +
    '    Haiku --> LLMSynth\\n' +
    '    LLMPitch --> BaseGen\\n' +
    '    LLMSyllables --> BaseGen\\n' +
    '    Haiku --> LLMTransforms\\n' +
    '    BaseGen --> LLMTransforms\\n' +
    '    LLMSynth --> Final\\n' +
    '    LLMTransforms --> Final\\n' +
    '    \\n' +
    '    style Haiku fill:#1a1d2e,stroke:#667aff,color:#dde0ff\\n' +
    '    style LLMPitch fill:#1a1d2e,stroke:#667aff,color:#dde0ff\\n' +
    '    style LLMSyllables fill:#1a1d2e,stroke:#667aff,color:#dde0ff\\n' +
    '    style LLMSynth fill:#1a1d2e,stroke:#667aff,color:#dde0ff\\n' +
    '    style BaseGen fill:#1a1d2e,stroke:#885cff,color:#dde0ff\\n' +
    '    style LLMTransforms fill:#1a1d2e,stroke:#885cff,color:#dde0ff\\n' +
    '    style Final fill:#1a1d2e,stroke:#99aaff,color:#dde0ff';
          
          window.addEventListener('load', async () => {
            try {
              const { svg } = await mermaid.render('mermaid-svg-id', diagramDefinition);
              const container = document.getElementById('mermaid-diagram');
              if (container) {
                container.innerHTML = svg;
              }
            } catch (error) {
              console.error('Mermaid rendering error:', error);
            }
          });
        <` + `/script>
      </head>
      <body>
        <h1>Haiku to Fluid Song</h1>
        
        <div class="component-section">
          <h3>Handwriting Animation System</h3>
          <p>A custom canvas tool that allows you draw strokes and also add metadata to help with letter alignment for typesetting</p>
          <a href="${origin}/handwriting_animator?preset=alphabet" target="_blank" class="component-link">
            View Handwriting Animator →
          </a>
        </div>

        <div class="component-section">
          <h3>Fluid Simulation</h3>
          <p>A port of Pavel Dogret's WebGL fluid simulation into a modular WebGPU shader graph system to make it more hackable</p>
          <p>An LLM analyzes the haiku and picks a color per line</p>
          <a href="${origin}/fluidSimChat" target="_blank" class="component-link">
            View Fluid Simulation →
          </a>
        </div>

        <div class="component-section">
          <h3>Timing Engine</h3>
          <p>A custom typescript timing library that allows you freely interleave musical and visual events and write heirarchical, generative timelines</p>
          <a href="https://github.com/AvneeshSarwate/browser_drawn_projections/?tab=readme-ov-file#sequencing-and-time" target="_blank" class="component-link">
            View Documentation →
          </a>
        </div>

        <div class="component-section">
          <h3>Haiku ⇒ Music LLM Translator</h3>
          <ul class="feature-list">
            <li><strong>LLM to Pitch:</strong> LLM analyzes haiku and picks a 5 pitch sequence</li>
            <li><strong>LLM syllables:</strong> LLM analyzes the syllable patterns of the lines of the haiku</li>
            <li><strong>Base melody generator:</strong> A handwritten melody generation system takes the pitch sequence and syllable patterns and builds the base melodies for each line</li>
            <li><strong>LLM pitch transforms:</strong> LLM analyzes each line of the haiku, and decides on a stack of transformations to apply to each line's base melody</li>
            <li><strong>LLM synth preset:</strong> LLM analyzes the haiku and generates a synth param preset to match the mood</li>
          </ul>
        </div>

        <div class="component-section">
          <h2>System Dependencies</h2>
          <div id="mermaid-diagram" class="mermaid-container"></div>
        </div>
      </body>
    </html>
  `)
  
  popupWindow.document.close()
}

async function renderMermaidDiagram() {
  const diagramDefinition = `graph TD
    Haiku[Haiku Input]
    LLMPitch[LLM to Pitch]
    LLMSyllables[LLM Syllables]
    LLMSynth[LLM Synth Preset]
    BaseGen[Base Melody Generator]
    LLMTransforms[LLM Pitch Transforms]
    Final[Final Output]
    
    Haiku --> LLMPitch
    Haiku --> LLMSyllables
    Haiku --> LLMSynth
    LLMPitch --> BaseGen
    LLMSyllables --> BaseGen
    Haiku --> LLMTransforms
    BaseGen --> LLMTransforms
    LLMSynth --> Final
    LLMTransforms --> Final
    
    style Haiku fill:#1a1d2e,stroke:#667aff,color:#dde0ff
    style LLMPitch fill:#1a1d2e,stroke:#667aff,color:#dde0ff
    style LLMSyllables fill:#1a1d2e,stroke:#667aff,color:#dde0ff
    style LLMSynth fill:#1a1d2e,stroke:#667aff,color:#dde0ff
    style BaseGen fill:#1a1d2e,stroke:#885cff,color:#dde0ff
    style LLMTransforms fill:#1a1d2e,stroke:#885cff,color:#dde0ff
    style Final fill:#1a1d2e,stroke:#99aaff,color:#dde0ff`

  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#1a1d2e',
        primaryTextColor: '#dde0ff',
        primaryBorderColor: '#667aff',
        lineColor: '#667aff',
        secondaryColor: '#1a1d2e',
        tertiaryColor: '#1a1d2e',
        background: '#08090f',
        mainBkg: '#1a1d2e',
        secondBkg: '#1a1d2e',
        tertiaryBkg: '#1a1d2e',
        nodeBorder: '#667aff',
        clusterBkg: '#1a1d2e',
        clusterBorder: '#667aff',
        textColor: '#dde0ff',
        edgeLabelBackground: '#08090f',
        fontSize: '14px'
      }
    })

    const { svg } = await mermaid.render('mermaid-svg-id', diagramDefinition)
    const container = document.getElementById('mermaid-diagram')
    if (container) {
      container.innerHTML = svg
    }
  } catch (error) {
    console.error('Mermaid rendering error:', error)
    const container = document.getElementById('mermaid-diagram')
    if (container) {
      container.innerHTML = '<div style="color: #ff9aa2;">Error rendering diagram. Please check the console.</div>'
    }
  }
}

function startProgrammaticSplat() {
  programmaticSplat.restartToken.value += 1
  programmaticSplat.active.value = true
}

function stopProgrammaticSplat() {
  programmaticSplat.active.value = false
  programmaticKeyActive.value = false
}

function handleProgrammaticPointerDown() {
  startProgrammaticSplat()
}

function handleProgrammaticPointerUp() {
  stopProgrammaticSplat()
}

function handleProgrammaticPointerCancel() {
  stopProgrammaticSplat()
}

function handleProgrammaticKeyDown(event: KeyboardEvent) {
  if (event.repeat || programmaticKeyActive.value) {
    return
  }
  programmaticKeyActive.value = true
  startProgrammaticSplat()
}

function handleProgrammaticKeyUp() {
  stopProgrammaticSplat()
}

//todo - workaround for weirdness of babylon.js and resizing via css
function updateCanvasScale() {
  const wrapper = canvasWrapperRef.value
  const canvas = document.getElementById('fluidCanvas') as HTMLCanvasElement
  if (!wrapper || !canvas) return

  const controlsSlot = document.querySelector('.controls-slot') as HTMLElement
  const controlsWidth = controlsSlot?.offsetWidth || 0
  const toggleWidth = 32 + 15 // button width + gap
  const buffer = 40 // aesthetic padding

  const viewportWidth = window.innerWidth
  const availableWidth = viewportWidth - controlsWidth - toggleWidth - buffer
  const canvasWidth = canvas.width
  const scale = availableWidth / canvasWidth

  wrapper.style.setProperty('--canvas-scale', scale.toString())
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  // Wait for DOM to settle
  requestAnimationFrame(() => {
    updateCanvasScale()
  })
  window.addEventListener('resize', updateCanvasScale)
  
  const controlsSlot = document.querySelector('.controls-slot') as HTMLElement
  if (controlsSlot) {
    resizeObserver = new ResizeObserver(() => {
      updateCanvasScale()
    })
    resizeObserver.observe(controlsSlot)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasScale)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  padding: 20px;
  background: #08090f;
  color: #dde0ff;
  min-height: 100vh;
}

.haiku-controls {
  width: 100%;
  max-width: 960px;
  background: rgba(10, 12, 26, 0.92);
  border: 1px solid rgba(124, 156, 255, 0.25);
  border-radius: 18px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 32px 60px rgba(4, 6, 16, 0.55);
  backdrop-filter: blur(8px);
}

.haiku-controls__header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #f4f6ff;
}

.haiku-controls__header p {
  margin: 6px 0 0;
  font-size: 0.95rem;
  line-height: 1.5;
  color: rgba(221, 224, 255, 0.75);
}

.control-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(221, 224, 255, 0.65);
}

.control-field input,
.control-field textarea {
  background: rgba(18, 20, 36, 0.95);
  border: 1px solid rgba(124, 156, 255, 0.35);
  border-radius: 10px;
  color: #dde0ff;
  padding: 12px 14px;
  font-size: 0.95rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  font-family: 'Inter', sans-serif;
}

.control-field input:focus,
.control-field textarea:focus {
  border-color: rgba(162, 190, 255, 0.85);
  box-shadow: 0 0 0 3px rgba(90, 122, 255, 0.35);
  outline: none;
}

.control-field textarea {
  min-height: 140px;
  resize: vertical;
}

.haiku-controls__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.haiku-button {
  flex: 1 1 200px;
  border-radius: 999px;
  border: 1px solid rgba(160, 184, 255, 0.35);
  padding: 12px 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
  color: #f3f5ff;
  background: linear-gradient(135deg, rgba(91, 119, 255, 0.95), rgba(148, 87, 255, 0.95));
}

.haiku-button.secondary {
  background: rgba(28, 32, 52, 0.9);
  border-color: rgba(126, 150, 255, 0.3);
}

.haiku-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(70, 104, 255, 0.35);
}

.haiku-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.haiku-controls__error {
  font-size: 0.85rem;
  color: #ff9aa2;
}



.below-row {
  display: flex;
  gap: 15px;
  align-items: stretch;
  width: 100%;
  max-width: 1200px;
}

.below-row .instructions {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.chat-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
}

.canvas-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
}

.canvas-label {
  font-size: 0.9rem;
  color: #aaa;
  text-align: center;
}

.canvas-wrapper {
  position: relative;
  display: inline-block;
}

.capture-button {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  color: #dde0ff;
  font-size: 0.75rem;
  padding: 4px 8px;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.capture-button:not(:disabled):hover {
  background: rgba(102, 122, 255, 0.45);
  transform: translateY(-1px);
}

.capture-button:disabled {
  cursor: progress;
  opacity: 0.6;
}

.capture-hint {
  margin-top: 6px;
  font-size: 0.75rem;
  color: rgba(221, 224, 255, 0.6);
}

.capture-error {
  margin-top: 4px;
  font-size: 0.75rem;
  color: #ff9aa2;
}

.screenshot-gallery {
  margin-top: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gallery-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  color: rgba(221, 224, 255, 0.75);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.gallery-count {
  font-size: 0.72rem;
  color: rgba(221, 224, 255, 0.6);
}

.gallery-strip {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.gallery-strip::-webkit-scrollbar {
  height: 8px;
}

.gallery-strip::-webkit-scrollbar-thumb {
  background: rgba(221, 224, 255, 0.2);
  border-radius: 4px;
}

.gallery-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 120px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px;
  cursor: pointer;
  color: inherit;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.gallery-item:hover {
  border-color: rgba(102, 122, 255, 0.6);
  transform: translateY(-1px);
}

.gallery-item img {
  width: 100%;
  height: 70px;
  object-fit: cover;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
}

.gallery-item-label {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: rgba(221, 224, 255, 0.75);
}

.gallery-empty {
  font-size: 0.75rem;
  color: rgba(221, 224, 255, 0.55);
}

.screenshot-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 6, 12, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1000;
}

.screenshot-preview-card {
  position: relative;
  max-width: min(90vw, 1100px);
  max-height: min(90vh, 700px);
  background: rgba(12, 14, 24, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 20px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}

.preview-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: transparent;
  border: none;
  color: rgba(221, 224, 255, 0.75);
  font-size: 1.4rem;
  cursor: pointer;
  padding: 2px 6px;
}

.preview-close:hover {
  color: #ffb3ba;
}

.preview-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: rgba(221, 224, 255, 0.85);
}

.preview-label {
  font-size: 1rem;
  font-weight: 600;
}

.preview-details {
  font-size: 0.85rem;
  color: rgba(221, 224, 255, 0.65);
}

.preview-image {
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.55);
}

canvas {
  border: 1px solid rgba(255, 255, 255, 0.3);
  cursor: crosshair;
  touch-action: none;
  background: black;
}

.canvas-wrapper {
  transform-origin: top left;
  /* Scale to fit container width while maintaining aspect ratio */
  transform: scale(var(--canvas-scale, 1));
}

.instructions {
  max-width: 800px;
  font-size: 0.95rem;
  line-height: 1.4;
  text-align: center;
}

.instructions h2 {
  margin: 0 0 10px 0;
  font-size: 1.3rem;
}

.debug-info {
  margin: 20px 0;
  padding: 15px 20px;
  background: rgba(102, 122, 255, 0.1);
  border-left: 3px solid #667aff;
  border-radius: 6px;
  text-align: left;
}

.debug-info h3 {
  margin: 0 0 10px 0;
  font-size: 1.1rem;
  color: #99aaff;
}

.debug-info p {
  margin: 0;
  line-height: 1.6;
  font-size: 0.95rem;
}

.debug-shortcuts {
  margin-top: 15px;
  font-size: 0.85rem;
  color: #aaa;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.programmatic-button-inline {
  width: 100%;
  margin-top: 8px;
  background: linear-gradient(135deg, #667aff, #885cff);
  border: none;
  color: #f3f4ff;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  box-shadow: 0 2px 8px rgba(102, 122, 255, 0.25);
}

.programmatic-button-inline:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: 2px;
}

.programmatic-button-inline:active {
  transform: translateY(1px);
  box-shadow: 0 1px 4px rgba(102, 122, 255, 0.2);
}

.canvas-controls-wrapper {
  display: flex;
  gap: 15px;
  align-items: flex-start;
  width: 100%;
  max-width: 1200px;
  margin-left: auto;
  margin-right: auto;
}

.canvas-controls-wrapper.center-canvas {
  width: 100%;
  max-width: none;
  justify-content: left;
}

.controls-slot {
  flex: 0 0 240px;
  width: 240px;
  overflow: hidden;
  transition: width 300ms ease, flex-basis 300ms ease;
}

.controls-slot.collapsed {
  flex-basis: 0px;
  width: 0px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  min-width: 240px;
  opacity: 1;
  transform: translateX(0);
  transition: opacity 250ms ease, transform 250ms ease;
  pointer-events: auto;
}

.controls-slot.collapsed .controls {
  opacity: 0;
  transform: translateX(-12px);
  pointer-events: none;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-group label {
  font-size: 0.85rem;
  color: #aaa;
}

.control-group input[type="range"] {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}

.control-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: #667aff;
  border-radius: 50%;
  cursor: pointer;
}

.control-group input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: #667aff;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.value-input {
  width: 100%;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #dde0ff;
  font-size: 0.85rem;
}

.canvas-column {
  display: flex;
  flex-direction: column;
  gap: 15px;
  align-items: center;
  flex: 1 1 auto;
}

.param-toggle {
  position: relative;
  align-self: flex-start;
  background: rgba(102, 122, 255, 0.2);
  border: 1px solid rgba(102, 122, 255, 0.4);
  border-radius: 6px;
  color: #dde0ff;
  width: 32px;
  height: 32px;
  min-width: 32px;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 10;
}

.param-toggle:hover {
  background: rgba(102, 122, 255, 0.35);
  border-color: rgba(102, 122, 255, 0.6);
}

.param-toggle svg {
  transition: transform 0.3s ease;
}

.param-toggle.collapsed svg {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .controls-slot,
  .controls-slot .controls {
    transition: none;
  }
}

/* Minimal UI overrides */
.haiku-controls.minimal {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  max-width: 720px;
  gap: 12px;
  align-items: center;
  --haiku-width: 300px;
  --cancel-width: 78px;
}

.minimal-header {
  color: #dde0ff;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}

.haiku-actions {
  display: flex;
  flex-direction: row;
  gap: 10px;
  width: var(--haiku-width);
  align-items: stretch;
  justify-content: center;
  margin: 0 auto;
}

.haiku-input {
  width: var(--haiku-width);
  min-height: 140px;
  resize: none;
  background: #000;
  color: #fff;
  border: 1px solid #3a3f5a;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.95rem;
}

.haiku-input:focus {
  outline: none;
  border-color: #5a6280;
}

.haiku-cancel-wrapper {
  display: flex;
  max-width: var(--cancel-width);
  overflow: hidden;
  flex: 0 0 auto;
}

.haiku-ready {
  background: #08090f; /* match container */
  color: #dde0ff;
  border: 1px solid #3a3f5a;
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 0.95rem;
  cursor: pointer;
  flex: 1;
  min-width: 0;
  text-align: left;
}

.haiku-ready:disabled {
  opacity: 0.6;
  cursor: default;
}

.haiku-ready.status {
  background: #000;
  color: #70768d;
  border-color: #292c3c;
  opacity: 1;
}

.haiku-ready.status:disabled {
  opacity: 1;
  cursor: default;
}

.haiku-cancel {
  background: transparent;
  color: #a0a4b8;
  border: 1px solid #3a3f5a;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  width: 100%;
}

.haiku-cancel:hover {
  border-color: #505b79;
  color: #c2c7dd;
}

.cancel-slide-enter-active,
.cancel-slide-leave-active {
  transition: opacity 200ms ease, transform 200ms ease, max-width 200ms ease, margin 200ms ease;
}

.cancel-slide-enter-from,
.cancel-slide-leave-to {
  opacity: 0;
  transform: translateX(12px);
  max-width: 0;
  margin-left: -10px;
}

.cancel-slide-enter-to,
.cancel-slide-leave-from {
  max-width: var(--cancel-width);
  margin-left: 0;
}

:global(body) {
  background: #05060f;
  color: #dde0ff;
}

.description-section {
  width: 100%;
  max-width: 1200px;
  margin-top: 20px;
}

.description-toggle {
  width: 100%;
  background: rgba(102, 122, 255, 0.1);
  border: 1px solid rgba(102, 122, 255, 0.3);
  border-radius: 8px;
  color: #dde0ff;
  padding: 12px 20px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
  text-align: left;
  display: flex;
  align-items: center;
}

.description-toggle:hover {
  background: rgba(102, 122, 255, 0.15);
  border-color: rgba(102, 122, 255, 0.5);
}

.description-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid rgba(102, 122, 255, 0.3);
}

.description-header-row h2 {
  margin: 0;
  font-size: 1.4rem;
  color: #f4f6ff;
}

.popout-button {
  background: rgba(102, 122, 255, 0.15);
  border: 1px solid rgba(102, 122, 255, 0.4);
  border-radius: 6px;
  color: #dde0ff;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
}

.popout-button:hover {
  background: rgba(102, 122, 255, 0.25);
  border-color: rgba(102, 122, 255, 0.6);
  transform: translateY(-1px);
}

.popout-button svg {
  display: block;
  flex-shrink: 0;
}

.popout-button span {
  font-weight: 500;
}

.description-toggle span {
  font-weight: 500;
}

.description-content {
  margin-top: 15px;
  padding: 20px 25px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  text-align: left;
}

.component-section {
  margin-bottom: 25px;
  padding: 15px 20px;
  background: rgba(102, 122, 255, 0.08);
  border-left: 3px solid #667aff;
  border-radius: 6px;
}

.component-section h3 {
  margin: 0 0 12px 0;
  font-size: 1.15rem;
  color: #99aaff;
}

.component-section p {
  margin: 0 0 8px 0;
  line-height: 1.6;
  font-size: 0.95rem;
  color: rgba(221, 224, 255, 0.85);
}

.component-section p:last-of-type {
  margin-bottom: 12px;
}

.component-link {
  display: inline-block;
  color: #99aaff;
  text-decoration: none;
  font-size: 0.9rem;
  padding: 6px 12px;
  background: rgba(102, 122, 255, 0.15);
  border-radius: 4px;
  transition: background 0.2s ease, color 0.2s ease;
}

.component-link:hover {
  background: rgba(102, 122, 255, 0.25);
  color: #b3c4ff;
}

.feature-list {
  margin: 8px 0 0 0;
  padding-left: 20px;
  list-style-type: none;
}

.feature-list li {
  margin-bottom: 10px;
  line-height: 1.6;
  font-size: 0.95rem;
  color: rgba(221, 224, 255, 0.85);
  position: relative;
  padding-left: 15px;
}

.feature-list li::before {
  content: '→';
  position: absolute;
  left: 0;
  color: #667aff;
}

.feature-list strong {
  color: #99aaff;
}

.mermaid-container {
  margin-top: 15px;
  padding: 20px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(102, 122, 255, 0.2);
  border-radius: 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.mermaid-container :deep(svg) {
  max-width: 100%;
  height: auto;
}

.description-expand-enter-active,
.description-expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.description-expand-enter-from,
.description-expand-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0;
}

.description-expand-enter-to,
.description-expand-leave-from {
  opacity: 1;
  max-height: 2000px;
  margin-top: 15px;
}
</style>
