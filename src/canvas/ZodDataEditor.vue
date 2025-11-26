<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ZodBoolean, ZodEnum, ZodNumber, ZodObject, ZodString } from 'zod'
import type { ZodIssue, ZodRawShape, ZodTypeAny } from 'zod'

interface Props {
  schema: ZodTypeAny
  modelValue: any
  disabled?: boolean
}

type SupportedKind = 'string' | 'number' | 'enum' | 'boolean' | 'object'

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()

const normalizedSchema = computed(() => unwrapSchema(props.schema))
const schemaKind = computed<SupportedKind | 'unsupported'>(() => getKind(normalizedSchema.value))
const issues = ref<string[]>([])

const stringValue = ref('')
const numberText = ref('')
const enumValue = ref<string | undefined>(undefined)
const booleanValue = ref<boolean | undefined>(undefined)
const objectState = ref<Record<string, any>>({})

const enumOptions = computed<string[]>(() => enumOptionsFor(normalizedSchema.value))

watch(
  () => props.modelValue,
  (val) => {
    syncFromModel(val)
  },
  { immediate: true, deep: true }
)

watch([schemaKind, normalizedSchema], () => {
  syncFromModel(props.modelValue)
})

function syncFromModel(val: any) {
  issues.value = []
  switch (schemaKind.value) {
    case 'string':
      stringValue.value = typeof val === 'string' ? val : ''
      break
    case 'number':
      numberText.value = typeof val === 'number' ? `${val}` : typeof val === 'string' ? val : ''
      break
    case 'enum':
      enumValue.value = typeof val === 'string' ? val : undefined
      break
    case 'boolean':
      booleanValue.value = typeof val === 'boolean' ? val : undefined
      break
    case 'object':
      objectState.value = buildObjectState(val)
      break
    default:
      break
  }
}

const isOptionalSchema = computed(() => isOptional(props.schema))

const hasIssues = computed(() => issues.value.length > 0)

const objectFields = computed(() => {
  if (!(normalizedSchema.value instanceof ZodObject)) return []
  const shape = normalizedSchema.value.shape as ZodRawShape
  return Object.entries(shape)
    .filter(([, schema]) => getKind(unwrapSchema(schema as ZodTypeAny)) !== 'unsupported')
    .map(([key, schema]) => ({
      key,
      schema: schema as ZodTypeAny,
      kind: getKind(unwrapSchema(schema as ZodTypeAny)) as SupportedKind
    }))
})

const updateString = (val: string) => {
  stringValue.value = val
  validateAndEmit(val)
}

const updateNumber = (val: string) => {
  numberText.value = val
  const trimmed = val.trim()
  if (!trimmed) {
    validateAndEmit(undefined)
    return
  }
  const asNumber = Number(trimmed)
  const candidate = Number.isFinite(asNumber) ? asNumber : val
  validateAndEmit(candidate)
}

const updateEnum = (val: string) => {
  enumValue.value = val || undefined
  validateAndEmit(val || undefined)
}

const updateBoolean = (val: boolean) => {
  booleanValue.value = val
  validateAndEmit(val)
}

const clearBoolean = () => {
  booleanValue.value = undefined
  validateAndEmit(undefined)
}

const clearValue = () => {
  switch (schemaKind.value) {
    case 'string':
      stringValue.value = ''
      validateAndEmit(undefined)
      break
    case 'number':
      numberText.value = ''
      validateAndEmit(undefined)
      break
    case 'enum':
      enumValue.value = undefined
      validateAndEmit(undefined)
      break
    case 'boolean':
      clearBoolean()
      break
    case 'object':
      objectState.value = buildObjectState(undefined)
      issues.value = []
      emit('update:modelValue', undefined)
      break
  }
}

const updateObjectField = (key: string, rawVal: any) => {
  objectState.value = { ...objectState.value, [key]: rawVal }
  validateObject()
}

function validateObject() {
  if (!(normalizedSchema.value instanceof ZodObject)) return
  const candidate = buildObjectCandidate()
  const result = props.schema.safeParse(candidate)
  issues.value = result.success ? [] : result.error.issues.map(formatIssue)
  emit('update:modelValue', result.success ? result.data : candidate)
}

function validateAndEmit(value: any) {
  const result = props.schema.safeParse(value)
  issues.value = result.success ? [] : result.error.issues.map(formatIssue)
  emit('update:modelValue', result.success ? result.data : value)
}

