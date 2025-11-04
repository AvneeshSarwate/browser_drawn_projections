<script setup lang="ts">
import { computed } from 'vue'
import type { ShaderEffect, UniformDescriptor } from '@/rendering/shaderFXBabylon'
import FloatSlider from './FloatSlider.vue'
import VectorInput from './VectorInput.vue'

const props = defineProps<{
  effect: ShaderEffect
}>()

const uniformMeta = computed<UniformDescriptor[]>(() => {
  if (!props.effect || typeof (props.effect as any).getUniformsMeta !== 'function') {
    return []
  }
  return (props.effect as any).getUniformsMeta() as UniformDescriptor[]
})

const floatParams = computed(() => uniformMeta.value.filter((entry) => entry.kind === 'f32'))

const vectorParams = computed(() =>
  uniformMeta.value.filter((entry) => entry.kind === 'vec2f' || entry.kind === 'vec3f' || entry.kind === 'vec4f'),
)

const hasParams = computed(() => floatParams.value.length > 0 || vectorParams.value.length > 0)

const totalParams = computed(() => floatParams.value.length + vectorParams.value.length)
</script>

<template>
  <div class="params-panel">
    <header class="effect-header">
      <div class="effect-name">{{ effect.effectName }}</div>
      <div v-if="hasParams" class="param-count">{{ totalParams }} param{{ totalParams === 1 ? '' : 's' }}</div>
    </header>

    <div class="params-content">
      <section v-if="floatParams.length" class="param-section">
        <h5 class="section-title">Float Controls</h5>
        <div class="param-group">
          <FloatSlider
            v-for="param in floatParams"
            :key="param.name"
            :effect="effect"
            :param="param"
          />
        </div>
      </section>

      <section v-if="vectorParams.length" class="param-section">
        <h5 class="section-title">Vector Controls</h5>
        <div class="param-group">
          <VectorInput
            v-for="param in vectorParams"
            :key="param.name"
            :effect="effect"
            :param="param"
          />
        </div>
      </section>

      <div v-if="!hasParams" class="no-params">
        This effect has no editable parameters
      </div>
    </div>
  </div>
</template>

<style scoped>
.params-panel {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.effect-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 0.25rem;
}

.effect-name {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.param-count {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.params-content {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.param-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.section-title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.6);
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.no-params {
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
  text-align: center;
  padding: 0.75rem 0.5rem;
}
</style>
