<script setup lang="ts">
import { computed } from 'vue'
import type { ShaderEffect, UniformDescriptor } from '@/rendering/shaderFXBabylon'
import FloatSlider from './FloatSlider.vue'

const props = defineProps<{
  effect: ShaderEffect
}>()

const floatParams = computed<UniformDescriptor[]>(() => {
  if (!props.effect || typeof (props.effect as any).getUniformsMeta !== 'function') {
    return []
  }
  const meta = (props.effect as any).getUniformsMeta() as UniformDescriptor[]
  return meta.filter((entry) => entry.kind === 'f32')
})
</script>

<template>
  <div class="params-panel">
    <h4>{{ effect.effectName }}</h4>

    <div v-if="floatParams.length === 0" class="no-params">
      No float parameters
    </div>

    <FloatSlider
      v-for="param in floatParams"
      :key="param.name"
      :effect="effect"
      :param="param"
    />
  </div>
</template>

<style scoped>
.params-panel {
  padding: 0.5rem;
}

.no-params {
  color: #999;
  font-style: italic;
}
</style>