function buildObjectState(val: any) {
  if (!(normalizedSchema.value instanceof ZodObject)) return {}
  const shape = normalizedSchema.value.shape as ZodRawShape
  const initial: Record<string, any> = {}
  Object.entries(shape).forEach(([key, schema]) => {
    const base = unwrapSchema(schema as ZodTypeAny)
    const kind = getKind(base)
    const fieldVal = val?.[key]
    if (kind === 'string') {
      initial[key] = typeof fieldVal === 'string' ? fieldVal : ''
    } else if (kind === 'number') {
      initial[key] =
        typeof fieldVal === 'number'
          ? `${fieldVal}`
          : typeof fieldVal === 'string'
            ? fieldVal
            : ''
    } else if (kind === 'enum') {
      initial[key] = typeof fieldVal === 'string' ? fieldVal : ''
    } else if (kind === 'boolean') {
      initial[key] = typeof fieldVal === 'boolean' ? fieldVal : undefined
    }
  })
  return initial
}

function buildObjectCandidate() {
  if (!(normalizedSchema.value instanceof ZodObject)) return {}
  const shape = normalizedSchema.value.shape as ZodRawShape
  const candidate: Record<string, any> = {}
  Object.entries(shape).forEach(([key, schema]) => {
    const base = unwrapSchema(schema as ZodTypeAny)
    const kind = getKind(base)
    const rawVal = objectState.value[key]
    if (kind === 'string') {
      if (rawVal !== undefined) candidate[key] = rawVal
    } else if (kind === 'number') {
      if (rawVal === '' || rawVal === undefined) return
      if (typeof rawVal === 'number') {
        candidate[key] = rawVal
        return
      }
      const asNumber = Number(rawVal)
      candidate[key] = Number.isFinite(asNumber) ? asNumber : rawVal
    } else if (kind === 'enum') {
      if (rawVal !== undefined && rawVal !== '') candidate[key] = rawVal
    } else if (kind === 'boolean') {
      if (rawVal !== undefined) candidate[key] = !!rawVal
    }
  })
  return candidate
}

function unwrapSchema(schema: ZodTypeAny): ZodTypeAny {
  const type = schema._def?.type
  if (type === 'optional' || type === 'nullable' || type === 'default' || type === 'readonly' || type === 'catch') {
    const inner = (schema as any)._def?.innerType
    return inner ? unwrapSchema(inner) : schema
  }
  if (type === 'pipe') {
    const out = (schema as any)._def?.out ?? (schema as any)._def?.innerType ?? (schema as any)._def?.schema
    return out ? unwrapSchema(out) : schema
  }
  return schema
}

function isOptional(schema: ZodTypeAny): boolean {
  const type = schema._def?.type
  if (type === 'optional' || type === 'nullable') return true
  if (type === 'default' || type === 'readonly' || type === 'catch') {
    const inner = (schema as any)._def?.innerType
    return inner ? isOptional(inner) : false
  }
  if (type === 'pipe') {
    const out = (schema as any)._def?.out ?? (schema as any)._def?.innerType ?? (schema as any)._def?.schema
    return out ? isOptional(out) : false
  }
  return false
}

function getKind(schema: ZodTypeAny): SupportedKind | 'unsupported' {
  const type = schema._def?.type
  if (type === 'string') return 'string'
  if (type === 'number') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'enum') return 'enum'
  if (type === 'object') return 'object'
  return 'unsupported'
}

function enumOptionsFor(schema: ZodTypeAny): string[] {
  const base = unwrapSchema(schema)
  if (getKind(base) !== 'enum') return []
  const entries = (base as any)._def?.entries ?? (base as any)._def?.values ?? []
  const raw = Array.isArray(entries) ? entries : Object.values(entries)
  return raw.filter((v: unknown): v is string => typeof v === 'string')
}

function formatIssue(issue: ZodIssue) {
  const path = issue.path.map((segment) => segment?.toString?.() ?? String(segment)).join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}
</script>

