<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ZodIssue, ZodTypeAny } from 'zod'
import ZodDataEditor from './ZodDataEditor.vue'

interface SchemaOption {
  name: string
  schema: ZodTypeAny
}

interface Props {
  metadata: Record<string, any> | null | undefined
  visible: boolean
  canEdit: boolean
  schemaOptions?: SchemaOption[]
}

const props = withDefaults(defineProps<Props>(), {
  schemaOptions: () => []
})

const DEBUG_METADATA = typeof window !== 'undefined' && (window as any).__DEBUG_METADATA__ === true
const debugLog = (...args: any[]) => {
  if (DEBUG_METADATA) console.log('[MetadataEditor]', ...args)
}

const emit = defineEmits<{
  apply: [metadata: any]
  cancel: []
}>()

const metadataText = ref('')
const originalMetadataText = ref('')
const metadataParseError = ref<string | null>(null)
const schemaValidationMessages = ref<Record<string, string | null>>({})
const lastValidMetadata = ref<Record<string, any>>({})
const activeEditor = ref<string>('raw')
const selectionError = ref<string | null>(null)

const normalizedSchemaOptions = computed(() => props.schemaOptions ?? [])
const schemaNameSet = computed(() => new Set(normalizedSchemaOptions.value.map((opt) => opt.name)))

const hasUnsavedChanges = computed(() => metadataText.value !== originalMetadataText.value)
const schemaErrorsList = computed(() =>
  Object.entries(schemaValidationMessages.value).filter(([, message]) => !!message)
)
const hasSchemaValidationErrors = computed(() => schemaErrorsList.value.length > 0)
const currentSchema = computed(() =>
  normalizedSchemaOptions.value.find((opt) => opt.name === activeEditor.value)
)
const activeSchemaName = computed(() => currentSchema.value?.name ?? '')
const currentSchemaValue = computed(() =>
  currentSchema.value ? lastValidMetadata.value?.[currentSchema.value.name] : undefined
)
const canUseSchemaEditors = computed(() => !metadataParseError.value)
const canSave = computed(
  () =>
    props.canEdit &&
    hasUnsavedChanges.value &&
    !metadataParseError.value &&
    !hasSchemaValidationErrors.value
)

