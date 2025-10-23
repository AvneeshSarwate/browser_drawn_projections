<template>
  <div class="container">
    <div class="canvas-controls-wrapper">
      <div class="controls">
        <div class="control-group" v-for="param in fluidParams" :key="param.name">
          <label>{{ param.label }}</label>
          <input type="range" :min="param.min" :max="param.max" :step="param.step" v-model.number="param.value.value" />
          <input type="number" :min="param.min" :max="param.max" :step="param.step" v-model.number="param.value.value"
            class="value-input" />
        </div>
        <button
          type="button"
          class="programmatic-button-inline"
          @pointerdown.prevent="handleProgrammaticPointerDown"
          @pointerup="handleProgrammaticPointerUp"
          @pointerleave="handleProgrammaticPointerCancel"
          @pointercancel="handleProgrammaticPointerCancel"
          @blur="handleProgrammaticPointerCancel"
          @keydown.space.prevent="handleProgrammaticKeyDown"
          @keyup.space.prevent="handleProgrammaticKeyUp"
          @keydown.enter.prevent="handleProgrammaticKeyDown"
          @keyup.enter.prevent="handleProgrammaticKeyUp"
        >
          Programmatic Splat
        </button>
      </div>
      <div class="canvas-column">
        <div class="canvas-group">
          <div class="canvas-label">Fluid Simulation</div>
          <div class="canvas-wrapper">
            <canvas id="fluidCanvas" :width="width" :height="height"></canvas>
            <button
              type="button"
              class="capture-button"
              :disabled="isCapturing"
              :aria-busy="isCapturing ? 'true' : 'false'"
              :title="isCapturing ? 'Capturing…' : 'Capture screenshot (shift-click for PNG)'"
              @click="handleCapture($event)"
            >
              <span>{{ isCapturing ? 'Capturing…' : 'Capture' }}</span>
            </button>
          </div>
          <div class="capture-hint">Shift-click the capture button for a lossless PNG capture.</div>
          <div v-if="captureError" class="capture-error">{{ captureError }}</div>
          <div class="screenshot-gallery">
            <div class="gallery-header">
              <span>Recent Captures</span>
              <span class="gallery-count">{{ screenshots.length }} / {{ screenshotStore.maxItems }}</span>
            </div>
            <div v-if="screenshots.length" class="gallery-strip">
              <button
                v-for="shot in screenshots"
                :key="shot.id"
                type="button"
                class="gallery-item"
                :title="`${shot.label} • ${shot.width}x${shot.height}`"
                @click="handlePreview(shot)"
              >
                <img :src="shot.blobUrl" alt="" />
                <div class="gallery-item-label">
                  <span>{{ shot.label }}</span>
                  <span>{{ shot.debugMode }}</span>
                </div>
              </button>
            </div>
            <div v-else class="gallery-empty">Captured screenshots will appear here.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="below-row">
      <div class="instructions">
        <h2>Fluid Simulation Playground</h2>
        <p>Drag on the canvas to interact with the fluid.</p>
        <p>Press <strong>P</strong> to pause/resume. Press <strong>1-6</strong> or <strong>[ ]</strong> to cycle debug
          views.</p>

        <div class="debug-info">
          <h3>{{ currentDebugInfo.title }}</h3>
          <p>{{ currentDebugInfo.description }}</p>
        </div>

        <div class="debug-shortcuts">
          <strong>Quick Keys:</strong> 1-Dye | 2-Velocity | 3-Divergence | 4-Pressure | 5-Splat | 6-Splat Raw | [ ] Cycle
        </div>
      </div>
      <div class="chat-wrapper">
        <FluidChat />
      </div>
    </div>

    <div v-if="previewShot" class="screenshot-preview-overlay" @click.self="closePreview">
      <div class="screenshot-preview-card">
        <button type="button" class="preview-close" @click="closePreview">×</button>
        <div class="preview-meta">
          <span class="preview-label">{{ previewShot.label }}</span>
          <span class="preview-details">{{ previewShot.debugMode }} • {{ previewShot.width }}×{{ previewShot.height }}</span>
        </div>
        <img :src="previewShot.blobUrl" alt="" class="preview-image" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, ref } from 'vue'
import { appStateName, type FluidReactionAppState, type FluidDebugMode } from './appState'
import FluidChat from './FluidChat.vue'
import { useScreenshotStore } from './useScreenshots'
import type { Screenshot } from './types/screenshot'

const state = inject<FluidReactionAppState>(appStateName)!!
const width = computed(() => state.width)
const height = computed(() => state.height)

const screenshotStore = useScreenshotStore()
const isCapturing = computed(() => screenshotStore.isCapturing.value)
const captureError = ref<string | null>(null)
const screenshots = computed(() => screenshotStore.screenshots.value)
const previewShot = ref<Screenshot | null>(null)

const fluidParams = [
  { name: 'densityDissipation', label: 'Density Dissipation', min: 0.0, max: 1.0, step: 0.01, value: ref(1.0) },
  { name: 'velocityDissipation', label: 'Velocity Dissipation', min: 0.0, max: 4.0, step: 0.05, value: ref(0.2) },
  { name: 'pressure', label: 'Pressure Damping', min: 0.0, max: 1.0, step: 0.01, value: ref(0.8) },
  { name: 'pressureIterations', label: 'Pressure Iterations', min: 1, max: 80, step: 1, value: ref(20) },
  { name: 'curl', label: 'Vorticity', min: 0, max: 60, step: 1, value: ref(30) },
  { name: 'splatRadius', label: 'Splat Radius', min: 0.01, max: 1.0, step: 0.01, value: ref(0.25) },
  { name: 'forceStrength', label: 'Splat Force', min: 0, max: 20000, step: 100, value: ref(6000) },
  { name: 'dyeInjectionStrength', label: 'Dye Injection', min: 0.0, max: 2.0, step: 0.01, value: ref(0.65) },
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

async function handleCapture(event?: MouseEvent) {
  captureError.value = null
  const lossless = event?.shiftKey ?? false
  try {
    await screenshotStore.capture({ lossless })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to capture screenshot'
    captureError.value = message
    console.error('[fluid] screenshot capture failed', err)
  }
}

function handlePreview(shot: Screenshot) {
  previewShot.value = shot
}

function closePreview() {
  previewShot.value = null
}

const programmaticSplat = state.programmaticSplat
const programmaticKeyActive = ref(false)

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
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  min-width: 200px;
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
}
</style>