<template>
  <div class="zod-editor">
    <template v-if="schemaKind === 'string'">
      <div class="field-row">
        <input
          class="input"
          type="text"
          :value="stringValue"
          :disabled="disabled"
          @input="updateString(($event.target as HTMLInputElement).value)"
        />
        <button class="tiny-btn" type="button" :disabled="disabled || (!isOptionalSchema && stringValue === '')" @click="clearValue">
          Clear
        </button>
      </div>
    </template>

    <template v-else-if="schemaKind === 'number'">
      <div class="field-row">
        <input
          class="input"
          type="text"
          :value="numberText"
          :disabled="disabled"
          inputmode="decimal"
          @input="updateNumber(($event.target as HTMLInputElement).value)"
        />
        <button class="tiny-btn" type="button" :disabled="disabled || (!isOptionalSchema && numberText === '')" @click="clearValue">
          Clear
        </button>
      </div>
    </template>

    <template v-else-if="schemaKind === 'enum'">
      <div class="field-row">
        <select
          class="input"
          :value="enumValue ?? ''"
          :disabled="disabled"
          @change="updateEnum(($event.target as HTMLSelectElement).value)"
        >
          <option value="">-- select --</option>
          <option v-for="opt in enumOptions" :key="opt" :value="opt">
            {{ opt }}
          </option>
        </select>
        <button class="tiny-btn" type="button" :disabled="disabled || !isOptionalSchema" @click="clearValue">
          Clear
        </button>
      </div>
    </template>

    <template v-else-if="schemaKind === 'boolean'">
      <div class="field-row boolean-row">
        <label class="checkbox">
          <input
            type="checkbox"
            :checked="!!booleanValue"
            :disabled="disabled"
            @change="updateBoolean(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ booleanValue === undefined ? 'Unset' : booleanValue ? 'True' : 'False' }}</span>
        </label>
        <button class="tiny-btn" type="button" :disabled="disabled || !isOptionalSchema" @click="clearBoolean">
          Clear
        </button>
      </div>
    </template>

    <template v-else-if="schemaKind === 'object'">
      <div class="object-grid">
        <div v-for="field in objectFields" :key="field.key" class="object-row">
          <label class="field-label">{{ field.key }}</label>
          <template v-if="field.kind === 'string'">
            <input
              class="input"
              type="text"
              :value="objectState[field.key] ?? ''"
              :disabled="disabled"
              @input="updateObjectField(field.key, ($event.target as HTMLInputElement).value)"
            />
          </template>
          <template v-else-if="field.kind === 'number'">
            <input
              class="input"
              type="text"
              :value="objectState[field.key] ?? ''"
              :disabled="disabled"
              inputmode="decimal"
              @input="updateObjectField(field.key, ($event.target as HTMLInputElement).value)"
            />
          </template>
          <template v-else-if="field.kind === 'enum'">
            <select
              class="input"
              :value="objectState[field.key] ?? ''"
              :disabled="disabled"
              @change="updateObjectField(field.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">-- select --</option>
              <option v-for="opt in enumOptionsFor(field.schema)" :key="opt" :value="opt">
                {{ opt }}
              </option>
            </select>
          </template>
          <template v-else-if="field.kind === 'boolean'">
            <label class="checkbox">
              <input
                type="checkbox"
                :checked="!!objectState[field.key]"
                :disabled="disabled"
                @change="updateObjectField(field.key, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ objectState[field.key] === undefined ? 'Unset' : objectState[field.key] ? 'True' : 'False' }}</span>
            </label>
            <button
              class="tiny-btn"
              type="button"
              :disabled="disabled || !isOptional(field.schema)"
              @click="updateObjectField(field.key, undefined)"
            >
              Clear
            </button>
          </template>
        </div>
      </div>
      <div class="field-row">
        <button class="tiny-btn" type="button" :disabled="disabled || (!isOptionalSchema && !Object.keys(objectState).length)" @click="clearValue">
          Clear object
        </button>
      </div>
    </template>

    <template v-else>
      <p class="unsupported">Unsupported schema type for this editor.</p>
    </template>

    <div v-if="hasIssues" class="issues">
      <div v-for="issue in issues" :key="issue">⚠ {{ issue }}</div>
    </div>
  </div>
</template>

<style scoped>
.zod-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.object-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid #e5e5e5;
  padding: 6px;
  border-radius: 4px;
  background: #fafafa;
}

.object-row {
  display: grid;
  grid-template-columns: 90px 1fr auto;
  align-items: center;
  gap: 6px;
}

.field-label {
  font-weight: 600;
  color: #444;
}

.input {
  flex: 1;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 13px;
}

.input:disabled {
  background: #f5f5f5;
  color: #777;
}

.tiny-btn {
  padding: 4px 6px;
  border: 1px solid #bbb;
  border-radius: 4px;
  background: #f7f7f7;
  font-size: 12px;
  cursor: pointer;
}

.tiny-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.issues {
  color: #c0392b;
  font-size: 12px;
  border-left: 3px solid #c0392b;
  padding-left: 8px;
}

.boolean-row {
  justify-content: space-between;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #333;
}

.unsupported {
  margin: 0;
  color: #c0392b;
  font-weight: 600;
}
</style>