function formatIssue(issue: ZodIssue): string {
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

function runSchemaValidations(metadata: Record<string, any>) {
  const next: Record<string, string | null> = {}
  normalizedSchemaOptions.value.forEach(({ name, schema }) => {
    if (!Object.prototype.hasOwnProperty.call(metadata, name)) {
      next[name] = null
      return
    }
    const result = schema.safeParse(metadata[name])
    next[name] = result.success ? null : result.error.issues.map(formatIssue).join('; ')
  })
  schemaValidationMessages.value = next
}

watch(
  [() => props.metadata, () => props.canEdit],
  ([metadata, canEdit]) => {
    debugLog('props changed', { canEdit, metadata, activeEditor: activeEditor.value })
    if (canEdit) {
      const jsonText = JSON.stringify(metadata ?? {}, null, 2)
      metadataText.value = jsonText
      originalMetadataText.value = jsonText
      metadataParseError.value = null
      lastValidMetadata.value = metadata ?? {}
      runSchemaValidations(lastValidMetadata.value)
      selectionError.value = null
      if (!schemaNameSet.value.has(activeEditor.value)) {
        activeEditor.value = normalizedSchemaOptions.value[0]?.name ?? 'raw'
      }
    } else {
      metadataText.value = ''
      originalMetadataText.value = ''
      metadataParseError.value = null
      lastValidMetadata.value = {}
      schemaValidationMessages.value = {}
      selectionError.value = null
      activeEditor.value = 'raw'
    }
  },
  { immediate: true, deep: true }
)

watch(
  metadataText,
  (text) => {
    if (!props.canEdit) return
    try {
      const parsed = JSON.parse(text && text.trim() ? text : '{}')
      metadataParseError.value = null
      selectionError.value = null
      lastValidMetadata.value = parsed ?? {}
      runSchemaValidations(parsed ?? {})
    } catch (err) {
      metadataParseError.value = err instanceof Error ? err.message : 'Invalid JSON'
      schemaValidationMessages.value = {}
    }
  },
  { immediate: true }
)

const onEditorChange = (value: string) => {
  if (value !== 'raw' && !canUseSchemaEditors.value) {
    selectionError.value = 'Fix the JSON to use structured editors.'
    activeEditor.value = 'raw'
    return
  }
  selectionError.value = null
  if (value === 'raw') {
    activeEditor.value = 'raw'
    return
  }
  activeEditor.value = schemaNameSet.value.has(value) ? value : 'raw'
}

const updateSchemaValue = (schemaName: string, value: any) => {
  if (!canUseSchemaEditors.value) {
    selectionError.value = 'Fix the JSON to use structured editors.'
    activeEditor.value = 'raw'
    return
  }
  const base = lastValidMetadata.value ?? {}
  const next = JSON.parse(JSON.stringify(base ?? {}))
  if (value === undefined) {
    delete next[schemaName]
  } else {
    next[schemaName] = value
  }
  metadataText.value = JSON.stringify(next, null, 2)
}

const applyMetadata = () => {
  if (!props.canEdit || metadataParseError.value) return
  try {
    const parsed = JSON.parse(metadataText.value && metadataText.value.trim() ? metadataText.value : '{}')
    runSchemaValidations(parsed ?? {})
    if (Object.values(schemaValidationMessages.value).some((message) => !!message)) return
    emit('apply', parsed)
    originalMetadataText.value = metadataText.value
  } catch (e) {
    metadataParseError.value = 'Invalid JSON format'
  }
}

const cancelEdit = () => {
  metadataText.value = originalMetadataText.value
  metadataParseError.value = null
  selectionError.value = null
  const parsed = JSON.parse(originalMetadataText.value && originalMetadataText.value.trim() ? originalMetadataText.value : '{}')
  lastValidMetadata.value = parsed ?? {}
  runSchemaValidations(parsed ?? {})
}
</script>

<template>
  <div v-if="visible" class="metadata-editor">
    <div class="header">
      <div class="mode-switcher">
        <label class="mode-label">Editor</label>
        <select
          class="mode-select"
          :value="activeEditor"
          :disabled="!canEdit"
          @change="onEditorChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in normalizedSchemaOptions" :key="option.name" :value="option.name">
            {{ option.name }}
          </option>
          <option value="raw">Raw JSON</option>
        </select>
      </div>
      <div class="status">
        <div v-if="hasUnsavedChanges" class="unsaved-indicator">
          <span class="dot"></span>
          Unsaved
        </div>
        <div v-if="metadataParseError" class="pill error">Invalid JSON</div>
        <div v-else-if="hasSchemaValidationErrors" class="pill warn">Schema issues</div>
      </div>
    </div>
    <p v-if="selectionError" class="inline-error">{{ selectionError }}</p>

    <div v-if="canEdit" class="body">
      <template v-if="activeEditor === 'raw'">
        <p class="help">Edit the metadata as JSON:</p>
        <textarea v-model="metadataText" class="textarea" placeholder="{}"></textarea>
        <p v-if="metadataParseError" class="inline-error">{{ metadataParseError }}</p>
        <div v-if="schemaErrorsList.length" class="inline-error">
          <div v-for="[key, message] in schemaErrorsList" :key="key">
            {{ key }}: {{ message }}
          </div>
        </div>
      </template>

      <template v-else-if="currentSchema">
        <div class="schema-header">
          <div class="schema-title">
            <span class="key-label">Key</span>
            <code>{{ activeSchemaName }}</code>
          </div>
          <span class="schema-note">Stored on the top-level metadata object</span>
        </div>
        <ZodDataEditor
          :schema="currentSchema.schema"
          :model-value="currentSchemaValue"
          :disabled="!canEdit"
          @update:model-value="(val) => updateSchemaValue(activeSchemaName, val)"
        />
        <p v-if="schemaValidationMessages[activeSchemaName]" class="inline-error">
          {{ schemaValidationMessages[activeSchemaName] }}
        </p>
      </template>
    </div>

    <div v-else class="warning">
      <p>Select multiple items to edit metadata (single selection only)</p>
    </div>

    <div v-if="canEdit" class="buttons">
      <button @click="applyMetadata" class="btn save" :disabled="!canSave">
        Save
      </button>
      <button @click="cancelEdit" class="btn cancel" :disabled="!hasUnsavedChanges">
        Cancel
      </button>
    </div>
  </div>
</template>

<style scoped>
.metadata-editor {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px 14px;
  margin-top: 8px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  max-width: 720px;
  font-size: 14px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.mode-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-label {
  font-weight: 600;
  color: #333;
}

.mode-select {
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 13px;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.unsaved-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #f39c12;
  font-weight: 600;
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

.pill {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.pill.error {
  background: #fdecea;
  color: #c0392b;
  border: 1px solid #e6b8b4;
}

.pill.warn {
  background: #fff4e5;
  color: #d35400;
  border: 1px solid #f0cba8;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.help {
  margin: 0;
  color: #555;
  font-size: 13px;
}

.textarea {
  width: 100%;
  min-height: 140px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.35;
  resize: vertical;
}

.textarea:focus {
  outline: none;
  border-color: #0066ff;
  box-shadow: 0 0 0 2px rgba(0,102,255,0.12);
}

.schema-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.schema-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: #333;
}

.key-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #777;
}

.schema-note {
  font-size: 12px;
  color: #666;
}

.inline-error {
  margin: 0;
  color: #c0392b;
  font-size: 12px;
}

.buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  padding: 5px 12px;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
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
