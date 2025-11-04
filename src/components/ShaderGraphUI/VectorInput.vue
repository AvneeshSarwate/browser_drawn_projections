<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ShaderEffect, UniformDescriptor } from '@/rendering/shaderFXBabylon'

const axisLabels = ['x', 'y', 'z', 'w'] as const

const props = defineProps<{
  effect: ShaderEffect
  param: UniformDescriptor
}>()

const componentCount = computed(() => {
  switch (props.param.kind) {
    case 'vec2f':
      return 2
    case 'vec3f':
      return 3
    case 'vec4f':
      return 4
    default:
      return 0
  }
})

const componentLabels = computed(() => axisLabels.slice(0, componentCount.value))
const step = computed(() => props.param.ui?.step ?? 0.01)

const values = ref<number[]>([])
const isDynamic = ref(false)

function normalize(raw: unknown): number[] {
  const count = componentCount.value
  const fallback = props.param.default
  const base = raw ?? fallback
  const result: number[] = []

  if (Array.isArray(base)) {
    for (let i = 0; i < count; i++) {
      result.push(Number(base[i] ?? 0))
    }
    return result
  }

  if (base && typeof base === 'object') {
    if ('toArray' in (base as Record<string, unknown>) && typeof (base as { toArray?: () => number[] }).toArray === 'function') {
      const extracted = (base as { toArray: () => number[] }).toArray()
      for (let i = 0; i < count; i++) {
        result.push(Number(extracted[i] ?? 0))
      }
      return result
    }
    const labeled = base as Record<string, unknown>
    for (const label of componentLabels.value) {
      const value = labeled[label]
      result.push(typeof value === 'number' ? value : 0)
    }
    while (result.length < count) {
      result.push(0)
    }
    return result
  }

  if (typeof base === 'number') {
    return Array(count).fill(base)
  }

  return Array(count).fill(0)
}

function refreshFromEffect(): void {
  const uniforms = (props.effect as any).uniforms ?? {}
  const raw = uniforms[props.param.name]
  if (typeof raw === 'function') {
    isDynamic.value = true
    values.value = normalize(undefined)
    return
  }
  isDynamic.value = false
  values.value = normalize(raw)
}

watch(
  () => [props.effect, props.param, componentCount.value],
  () => {
    refreshFromEffect()
  },
  { immediate: true },
)

function onComponentInput(index: number, event: Event) {
  if (isDynamic.value) {
    return
  }
  const target = event.target as HTMLInputElement
  const numeric = Number(target.value)
  const next = [...values.value]
  next[index] = Number.isFinite(numeric) ? numeric : 0
  values.value = next
  ;(props.effect as any).setUniforms({ [props.param.name]: next.slice(0, componentCount.value) })
}

function onReset() {
  if (isDynamic.value) {
    return
  }
  const defaults = normalize(undefined)
  values.value = defaults
  ;(props.effect as any).setUniforms({ [props.param.name]: defaults.slice(0, componentCount.value) })
}
</script>

<template>
  <div v-if="componentCount" class="vector-input">
    <label class="param-header">
      <span class="param-name">{{ param.name }}</span>
      <div class="param-meta">
        <button
          v-if="param.default !== undefined && !isDynamic"
          type="button"
          class="reset-button"
          @click="onReset"
        >
          Reset
        </button>
        <span v-if="isDynamic" class="dynamic-badge">Dynamic</span>
      </div>
    </label>

    <div class="component-grid" :class="{ dynamic: isDynamic }">
      <label
        v-for="(label, index) in componentLabels"
        :key="label"
        class="component-field"
      >
        <span class="component-label">{{ label }}</span>
        <input
          type="number"
          :value="values[index]"
          :step="step"
          :disabled="isDynamic"
          @input="onComponentInput(index, $event)"
        />
      </label>
    </div>
  </div>
</template>

<style scoped>
.vector-input {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.param-name {
  font-weight: 600;
  font-size: 0.9rem;
  letter-spacing: 0.01em;
}

.param-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.dynamic-badge {
  font-size: 0.65rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: #c27c2c;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.reset-button {
  font-size: 0.65rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.reset-button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.component-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 0.5rem;
}

.component-grid.dynamic {
  opacity: 0.6;
  cursor: not-allowed;
}

.component-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.component-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.6);
}

input[type='number'] {
  width: 100%;
  padding: 0.28rem 0.4rem;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.38);
  color: #f2f2f2;
}

input[type='number']:focus {
  outline: none;
  border-color: rgba(46, 160, 253, 0.8);
  box-shadow: 0 0 0 2px rgba(46, 160, 253, 0.2);
}

input[type='number']:disabled {
  cursor: not-allowed;
}
</style>
