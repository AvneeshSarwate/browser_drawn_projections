<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ShaderEffect, UniformDescriptor } from '@/rendering/shaderFXBabylon'

const props = defineProps<{
  effect: ShaderEffect
  param: UniformDescriptor
}>()

const sliderValue = ref(0)
const textInputValue = ref('0')
let animationFrameId: number | null = null

const runtime = computed(() => {
  if (!props.effect || typeof (props.effect as any).getUniformRuntime !== 'function') {
    return null
  }
  const runtimeMap = (props.effect as any).getUniformRuntime() as Record<string, any>
  return runtimeMap[props.param.name] ?? null
})

const isDynamic = computed(() => runtime.value?.isDynamic ?? false)

const defaultValue = computed(() => (typeof props.param.default === 'number' ? props.param.default : 0))

const currentValue = computed(() => {
  if (runtime.value?.current !== undefined) {
    return runtime.value.current
  }
  return defaultValue.value
})

const min = computed(() => runtime.value?.min ?? props.param.ui?.min)

const max = computed(() => runtime.value?.max ?? props.param.ui?.max)

const sliderBounds = computed(() => {
  const current = currentValue.value
  let minVal = typeof min.value === 'number' ? min.value : undefined
  let maxVal = typeof max.value === 'number' ? max.value : undefined

  const ensureSpan = (base: number | undefined) => {
    const magnitude = Math.max(Math.abs(base ?? current) || 0, 0.5)
    return Math.max(magnitude, 0.5)
  }

  if (minVal === undefined && maxVal === undefined) {
    const span = ensureSpan(current)
    minVal = current - span
    maxVal = current + span
  } else {
    if (minVal === undefined) {
      const span = ensureSpan(maxVal)
      minVal = (typeof current === 'number' ? current : maxVal ?? 0) - span
    }
    if (maxVal === undefined) {
      const span = ensureSpan(minVal)
      maxVal = (typeof current === 'number' ? current : minVal ?? 0) + span
    }
  }

  if (minVal === maxVal) {
    const delta = ensureSpan(minVal) * 0.5
    minVal -= delta
    maxVal += delta
  }

  if (maxVal < minVal) {
    const midpoint = (minVal + maxVal) / 2
    const span = ensureSpan(midpoint)
    minVal = midpoint - span
    maxVal = midpoint + span
  }

  return { min: minVal, max: maxVal }
})

const sliderMin = computed(() => sliderBounds.value.min)
const sliderMax = computed(() => sliderBounds.value.max)
const formattedMin = computed(() => (typeof min.value === 'number' ? min.value.toFixed(2) : null))
const formattedMax = computed(() => (typeof max.value === 'number' ? max.value.toFixed(2) : null))

const step = computed(() => props.param.ui?.step ?? 0.001)

function cancelAnimation() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
}

function updateDynamicSlider() {
  cancelAnimation()
  sliderValue.value = currentValue.value
  animationFrameId = requestAnimationFrame(updateDynamicSlider)
}

onMounted(() => {
  sliderValue.value = currentValue.value
  textInputValue.value = currentValue.value.toString()
  if (isDynamic.value) {
    updateDynamicSlider()
  }
})

onUnmounted(() => {
  cancelAnimation()
})

watch(
  () => props.effect,
  () => {
    cancelAnimation()
    sliderValue.value = currentValue.value
    textInputValue.value = currentValue.value.toString()
    if (isDynamic.value) {
      updateDynamicSlider()
    }
  },
)

watch(currentValue, (value) => {
  if (!isDynamic.value) {
    sliderValue.value = value
    textInputValue.value = value.toString()
  }
})

watch(isDynamic, (dynamic) => {
  if (dynamic) {
    updateDynamicSlider()
  } else {
    cancelAnimation()
    sliderValue.value = currentValue.value
    textInputValue.value = currentValue.value.toString()
  }
})

function onInput(event: Event) {
  if (!props.effect || typeof (props.effect as any).setUniforms !== 'function') {
    return
  }
  if (isDynamic.value) {
    return
  }
  const target = event.target as HTMLInputElement
  const value = Number(target.value)
  applyValue(value, { fromSlider: true })
}

function onTextInput(event: Event) {
  if (isDynamic.value) {
    return
  }
  const target = event.target as HTMLInputElement
  textInputValue.value = target.value
}

function onTextBlur() {
  if (isDynamic.value) {
    return
  }
  const value = Number(textInputValue.value)
  if (Number.isFinite(value)) {
    applyValue(value, { fromSlider: false })
  } else {
    textInputValue.value = sliderValue.value.toString()
  }
}

function onTextKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    (event.target as HTMLInputElement).blur()
  }
}

function applyValue(rawValue: number, options: { fromSlider: boolean }) {
  if (!props.effect || typeof (props.effect as any).setUniforms !== 'function') {
    return
  }
  if (!Number.isFinite(rawValue)) {
    return
  }
  let valueToApply = rawValue
  if (options.fromSlider) {
    const { min: lower, max: upper } = sliderBounds.value
    valueToApply = Math.min(Math.max(valueToApply, lower), upper)
  }
  sliderValue.value = valueToApply
  textInputValue.value = valueToApply.toString()
  ;(props.effect as any).setUniforms({ [props.param.name]: valueToApply })
}
</script>

<template>
  <div class="float-slider" :class="{ dynamic: isDynamic }">
    <div class="param-name">
      {{ param.name }}
      <span v-if="isDynamic" class="dynamic-badge">Dynamic</span>
    </div>

    <div class="controls">
      <input
        type="range"
        :value="sliderValue"
        :min="sliderMin"
        :max="sliderMax"
        :step="step"
        :disabled="isDynamic"
        class="slider"
        :class="{ dynamic: isDynamic }"
        @input="onInput"
      />

      <span v-if="formattedMin || formattedMax" class="range-hint">
        <span class="range-line">[{{ formattedMin ?? '—' }}</span>
        <span class="range-line">{{ formattedMax ?? '—' }}]</span>
      </span>
      <span v-else class="range-hint placeholder"></span>

      <input
        type="number"
        :value="textInputValue"
        :step="step"
        :disabled="isDynamic"
        class="numeric-input"
        @input="onTextInput"
        @blur="onTextBlur"
        @keydown="onTextKeydown"
      />
    </div>
  </div>
</template>

<style scoped>
.float-slider {
  display: grid;
  grid-template-columns: minmax(120px, auto) 1fr;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.3rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.param-name {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.dynamic-badge {
  font-size: 0.6rem;
  padding: 0.05rem 0.25rem;
  background: #c27c2c;
  color: #fff;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

</style>

<style scoped>
.controls {
  display: grid;
  grid-template-columns: 1fr minmax(44px, auto) minmax(68px, auto);
  align-items: center;
  gap: 0.3rem;
}

.range-hint {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 0.58rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.05;
}

.range-hint.placeholder {
  visibility: hidden;
  min-height: calc(2 * 0.58rem);
}

.range-line {
  white-space: nowrap;
}

.slider {
  width: 100%;
  accent-color: #2ea0fd;
}

.float-slider.dynamic .slider {
  opacity: 0.6;
  cursor: not-allowed;
}

.numeric-input {
  width: 4.2ch;
  min-width: 80px;
  padding: 0.16rem 0.22rem;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.4);
  color: #f2f2f2;
  font-size: 0.7rem;
  font-family: inherit;
}

.numeric-input:focus {
  outline: none;
  border-color: rgba(46, 160, 253, 0.8);
  box-shadow: 0 0 0 2px rgba(46, 160, 253, 0.2);
}

.numeric-input:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
</style>
