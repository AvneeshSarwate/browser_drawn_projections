<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'
import type { GraphEdge, GraphNode } from '@/rendering/shaderFXBabylon'

cytoscape.use(dagre)

const props = defineProps<{
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId?: string | null
}>()

const emit = defineEmits<{
  'node-click': [nodeId: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
let cy: cytoscape.Core | null = null

function buildElements() {
  return [
    ...props.nodes.map((node) => ({ data: { id: node.id, label: node.name } })),
    ...props.edges.map((edge) => ({ data: { source: edge.from, target: edge.to } })),
  ]
}

function runLayout() {
  if (!cy) return
  // @ts-expect-error layout options for dagre are not in core typings
  cy.layout({ name: 'dagre', rankDir: 'TB', nodeSep: 20, rankSep: 20 }).run()
}

onMounted(() => {
  if (!containerRef.value) {
    return
  }

  cy = cytoscape({
    container: containerRef.value,
    elements: buildElements(),
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'background-color': '#666',
          color: '#fff',
          'text-valign': 'center',
          'text-halign': 'center',
          width: 120,
          height: 40,
          shape: 'roundrectangle',
        },
      },
      {
        selector: 'node:selected',
        style: {
          'background-color': '#0af',
        },
      },
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#999',
          'target-arrow-color': '#999',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
        },
      },
    ],
    wheelSensitivity: 0.2,
    boxSelectionEnabled: false,
    userZoomingEnabled: true,
    userPanningEnabled: true,
  })

  cy.on('tap', 'node', (evt) => {
    emit('node-click', evt.target.id())
  })

  runLayout()
  if (props.selectedNodeId) {
    cy.$(`#${props.selectedNodeId}`).select()
  }
})

onUnmounted(() => {
  cy?.destroy()
  cy = null
})

watch(
  () => [props.nodes, props.edges],
  () => {
    if (!cy) return
    cy.elements().remove()
    cy.add(buildElements())
    runLayout()
    if (props.selectedNodeId) {
      cy.$(`#${props.selectedNodeId}`).select()
    }
  },
  { deep: true },
)

watch(
  () => props.selectedNodeId,
  (nodeId) => {
    if (!cy) return
    cy.elements('node').unselect()
    if (nodeId) {
      const node = cy.$(`#${nodeId}`)
      if (node) {
        node.select()
        cy.animate({
          center: { eles: node }
        }, {
          duration: 250,
          easing: 'ease-in-out'
        })
      }
    }
  },
)
</script>

<template>
  <div ref="containerRef" class="cytoscape-container"></div>
</template>

<style scoped>
.cytoscape-container {
  width: 100%;
  height: 420px;
  border: 1px solid #ccc;
  background: #f8f8f8;
  border-radius: 6px;
}
</style>
