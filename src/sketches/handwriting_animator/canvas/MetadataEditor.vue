<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type Konva from 'konva'

interface Props {
  activeNode: Konva.Node | null
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  apply: [metadata: any]
  cancel: []
}>()

const metadataText = ref('')
const originalMetadataText = ref('')

const hasUnsavedChanges = computed(() => {
  return metadataText.value !== originalMetadataText.value
})

watch(() => props.activeNode, (node) => {
  if (node) {
    const metadata = node.getAttr('metadata') ?? {}
    const jsonText = JSON.stringify(metadata, null, 2)
    metadataText.value = jsonText
    originalMetadataText.value = jsonText
  } else {
    metadataText.value = ''
    originalMetadataText.value = ''
  }
}, { immediate: true })

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
    
    <div v-if="activeNode">
      <p class="help">Edit the metadata as JSON:</p>
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
      <p>Select multiple items to edit metadata (single selection only)</p>
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
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  max-width: 700px;
  font-size: 15px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.header h3 {
  margin: 0;
  font-size: 17px;
  color: #333;
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
  box-shadow: 0 0 0 2px rgba(0,102,255,0.15);
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

.warning p {
  margin: 0;
  font-size: 15px;
}
</style>
