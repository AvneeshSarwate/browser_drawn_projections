<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { CanvasSnapshot } from './canvasState'

interface Props {
  snapshots: CanvasSnapshot[]
  selectedId: string | null
  onSaveSnapshot: () => string // Returns serialized state
  onRestoreSnapshot: (data: string) => void
  executeCommand: (name: string, action: () => void) => void
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:snapshots', snapshots: CanvasSnapshot[]): void
  (e: 'update:selectedId', id: string | null): void
}>()

const editingId = ref<string | null>(null)
const editingName = ref('')
const editInput = ref<HTMLInputElement | null>(null)

const selectedSnapshot = computed(() =>
  props.snapshots.find(s => s.id === props.selectedId)
)

const generateUUID = () => {
  return crypto.randomUUID()
}

const saveSnapshot = () => {
  const data = props.onSaveSnapshot()
  const id = generateUUID()
  const shortId = id.slice(0, 8)
  const newSnapshot: CanvasSnapshot = {
    id,
    name: shortId,
    data
  }
  emit('update:snapshots', [...props.snapshots, newSnapshot])
  emit('update:selectedId', id)
}

const restoreSnapshot = () => {
  if (!selectedSnapshot.value) return
  const snapshotData = selectedSnapshot.value.data
  props.executeCommand('Restore Snapshot', () => {
    props.onRestoreSnapshot(snapshotData)
  })
}

const selectSnapshot = (id: string) => {
  emit('update:selectedId', id)
}

const startEditing = (snapshot: CanvasSnapshot) => {
  editingId.value = snapshot.id
  editingName.value = snapshot.name
  nextTick(() => {
    editInput.value?.focus()
    editInput.value?.select()
  })
}

const finishEditing = () => {
  if (!editingId.value) return
  const trimmedName = editingName.value.trim()
  if (trimmedName) {
    const updated = props.snapshots.map(s =>
      s.id === editingId.value ? { ...s, name: trimmedName } : s
    )
    emit('update:snapshots', updated)
  }
  editingId.value = null
  editingName.value = ''
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    finishEditing()
  } else if (e.key === 'Escape') {
    editingId.value = null
    editingName.value = ''
  }
}

const deleteSnapshot = (id: string) => {
  const updated = props.snapshots.filter(s => s.id !== id)
  emit('update:snapshots', updated)
  if (props.selectedId === id) {
    emit('update:selectedId', null)
  }
}
</script>

<template>
  <div class="snapshots-panel">
    <div class="panel-header">
      <span class="panel-title">Snapshots</span>
      <div class="header-buttons">
        <button @click="saveSnapshot" class="panel-btn save-btn" title="Save current state as snapshot">
          Save
        </button>
        <button
          @click="restoreSnapshot"
          :disabled="!selectedSnapshot"
          class="panel-btn restore-btn"
          title="Restore selected snapshot"
        >
          Restore
        </button>
      </div>
    </div>

    <div class="snapshots-list" v-if="snapshots.length > 0">
      <div
        v-for="snapshot in snapshots"
        :key="snapshot.id"
        :class="['snapshot-row', { selected: snapshot.id === selectedId }]"
        @click="selectSnapshot(snapshot.id)"
        @dblclick="startEditing(snapshot)"
      >
        <template v-if="editingId === snapshot.id">
          <input
            ref="editInput"
            v-model="editingName"
            class="name-input"
            @blur="finishEditing"
            @keydown="handleKeydown"
            @click.stop
          />
        </template>
        <template v-else>
          <span class="snapshot-name">{{ snapshot.name }}</span>
          <button
            class="delete-btn"
            @click.stop="deleteSnapshot(snapshot.id)"
            title="Delete snapshot"
          >
            x
          </button>
        </template>
      </div>
    </div>

    <div v-else class="empty-state">
      No snapshots yet
    </div>
  </div>
</template>

<style scoped>
.snapshots-panel {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px;
  font-size: 13px;
  width: 280px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #eee;
}

.panel-title {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.header-buttons {
  display: flex;
  gap: 4px;
}

.panel-btn {
  border: 1px solid;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-weight: 500;
}

.panel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-btn {
  background: #28a745;
  color: white;
  border-color: #28a745;
}

.save-btn:hover:not(:disabled) {
  background: #218838;
}

.restore-btn {
  background: #f0f0f0;
  border-color: #ccc;
  color: #333;
}

.restore-btn:hover:not(:disabled) {
  background: #e0e0e0;
  border-color: #999;
}

.snapshots-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
}

.snapshot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
  transition: background-color 0.1s;
}

.snapshot-row:last-child {
  border-bottom: none;
}

.snapshot-row:hover {
  background-color: #f8f9fa;
}

.snapshot-row.selected {
  background-color: #e8f0fe;
  border-left: 2px solid #0066ff;
}

.snapshot-name {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  color: #333;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name-input {
  flex: 1;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  padding: 2px 4px;
  border: 1px solid #0066ff;
  border-radius: 2px;
  outline: none;
}

.delete-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 0 4px;
  font-size: 14px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.snapshot-row:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #dc3545;
}

.empty-state {
  text-align: center;
  color: #999;
  padding: 16px 8px;
  font-style: italic;
  font-size: 12px;
}
</style>
