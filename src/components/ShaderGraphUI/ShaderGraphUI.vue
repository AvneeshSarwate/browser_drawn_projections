<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ShaderEffect, ShaderGraph } from '@/rendering/shaderFXBabylon'
import GraphPanel from './GraphPanel.vue'
import ParamsPanel from './ParamsPanel.vue'

const props = defineProps<{
  finalEffect: ShaderEffect | null | undefined
}>()

const selectedEffectId = ref<string | null>(null)
const selectedEffect = ref<ShaderEffect | null>(null)

function setSelectedNode(nodeId: string | null) {
  if (!nodeId) {
    selectedEffectId.value = null
    selectedEffect.value = null
    return
  }
  const node = graph.value.nodes.find((entry) => entry.id === nodeId)
  if (!node) {
    selectedEffectId.value = null
    selectedEffect.value = null
    return
  }
  selectedEffectId.value = node.id
  selectedEffect.value = node.ref
}

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
    setSelectedNode(null)
  },
)

watch(
  graph,
  (value) => {
    if (selectedEffectId.value) {
      const node = value.nodes.find((entry) => entry.id === selectedEffectId.value)
      if (!node) {
        setSelectedNode(null)
      } else if (node.ref !== selectedEffect.value) {
        selectedEffect.value = node.ref
      }
    } else if (value.nodes.length > 0) {
      setSelectedNode(value.nodes[0].id)
    }
  },
  { immediate: true },
)

function onNodeClick(nodeId: string) {
  setSelectedNode(nodeId)
}

const selectedId = computed(() => selectedEffectId.value)
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
      <ParamsPanel v-if="selectedEffect" :effect="selectedEffect as ShaderEffect" />
      <div v-else class="no-selection">
        Click a node to view parameters
      </div>
    </div>
  </div>
</template>

<style scoped>
.shader-graph-ui {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.graph-section {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.params-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.no-selection {
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 0.75rem;
  text-align: center;
}
</style>
