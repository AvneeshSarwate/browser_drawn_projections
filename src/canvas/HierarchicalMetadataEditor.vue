<script setup lang="ts">
import { watch, computed, shallowRef, onUnmounted } from 'vue'
import Konva from 'konva'
import { type ZodTypeAny } from 'zod'
import MetadataEditor from './MetadataEditor.vue'
import type { HierarchyEntry } from './metadata/hierarchy'

interface Props {
  selectedNodes: Konva.Node[]
  singleNode: Konva.Node | null
  multiSelected: boolean
  groupSelected: boolean
  collectHierarchyFromRoot: (nodes: Konva.Node[]) => HierarchyEntry[]
  updateMetadataHighlight: (node?: Konva.Node) => void
  updateHoverHighlight: (node?: Konva.Node) => void
  onApplyMetadata: (node: Konva.Node, metadata: any) => void
  schemaOptions?: { name: string; schema: ZodTypeAny }[]
}

const props = withDefaults(defineProps<Props>(), {
  schemaOptions: () => []
})

const selectedNodes = computed(() => props.selectedNodes)
const singleNode = computed(() => props.singleNode)
const multiSelected = computed(() => props.multiSelected)
const groupSelected = computed(() => props.groupSelected)
const mode = computed(() =>
  multiSelected.value || groupSelected.value ? 'hierarchical' : (singleNode.value ? 'simple' : 'none')
)

// Collect hierarchy based on current selection - only show selected nodes
const entries = computed(() => {
  if (multiSelected.value) {
    // Show only the selected nodes for multi-selection
    return props.collectHierarchyFromRoot(selectedNodes.value as Konva.Node[])
  } else if (groupSelected.value) {
    // Show hierarchy rooted at selected group
    const firstNode = selectedNodes.value[0]
    return firstNode ? props.collectHierarchyFromRoot([firstNode]) : []
  }
  return []
})

const activeNode = shallowRef<Konva.Node | null>(null)

const singleNodeMetadata = computed(() => {
  const node = singleNode.value
  return node ? (node.getAttr('metadata') ?? {}) : null
})

const activeNodeMetadata = computed(() => {
  const node = activeNode.value
  return node ? (node.getAttr('metadata') ?? {}) : null
})

// Initialize activeNode based on current selection when component mounts or mode changes
watch([mode, groupSelected, selectedNodes], ([newMode, isGroupSelected]) => {
  if (newMode === 'hierarchical' && isGroupSelected) {
    // If hierarchical mode with a single group selected, set it as active
    const firstNode = selectedNodes.value[0]
    if (firstNode) {
      activeNode.value = firstNode
      props.updateMetadataHighlight(firstNode as Konva.Node)
    }
  } else if (newMode === 'simple' && singleNode.value) {
    // If simple mode, set the single node as active
    activeNode.value = singleNode.value
    props.updateMetadataHighlight(singleNode.value as Konva.Node)
  } else if (newMode === 'hierarchical' && multiSelected.value) {
    // Multi-selection: don't auto-select any node, force user to pick
    activeNode.value = null
    props.updateMetadataHighlight(undefined)
  } else if (newMode === 'none') {
    // Clear active node when nothing selected
    activeNode.value = null
    props.updateMetadataHighlight(undefined)
  }
}, { immediate: true })

// Watch for single node selection changes
watch(singleNode, (node) => {
  if (mode.value === 'simple') {
    activeNode.value = node
    props.updateMetadataHighlight(node as Konva.Node | undefined)
  }
})

// Watch for activeNode changes to update highlight
watch(activeNode, (node) => {
  props.updateMetadataHighlight(node as Konva.Node | undefined)
})

// Watch for mode changes to clear highlight when editor is not active
watch(mode, (newMode) => {
  if (newMode === 'none') {
    activeNode.value = null
    props.updateMetadataHighlight(undefined)
  }
})

// Clear highlight when component is unmounted
onUnmounted(() => {
  props.updateMetadataHighlight(undefined)
  props.updateHoverHighlight(undefined)
})

const selectNode = (node: any) => {
  activeNode.value = node as Konva.Node
  // No longer sync with canvas selection - just update highlight
}

const applyMetadataSingle = (meta: any) => {
  if (singleNode.value) {
    props.onApplyMetadata(singleNode.value as Konva.Node, meta)
  }
}

const applyMetadata = (meta: any) => {
  if (activeNode.value) {
    props.onApplyMetadata(activeNode.value as Konva.Node, meta)
  }
}

