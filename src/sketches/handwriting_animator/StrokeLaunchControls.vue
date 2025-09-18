<script setup lang="ts">
import { inject, onMounted, onUnmounted, nextTick } from 'vue'
import { resolution, availableStrokes, animationParams, gpuStrokesReady, launchByName, selectedGroupName, scriptExecuting, appStateName, type TemplateAppState } from './appState'
import { babylonContainer, webGPUSupported, availableGroups, handleBabylonCanvasClick, handleBabylonCanvasMove, clearLoopedAnimations, executeScript, launchLayout, scriptEditorRef, initializeGPUStrokes, initializeScriptEditor, disposeStrokeLauncher } from './strokeLauncher'

const appState = inject<TemplateAppState>(appStateName)!!

const getGroupStrokeIndices = (groupName: string): number[] => {
  return appState.freehandGroupMap[groupName] || []
}

onMounted(async () => {
  await initializeGPUStrokes()

  await nextTick()
  initializeScriptEditor()
})

onUnmounted(() => {
  disposeStrokeLauncher()
})

</script>

<template>
  <div class="gpu-strokes-section">
    <h3>GPU Strokes Animation</h3>
    <canvas
      ref="babylonContainer"
      class="babylon-canvas"
      :width="resolution.width"
      :height="resolution.height"
      :style="{ width: resolution.width + 'px', height: resolution.height + 'px' }"
      @click="handleBabylonCanvasClick"
      @mousemove="handleBabylonCanvasMove"
    ></canvas>

    <div v-if="gpuStrokesReady" class="animation-controls">
      <div class="control-row">
        <label>Stroke A:</label>
        <select v-model="animationParams.strokeA" :disabled="availableStrokes.length < 2 || launchByName">
          <option v-for="stroke in availableStrokes" :key="stroke.index" :value="stroke.index">
            {{ stroke.name }}
          </option>
        </select>
      </div>

      <div class="control-row">
        <label>Stroke B:</label>
        <select v-model="animationParams.strokeB" :disabled="availableStrokes.length < 2 || launchByName">
          <option v-for="stroke in availableStrokes" :key="stroke.index" :value="stroke.index">
            {{ stroke.name }}
          </option>
        </select>
      </div>

      <div class="control-row">
        <label>Interpolation ({{ animationParams.interpolationT.toFixed(2) }}):</label>
        <input
          type="range"
          v-model.number="animationParams.interpolationT"
          min="0"
          max="1"
          step="0.01"
          :disabled="launchByName"
        />
      </div>

      <div class="control-row">
        <label>Launch by Group Name:</label>
        <input type="checkbox" v-model="launchByName" />
        <span class="launch-mode-hint">{{ launchByName ? 'Group launch mode' : 'Interpolation mode' }}</span>
      </div>

      <div v-if="launchByName" class="control-row">
        <label>Group Name:</label>
        <select v-model="selectedGroupName" :disabled="availableGroups.length === 0">
          <option value="">Select a group...</option>
          <option v-for="name in availableGroups" :key="name" :value="name">
            {{ name }}
          </option>
        </select>
        <span class="group-hint">{{ availableGroups.length }} groups available</span>
      </div>

      <div class="control-row">
        <label>Duration:</label>
        <input type="number" v-model.number="animationParams.duration" min="0.1" max="10" step="0.1" />
        <span>seconds</span>
      </div>

      <div class="control-row">
        <label>Scale ({{ animationParams.scale.toFixed(2) }}):</label>
        <input type="range" v-model.number="animationParams.scale" min="0.1" max="3" step="0.1" />
      </div>

      <div class="control-row">
        <label>Anchor Position:</label>
        <div class="radio-group">
          <div class="anchor-section">
            <div class="anchor-category">Stroke Points:</div>
            <label><input type="radio" v-model="animationParams.position" value="start" /> Start Point</label>
            <label><input type="radio" v-model="animationParams.position" value="center" /> Center</label>
            <label><input type="radio" v-model="animationParams.position" value="end" /> End Point</label>
          </div>
          <div class="anchor-section">
            <div class="anchor-category">Bounding Box:</div>
            <label><input type="radio" v-model="animationParams.position" value="bbox-center" /> BBox Center</label>
            <label><input type="radio" v-model="animationParams.position" value="bbox-tl" /> Top Left</label>
            <label><input type="radio" v-model="animationParams.position" value="bbox-tr" /> Top Right</label>
            <label><input type="radio" v-model="animationParams.position" value="bbox-bl" /> Bottom Left</label>
            <label><input type="radio" v-model="animationParams.position" value="bbox-br" /> Bottom Right</label>
          </div>
        </div>
      </div>

      <div class="control-row">
        <label>Loop:</label>
        <input type="checkbox" v-model="animationParams.loop" />
        <span class="loop-hint">{{ animationParams.loop ? 'Animations will loop continuously' : 'Single-shot animations' }}</span>
      </div>

      <div class="control-row">
        <label>Start Phase ({{ animationParams.startPhase.toFixed(2) }}):</label>
        <input type="range" v-model.number="animationParams.startPhase" min="0" max="1" step="0.01" />
        <span class="phase-hint">{{ (animationParams.startPhase * 100).toFixed(0) }}% through animation</span>
      </div>

      <div class="control-row">
        <button @click="clearLoopedAnimations" :disabled="!gpuStrokesReady" class="clear-button">
          🗑️ Clear All Looped Animations
        </button>
        <button
          @click="executeScript"
          :disabled="!gpuStrokesReady || scriptExecuting || availableStrokes.length < 2"
          class="launch-button"
        >
          {{ scriptExecuting ? 'Executing...' : 'Launch Script' }}
        </button>
        <button @click="launchLayout" class="launch-button">
          Launch Layout
        </button>
      </div>

      <div class="info-row">
        <p v-if="launchByName && !selectedGroupName" class="warning">
          ⚠️ Select a group name to launch group animations
        </p>
        <p v-else-if="launchByName && selectedGroupName" class="info">
          ✓ Click canvas to launch group "{{ selectedGroupName }}" ({{ getGroupStrokeIndices(selectedGroupName).length }} strokes)
        </p>
        <p v-else-if="availableStrokes.length < 2" class="warning">
          ⚠️ Draw at least 2 strokes to enable interpolated animations
        </p>
        <p v-else class="info">
          ✓ Click canvas to launch interpolated animations with current settings
        </p>
      </div>
    </div>

    <div v-else class="gpu-loading">
      <p v-if="!webGPUSupported">❌ WebGPU not supported in this browser</p>
      <p v-else>🔄 Initializing GPU Strokes...</p>
    </div>
  </div>

  <div class="script-editor-section">
    <h3>JavaScript Scripts</h3>
    <div ref="scriptEditorRef" class="script-editor"></div>
    <div class="script-controls">
      <span class="script-info">
        {{
          availableStrokes.length < 2
            ? 'Need at least 2 strokes to run scripts'
            : `Ready to execute (${availableStrokes.length} strokes available)`
        }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.gpu-strokes-section {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gpu-strokes-section h3 {
  margin: 0 0 15px 0;
  color: #333;
  text-align: center;
}

.babylon-canvas {
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: crosshair;
  display: block;
  margin: 0 auto 20px auto;
}

.babylon-canvas:hover {
  border-color: #0066ff;
}

.animation-controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.control-row label {
  min-width: 120px;
  font-weight: 500;
  color: #333;
}

.control-row select,
.control-row input[type='number'] {
  padding: 5px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 14px;
}

.control-row input[type='range'] {
  flex: 1;
  min-width: 100px;
}

.radio-group {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}

.radio-group label {
  min-width: auto;
  font-weight: normal;
  display: flex;
  align-items: center;
  gap: 5px;
}

.anchor-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  min-width: 150px;
}

.anchor-category {
  font-weight: bold;
  font-size: 12px;
  color: #bdc3c7;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
  border-bottom: 1px solid #4a5568;
  padding-bottom: 4px;
}

.info-row {
  text-align: center;
  margin-top: 10px;
}

.info-row .warning {
  color: #e67e22;
  font-weight: 500;
}

.info-row .info {
  color: #27ae60;
  font-weight: 500;
}

.gpu-loading {
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.loop-hint,
.phase-hint,
.launch-mode-hint,
.group-hint {
  font-size: 12px;
  color: #666;
  font-style: italic;
  margin-left: 10px;
}

.launch-mode-hint {
  font-weight: 500;
  color: #0066ff;
}

.group-hint {
  color: #28a745;
}

.clear-button {
  background: #dc3545;
  color: white;
  border: 1px solid #dc3545;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.clear-button:hover:not(:disabled) {
  background: #c82333;
  border-color: #c82333;
}

.clear-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.script-editor-section {
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  width: 100%;
  /* max-width: 800px; */
  display: flex;
  flex-direction: column;
  align-items: center;
}

.script-editor-section h3 {
  margin: 0 0 15px 0;
  color: #333;
  text-align: center;
}

.script-editor {
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 15px;
}

.script-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}

.launch-button {
  background: #28a745;
  color: white;
  border: 1px solid #28a745;
  border-radius: 4px;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.launch-button:hover:not(:disabled) {
  background: #218838;
  border-color: #218838;
}

.launch-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #6c757d;
  border-color: #6c757d;
}

.script-info {
  color: #666;
  font-size: 14px;
}
</style>
