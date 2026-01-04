<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GraphEdgeView, GraphNodeView, ShaderEffectLike, ShaderGraphLike } from './types'
import GraphPanel from './GraphPanel.vue'
import ParamsPanel from './ParamsPanel.vue'

const props = defineProps<{
  finalEffect: ShaderEffectLike | null | undefined
}>()

const selectedEffectId = ref<string | null>(null)
const selectedEffect = ref<ShaderEffectLike | null>(null)

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

const graph = computed<ShaderGraphLike>(() => {
  const effect = props.finalEffect
  if (effect && typeof (effect as any).getGraph === 'function') {
    return (effect as any).getGraph() as ShaderGraphLike
  }
  return { nodes: [], edges: [] }
})

const graphNodes = computed<GraphNodeView[]>(() =>
  graph.value.nodes.map((node) => ({ id: node.id, name: node.name })),
)

const graphEdges = computed<GraphEdgeView[]>(() => graph.value.edges.map((edge) => ({ from: edge.from, to: edge.to })))

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
const hasGraphData = computed(() => graph.value.nodes.length > 0)
</script>

<template>
  <div class="shader-graph-panel">
    <div v-if="hasGraphData" class="shader-graph-ui">
      <div class="graph-section">
        <h3>Effect Chain</h3>
        <GraphPanel
          :nodes="graphNodes"
          :edges="graphEdges"
          :selected-node-id="selectedId ?? undefined"
          @node-click="onNodeClick"
        />
      </div>

      <div class="params-section">
        <h3>Parameters</h3>
        <div class="params-scroll">
          <ParamsPanel v-if="selectedEffect" :effect="selectedEffect" />
          <div v-else class="no-selection">
            Click a node to view parameters
          </div>
        </div>
      </div>
    </div>

    <div v-else class="loading-placeholder">
      Shader graph loading…
    </div>
  </div>
</template>

<style scoped>
.shader-graph-panel {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 0.75rem;
  width: 750px;
  max-width: 100%;
  min-height: var(--shader-graph-panel-min-height, 300px);
  height: 450px;
  overflow: hidden;
  border: 1px solid #1f1f1f;
  border-radius: 8px;
  background: #101010;
  padding: 0.75rem;
  color: #f0f0f0;
  box-sizing: border-box;
}

.shader-graph-ui {
  display: flex;
  flex-direction: row;
  gap: 1rem;
  width: var(--shader-graph-ui-width, 100%);
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.graph-section {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
}

.params-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
  flex: 1 1 0;
  min-width: 500px;
  min-height: 0;
}

.params-scroll {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.loading-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  color: #999;
  font-style: italic;
  height: 100%;
  min-height: 200px;
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
