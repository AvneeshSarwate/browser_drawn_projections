<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ShaderEffect, UniformDescriptor } from '@/rendering/shaderFXBabylon'

const props = defineProps<{
  effect: ShaderEffect
  param: UniformDescriptor
}>()

const sliderValue = ref(0)
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

const min = computed(() => {
  if (isDynamic.value) {
    if (runtime.value?.min !== undefined) {
      return runtime.value.min
    }
  }
  return props.param.ui?.min ?? 0
})

const max = computed(() => {
  if (isDynamic.value) {
    if (runtime.value?.max !== undefined) {
      return runtime.value.max
    }
  }
  return props.param.ui?.max ?? 1
})

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
    if (isDynamic.value) {
      updateDynamicSlider()
    }
  },
)

watch(currentValue, (value) => {
  if (!isDynamic.value) {
    sliderValue.value = value
  }
})

watch(isDynamic, (dynamic) => {
  if (dynamic) {
    updateDynamicSlider()
  } else {
    cancelAnimation()
    sliderValue.value = currentValue.value
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
  sliderValue.value = value
  ;(props.effect as any).setUniforms({ [props.param.name]: value })
}
</script>

<template>
  <div class="float-slider">
    <label>
      <span class="param-name">{{ param.name }}</span>
      <span v-if="isDynamic" class="dynamic-badge">Dynamic</span>
    </label>

    <div class="slider-row">
      <span class="value-label">{{ min.toFixed(3) }}</span>

      <input
        type="range"
        :value="sliderValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="isDynamic"
        class="slider"
        :class="{ dynamic: isDynamic }"
        @input="onInput"
      />

      <span class="value-label">{{ max.toFixed(3) }}</span>
    </div>

    <div class="current-value">{{ currentValue.toFixed(3) }}</div>
  </div>
</template>

<style scoped>
.float-slider {
  margin-bottom: 1rem;
}

label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.param-name {
  font-weight: 600;
}

.dynamic-badge {
  font-size: 0.7rem;
  padding: 0.1rem 0.3rem;
  background: #f90;
  color: white;
  border-radius: 3px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.slider {
  flex: 1;
}

.slider.dynamic {
  opacity: 0.6;
  cursor: not-allowed;
}

.value-label {
  font-size: 0.7rem;
  color: #666;
  min-width: 3.5rem;
  text-align: center;
}

.current-value {
  text-align: center;
  font-size: 0.8rem;
  color: #333;
  margin-top: 0.25rem;
}
</style>
