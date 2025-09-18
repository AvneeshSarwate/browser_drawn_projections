<script setup lang="ts">
import { computed } from 'vue'
import type { CanvasRuntimeState } from './canvasState'
import { getRegisteredAVs } from './ancillaryVisualizations'

// Import the typography guides to ensure they're registered
import './typographyGuides'

interface Props {
  canvasState: CanvasRuntimeState
}

const props = defineProps<Props>()

const defs = computed(() => getRegisteredAVs())
const activeSet = computed(() => props.canvasState.ancillary.activeVisualizations.value)

const setActive = (key: string, enabled: boolean) => {
  const next = new Set(activeSet.value)
  if (enabled) {
    next.add(key)
  } else {
    next.delete(key)
  }
  props.canvasState.ancillary.activeVisualizations.value = next
}

const handleToggle = (key: string, event: Event) => {
  const checked = (event.target as HTMLInputElement).checked
  setActive(key, checked)
}
</script>

<template>
  <div class="av-toggle-pane" v-if="defs.length > 0">
    <h4>Visualizations</h4>
    <div class="toggles-grid">
      <label v-for="def in defs" :key="def.key" class="toggle-item">
        <input 
          type="checkbox" 
          :checked="activeSet.has(def.key)"
          @change="handleToggle(def.key, $event)"
        >
        <span>{{ def.displayName }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.av-toggle-pane {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.av-toggle-pane h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #333;
  font-weight: 600;
}

.toggles-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  padding: 4px 6px;
  border-radius: 4px;
}

.toggle-item:hover {
  background-color: #f0f0f0;
}

.toggle-item input[type="checkbox"] {
  margin: 0;
  cursor: pointer;
}

.toggle-item span {
  color: #555;
  font-size: 13px;
  user-select: none;
}

.toggle-item input[type="checkbox"]:checked + span {
  color: #333;
  font-weight: 500;
}
</style>
