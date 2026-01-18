<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface Props {
  metadata: Record<string, any> | null | undefined
  visible: boolean
  canEdit: boolean
  helpText?: string
  emptyText?: string
  showRooted?: boolean
  rootedValue?: boolean | null
  canEditRooted?: boolean
  rootedLabel?: string
  rootedMixedText?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  apply: [metadata: any]
  cancel: []
  setRooted: [value: boolean]
}>()

const metadataText = ref('')
const originalMetadataText = ref('')

const hasUnsavedChanges = computed(() => {
  return metadataText.value !== originalMetadataText.value
})

watch(
  () => [props.metadata, props.canEdit],
  ([metadata, canEdit]) => {
    if (canEdit) {
      const jsonText = JSON.stringify(metadata ?? {}, null, 2)
      metadataText.value = jsonText
      originalMetadataText.value = jsonText
    } else {
      metadataText.value = ''
      originalMetadataText.value = ''
    }
  },
  { immediate: true, deep: true }
)

const applyMetadata = () => {
  try {
    const obj = JSON.parse(metadataText.value || '{}')
    emit('apply', obj)
    originalMetadataText.value = metadataText.value
  } catch (e) {
    alert('Invalid JSON format')
  }
}

const cancelEdit = () => {
  metadataText.value = originalMetadataText.value
  emit('cancel')
}

const toggleRooted = () => {
  if (!props.canEditRooted) return
  if (props.rootedValue === null) {
    emit('setRooted', true)
    return
  }
  emit('setRooted', !props.rootedValue)
}
</script>

<template>
  <div v-if="visible" class="metadata-editor">
    <div class="header">
      <div v-if="hasUnsavedChanges" class="unsaved-indicator">
        <span class="dot"></span>
        Unsaved changes
      </div>
    </div>

    <div v-if="showRooted" class="rooted-row" :class="{ disabled: !canEditRooted }">
      <span class="rooted-label">{{ rootedLabel ?? 'Rooted' }}</span>
      <button
        type="button"
        class="rooted-toggle"
        :class="{ on: rootedValue === true, mixed: rootedValue === null, off: rootedValue === false }"
        :disabled="!canEditRooted"
        @click="toggleRooted"
      >
        <span class="rooted-icon"></span>
      </button>
      <span v-if="canEditRooted && rootedValue === null" class="rooted-mixed-text">
        {{ rootedMixedText ?? 'multiple values' }}
      </span>
      <span v-else-if="canEditRooted && rootedValue !== null" class="rooted-state-text">
        {{ rootedValue ? 'true' : 'false' }}
      </span>
      <span v-else class="rooted-empty-text">Select MPE points to edit rooted.</span>
    </div>

    <div v-if="canEdit">
      <p class="help">{{ helpText ?? 'Edit the selected note metadata as JSON:' }}</p>
      <textarea
        v-model="metadataText"
        class="textarea"
        placeholder="{}"
      ></textarea>
      <div class="buttons">
        <button @click="applyMetadata" class="btn save" :disabled="!hasUnsavedChanges">
          Save
        </button>
        <button @click="cancelEdit" class="btn cancel" :disabled="!hasUnsavedChanges">
          Cancel
        </button>
      </div>
    </div>

    <div v-else class="warning">
      <p>{{ emptyText ?? 'Select exactly one note to edit its metadata.' }}</p>
    </div>
  </div>
</template>

<style scoped>
.metadata-editor {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 6px 16px;
  margin-top: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  max-width: 700px;
  font-size: 15px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.unsaved-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #f39c12;
  font-weight: 500;
}

.dot {
  width: 6px;
  height: 6px;
  background: #f39c12;
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.help {
  margin: 0 0 4px 0;
  color: #666;
  font-size: 14px;
}

.rooted-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 14px;
}

.rooted-row.disabled {
  opacity: 0.6;
}

.rooted-label {
  font-weight: 600;
  color: #333;
}

.rooted-toggle {
  width: 26px;
  height: 18px;
  border: 1px solid #bbb;
  border-radius: 4px;
  background: #f7f7f7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  position: relative;
}

.rooted-toggle:disabled {
  cursor: not-allowed;
}

.rooted-toggle.on {
  background: #e6f3ff;
  border-color: #6aa8ff;
}

.rooted-toggle.off {
  background: #f7f7f7;
}

.rooted-icon {
  width: 12px;
  height: 12px;
  border: 2px solid #555;
  box-sizing: border-box;
}

.rooted-toggle.on .rooted-icon {
  background: #6aa8ff;
  border-color: #2f6fd8;
}

.rooted-toggle.mixed .rooted-icon {
  position: relative;
}

.rooted-toggle.mixed .rooted-icon::after {
  content: '';
  position: absolute;
  top: 50%;
  left: -2px;
  right: -2px;
  height: 2px;
  background: #555;
  transform: rotate(-20deg);
}

.rooted-mixed-text {
  color: #a05a00;
  font-weight: 600;
}

.rooted-state-text {
  color: #444;
}

.rooted-empty-text {
  color: #888;
  font-size: 13px;
}

.textarea {
  width: 100%;
  min-height: 120px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 14px;
  line-height: 1.3;
  resize: vertical;
  margin-bottom: 4px;
}

.textarea:focus {
  outline: none;
  border-color: #0066ff;
  box-shadow: 0 0 0 2px rgba(0, 102, 255, 0.15);
}

.buttons {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 4px 12px;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save {
  background: #28a745;
  color: white;
  border-color: #28a745;
}

.save:hover:not(:disabled) {
  background: #218838;
}

.cancel {
  background: #6c757d;
  color: white;
  border-color: #6c757d;
}

.cancel:hover:not(:disabled) {
  background: #5a6268;
}

.warning {
  text-align: center;
  color: #e67e22;
  padding: 8px;
}
</style>