const nodeLabel = (node: any) => {
  const konvaNode = node as Konva.Node
  const id = konvaNode.id() || `#${(konvaNode as any)._id}`
  if (konvaNode instanceof Konva.Group) {
    const childCount = konvaNode.getChildren().length
    return `Group ${id} (${childCount} ${childCount === 1 ? 'child' : 'children'})`
  } else if (konvaNode instanceof Konva.Path) {
    return `Stroke ${id}`
  } else if (konvaNode instanceof Konva.Line) {
    return `Polygon ${id}`
  } else {
    return `${konvaNode.constructor.name} ${id}`
  }
}

const hasMetadata = (node: any) => {
  const konvaNode = node as Konva.Node
  const metadata = konvaNode.getAttr('metadata')
  return metadata && Object.keys(metadata).length > 0
}

const handleMouseEnter = (node: any) => {
  props.updateHoverHighlight(node as Konva.Node)
}

const handleMouseLeave = () => {
  props.updateHoverHighlight(undefined)
}
</script>

<template>
  <div class="smart-metadata-editor">
    <!-- Simple mode for single selections -->
    <template v-if="mode === 'simple'">
      <div class="single-node-header" v-if="singleNode">
        <span class="node-id">{{ nodeLabel(singleNode as any) }}</span>
      </div>
      <MetadataEditor
        :metadata="singleNodeMetadata"
        :visible="true"
        :can-edit="!!singleNode"
        :schema-options="props.schemaOptions"
        @apply="applyMetadataSingle"
      />
    </template>

    <!-- Hierarchical mode for groups/multi-selections -->
    <template v-else-if="mode === 'hierarchical'">
      <div class="hierarchical-editor">
        <div class="header">
          <h3 v-if="groupSelected">Group: {{ nodeLabel(selectedNodes[0] as any) }}</h3>
          <h3 v-else-if="multiSelected" class="multi-selection-header">
            {{ selectedNodes.length }} items selected – single-item editing only
          </h3>
          <p class="help">{{ multiSelected ? 'Pick one below to edit its metadata:' : 'Select a node to edit its metadata:' }}</p>
        </div>
        
        <div class="tree-view" v-if="entries.length > 0">
          <div
            v-for="entry in entries"
            :key="entry.indexPath"
            :class="['tree-row', { active: entry.node === activeNode }]"
            :style="{ paddingLeft: entry.depth * 50 + 'px' }"
            @click="selectNode(entry.node)"
            @mouseenter="handleMouseEnter(entry.node)"
            @mouseleave="handleMouseLeave"
          >
            <span class="label">{{ nodeLabel(entry.node as any) }}</span>
            <span class="metadata-indicator" v-if="hasMetadata(entry.node as any)">●</span>
          </div>
        </div>
        
        <div v-else class="empty-state">
          <p>No shapes or groups available</p>
        </div>

        <!-- JSON editor for selected tree node -->
        <MetadataEditor
          v-if="activeNode"
          :metadata="activeNodeMetadata"
          :visible="true"
          :can-edit="true"
          :schema-options="props.schemaOptions"
          @apply="applyMetadata"
        />
        
        <!-- Hint when no node is selected in multi-selection mode -->
        <div v-else-if="multiSelected" class="selection-hint">
          <p>← Click a row above to edit its metadata</p>
        </div>
      </div>
    </template>

    <!-- No selection state -->
    <div v-else class="empty-state">
      <p>Select something to edit its metadata</p>
    </div>
  </div>
</template>

<style scoped>
.smart-metadata-editor {
  margin-top: 8px;
}

.single-node-header {
  background: white;
  border: 1px solid #ddd;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  padding: 8px 16px;
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  color: #333;
}

.node-id {
  font-weight: 500;
}

.hierarchical-editor {
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 8px 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
  max-width: 700px;
  font-size: 15px;
}

.header {
  margin-bottom: 8px;
}

.header h3 {
  margin: 0 0 4px 0;
  font-size: 17px;
  color: #333;
}

.multi-selection-header {
  color: #e67e22 !important;
  font-weight: bold;
}

.help {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.tree-view {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 8px;
}

.tree-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid #f5f5f5;
  transition: background-color 0.15s;
}

.tree-row:last-child {
  border-bottom: none;
}

.tree-row:hover {
  background-color: #f8f9fa;
}

.tree-row.active {
  background-color: #fff2f2;
  border-left: 3px solid #dc3545;
}

.label {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  color: #333;
}

.metadata-indicator {
  color: #28a745;
  font-size: 12px;
  font-weight: bold;
}

.empty-state {
  text-align: center;
  color: #666;
  padding: 20px;
  font-style: italic;
}

.empty-state p {
  margin: 0;
}

.selection-hint {
  text-align: center;
  color: #666;
  padding: 15px;
  font-style: italic;
  border: 2px dashed #ddd;
  border-radius: 6px;
  margin-top: 10px;
}

.selection-hint p {
  margin: 0;
}
</style>
