<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ShaderEffect, ShaderGraph } from '@/rendering/shaderFXBabylon'
import GraphPanel from './GraphPanel.vue'
import ParamsPanel from './ParamsPanel.vue'

const props = defineProps<{
  finalEffect: ShaderEffect | null | undefined
}>()

const selectedEffect = ref<ShaderEffect | null>(null)

const graph = computed<ShaderGraph>(() => {
  const effect = props.finalEffect
  if (effect && typeof (effect as any).getGraph === 'function') {
    return (effect as any).getGraph() as ShaderGraph
  }
  return { nodes: [], edges: [] }
})

watch(
  () => props.finalEffect,
  () => {
    selectedEffect.value = null
  },
)

watch(
  graph,
  (value) => {
    if (!value.nodes.some((node) => node.ref === selectedEffect.value)) {
      selectedEffect.value = null
    }
  },
)

function onNodeClick(nodeId: string) {
  const node = graph.value.nodes.find((entry) => entry.id === nodeId)
  if (node) {
    selectedEffect.value = node.ref
  }
}

const selectedId = computed(() => selectedEffect.value?.id ?? null)
</script>

<template>
  <div class="shader-graph-ui">
    <div class="graph-section">
      <h3>Effect Chain</h3>
      <GraphPanel
        :nodes="graph.nodes"
        :edges="graph.edges"
        :selected-node-id="selectedId ?? undefined"
        @node-click="onNodeClick"
      />
    </div>

    <div class="params-section">
      <h3>Parameters</h3>
      <ParamsPanel v-if="selectedEffect" :effect="selectedEffect" />
      <div v-else class="no-selection">
        Click a node to view parameters
      </div>
    </div>
  </div>
</template>

<style scoped>
.shader-graph-ui {
  display: flex;
  gap: 1rem;
  height: 100%;
  max-height: 100%;
}

.graph-section {
  flex: 1;
  min-width: 360px;
  display: flex;
  flex-direction: column;
}

.params-section {
  width: 320px;
  max-width: 320px;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.no-selection {
  color: #888;
  font-style: italic;
}
</style>
