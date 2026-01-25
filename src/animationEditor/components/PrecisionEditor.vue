<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TrackType, PrecisionDraft, FuncArg, EditorAction } from '../types'
import { PRECISION_MODAL_WIDTH } from '../constants'

const props = defineProps<{
  open: boolean
  fieldType: TrackType
  trackName: string
  saved: PrecisionDraft
  draft: PrecisionDraft
  dirty: boolean
  enumOptions: string[]
}>()

const emit = defineEmits<{
  action: [action: EditorAction]
}>()

// Local draft for immediate UI updates
const localDraft = ref<PrecisionDraft>({ ...props.draft })

watch(() => props.draft, (newDraft) => {
  localDraft.value = { ...newDraft }
}, { deep: true })

function updateDraft(changes: Partial<PrecisionDraft>) {
  Object.assign(localDraft.value, changes)
  emit('action', { type: 'PRECISION/CHANGE_DRAFT', draft: changes })
}

function save() {
  emit('action', { type: 'PRECISION/SAVE' })
}

function revert() {
  emit('action', { type: 'PRECISION/REVERT' })
}

function close() {
  emit('action', { type: 'PRECISION/CLOSE' })
}

function onTimeChange(e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value) && value >= 0) {
    updateDraft({ time: value })
  }
}

function onValueChange(e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value)) {
    updateDraft({ value })
  }
}

function onEnumChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  updateDraft({ enumValue: value })
}

function onFuncNameChange(e: Event) {
  const value = (e.target as HTMLInputElement).value
  updateDraft({ funcName: value })
}

// Func args handling
const funcArgs = computed(() => localDraft.value.funcArgs || [])

function addArg() {
  const newArgs = [...funcArgs.value, { type: 'text' as const, value: '' }]
  updateDraft({ funcArgs: newArgs })
}

function removeArg(index: number) {
  const newArgs = funcArgs.value.filter((_, i) => i !== index)
  updateDraft({ funcArgs: newArgs })
}

function updateArgType(index: number, type: 'text' | 'number') {
  const newArgs = [...funcArgs.value]
  newArgs[index] = { ...newArgs[index], type }
  updateDraft({ funcArgs: newArgs })
}

function updateArgValue(index: number, value: string) {
  const newArgs = [...funcArgs.value]
  newArgs[index] = { ...newArgs[index], value }
  updateDraft({ funcArgs: newArgs })
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click="handleBackdropClick">
      <div class="modal">
        <div class="modal-header">
          <div class="header-content">
            <span class="header-title">Edit Element</span>
            <span class="track-badge">{{ trackName }}</span>
          </div>
          <button class="close-btn" @click="close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- Time (all types) -->
          <div class="field-row">
            <label>Time</label>
            <input
              type="number"
              :value="localDraft.time"
              step="0.1"
              min="0"
              @change="onTimeChange"
              class="input"
            />
          </div>

          <!-- Number value -->
          <template v-if="fieldType === 'number'">
            <div class="field-row">
              <label>Value</label>
              <input
                type="number"
                :value="localDraft.value"
                step="0.01"
                @change="onValueChange"
                class="input"
              />
            </div>
          </template>

          <!-- Enum value -->
          <template v-if="fieldType === 'enum'">
            <div class="field-row">
              <label>Value</label>
              <select
                :value="localDraft.enumValue"
                @change="onEnumChange"
                class="input select"
              >
                <option v-for="opt in enumOptions" :key="opt" :value="opt">
                  {{ opt }}
                </option>
              </select>
            </div>
          </template>

          <!-- Func name and args -->
          <template v-if="fieldType === 'func'">
            <div class="field-row">
              <label>Function</label>
              <input
                type="text"
                :value="localDraft.funcName"
                @input="onFuncNameChange"
                class="input"
                placeholder="functionName"
              />
            </div>

            <div class="args-section">
              <div class="args-header">
                <span class="args-label">Arguments</span>
                <button v-if="funcArgs.length < 5" class="add-arg-btn" @click="addArg">
                  + Add
                </button>
              </div>
              <div class="args-list" v-if="funcArgs.length > 0">
                <div v-for="(arg, index) in funcArgs" :key="index" class="arg-row">
                  <select
                    :value="arg.type"
                    @change="(e) => updateArgType(index, (e.target as HTMLSelectElement).value as 'text' | 'number')"
                    class="arg-type"
                  >
                    <option value="text">Text</option>
                    <option value="number">Num</option>
                  </select>
                  <input
                    type="text"
                    :value="arg.value"
                    @input="(e) => updateArgValue(index, (e.target as HTMLInputElement).value)"
                    class="arg-value"
                    :placeholder="arg.type === 'number' ? '0' : 'value'"
                  />
                  <button class="remove-arg-btn" @click="removeArg(index)">×</button>
                </div>
              </div>
              <div v-else class="no-args">No arguments</div>
            </div>
          </template>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="revert" :disabled="!dirty">
            Revert
          </button>
          <button class="btn btn-primary" @click="save">
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  width: v-bind('PRECISION_MODAL_WIDTH + "px"');
  background: #1a1c20;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 1px solid #2a2d30;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2d30;
}

.header-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-title {
  font-size: 13px;
  font-weight: 500;
  color: #e0e0e0;
}

.track-badge {
  font-size: 11px;
  color: #888;
  background: #252830;
  padding: 2px 8px;
  border-radius: 3px;
}

.close-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: #2a2d30;
  color: #c8c8c8;
}

.modal-body {
  padding: 12px 16px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.field-row label {
  flex-shrink: 0;
  width: 60px;
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input {
  flex: 1;
  padding: 6px 10px;
  background: #141618;
  border: 1px solid #2a2d30;
  border-radius: 4px;
  color: #c8c8c8;
  font-size: 13px;
  transition: border-color 0.15s ease;
}

.input:focus {
  outline: none;
  border-color: #3a7ca5;
}

.input.select {
  cursor: pointer;
}

.args-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #2a2d30;
}

.args-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.args-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.add-arg-btn {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid #2a2d30;
  border-radius: 3px;
  color: #888;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-arg-btn:hover {
  background: #252830;
  color: #c8c8c8;
  border-color: #3a3d42;
}

.args-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.arg-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.arg-type {
  width: 70px;
  padding: 5px 6px;
  background: #141618;
  border: 1px solid #2a2d30;
  border-radius: 3px;
  color: #c8c8c8;
  font-size: 11px;
  cursor: pointer;
}

.arg-value {
  flex: 1;
  padding: 5px 8px;
  background: #141618;
  border: 1px solid #2a2d30;
  border-radius: 3px;
  color: #c8c8c8;
  font-size: 12px;
}

.arg-value:focus,
.arg-type:focus {
  outline: none;
  border-color: #3a7ca5;
}

.remove-arg-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: none;
  color: #555;
  font-size: 14px;
  cursor: pointer;
  border-radius: 3px;
  transition: all 0.15s ease;
}

.remove-arg-btn:hover {
  background: #dc2626;
  color: #fff;
}

.no-args {
  font-size: 11px;
  color: #555;
  text-align: center;
  padding: 8px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #2a2d30;
}

.btn {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
}

.btn-secondary {
  background: #252830;
  color: #b0b0b0;
}

.btn-secondary:hover:not(:disabled) {
  background: #2d3038;
  color: #e0e0e0;
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: #3a7ca5;
  color: #fff;
}

.btn-primary:hover {
  background: #4a8cb5;
}
</style>
