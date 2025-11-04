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

const formattedMin = computed(() => min.value.toFixed(2))
const formattedMax = computed(() => max.value.toFixed(2))
const formattedCurrent = computed(() => currentValue.value.toFixed(3))

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
      <span class="value-label">{{ formattedMin }}</span>

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

      <span class="value-label">{{ formattedMax }}</span>
    </div>

    <div class="current-value">{{ formattedCurrent }}</div>
  </div>
</template>

<style scoped>
.float-slider {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.25rem 0.3rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
  letter-spacing: 0.01em;
}

.param-name {
  font-weight: 600;
}

.dynamic-badge {
  font-size: 0.6rem;
  padding: 0.05rem 0.3rem;
  background: #c27c2c;
  color: #fff;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.slider {
  flex: 1;
  accent-color: #2ea0fd;
}

.slider.dynamic {
  opacity: 0.6;
  cursor: not-allowed;
}

.value-label {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.08rem 0.3rem;
  min-width: 3rem;
  text-align: center;
  border-radius: 999px;
}

.current-value {
  text-align: center;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.72);
}
</style>
