<script setup lang="ts">
import { ref, watch, computed, shallowRef, onUnmounted } from 'vue'
import Konva from 'konva'
import MetadataEditor from './MetadataEditor.vue'
import { setNodeMetadata, collectHierarchy, collectHierarchyFromRoot, type HierarchyEntry, updateMetadataHighlight } from './freehandTool'
import { appState, selected, getActiveSingleNode } from './appState'
import { isFreehandGroupSelected } from './freehandTool'

// Auto-detect which mode to use and get root selection
const singleNode = computed(() => getActiveSingleNode())
const multiSelected = computed(() => selected.length > 1 || isFreehandGroupSelected.value)
const mode = computed(() => 
  multiSelected.value ? 'hierarchical' : (singleNode.value ? 'simple' : 'none')
)

// Get the root node for hierarchy display
const hierarchyRoot = computed(() => {
  if (mode.value === 'hierarchical' && selected.length === 1) {
    // If single group selected, use it as root
    return selected[0] instanceof Konva.Group ? selected[0] : null
  }
  return null
})

// Collect hierarchy based on current selection
const entries = computed(() => {
  const root = hierarchyRoot.value
  if (root) {
    // Show hierarchy rooted at selected group
    return collectHierarchyFromRoot(root)
  } else if (mode.value === 'hierarchical') {
    // Show full canvas hierarchy for multi-selection
    return collectHierarchy()
  }
  return []
})

const activeNode = shallowRef<Konva.Node | null>(null)

// Initialize activeNode based on current selection when component mounts or mode changes
watch([mode, hierarchyRoot], ([newMode, newRoot]) => {
  if (newMode === 'hierarchical' && newRoot) {
    // If hierarchical mode with a group selected, set it as active
    activeNode.value = newRoot
    updateMetadataHighlight(newRoot as Konva.Node)
  } else if (newMode === 'simple' && singleNode.value) {
    // If simple mode, set the single node as active
    activeNode.value = singleNode.value
    updateMetadataHighlight(singleNode.value as Konva.Node)
  } else if (newMode === 'none') {
    // Clear active node when nothing selected
    activeNode.value = null
    updateMetadataHighlight(undefined)
  }
}, { immediate: true })

// Watch for single node selection changes
watch(singleNode, (node) => {
  if (mode.value === 'simple') {
    activeNode.value = node
    updateMetadataHighlight(node as Konva.Node | undefined)
  }
})

// Watch for activeNode changes to update highlight
watch(activeNode, (node) => {
  updateMetadataHighlight(node as Konva.Node | undefined)
})

// Watch for mode changes to clear highlight when editor is not active
watch(mode, (newMode) => {
  if (newMode === 'none') {
    activeNode.value = null
    updateMetadataHighlight(undefined)
  }
})

// Clear highlight when component is unmounted
onUnmounted(() => {
  updateMetadataHighlight(undefined)
})

const selectNode = (node: any) => {
  activeNode.value = node as Konva.Node
  // No longer sync with canvas selection - just update highlight
}

const applyMetadataSingle = (meta: any) => {
  if (singleNode.value) {
    setNodeMetadata(singleNode.value as Konva.Node, meta)
  }
}

const applyMetadata = (meta: any) => {
  if (activeNode.value) {
    setNodeMetadata(activeNode.value as Konva.Node, meta)
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
  } else {
    return `${konvaNode.constructor.name} ${id}`
  }
}

const hasMetadata = (node: any) => {
  const konvaNode = node as Konva.Node
  const metadata = konvaNode.getAttr('metadata')
  return metadata && Object.keys(metadata).length > 0
}
</script>

<template>
  <div class="smart-metadata-editor">
    <!-- Simple mode for single selections -->
    <template v-if="mode === 'simple'">
      <MetadataEditor
        :active-node="singleNode!"
        :visible="true"
        @apply="applyMetadataSingle"
      />
    </template>

    <!-- Hierarchical mode for groups/multi-selections -->
    <template v-else-if="mode === 'hierarchical'">
      <div class="hierarchical-editor">
        <div class="header">
          <h3>{{ hierarchyRoot ? `Group: ${nodeLabel(hierarchyRoot as any)}` : 'Hierarchical Metadata Editor' }}</h3>
          <p class="help">Select a node to edit its metadata:</p>
        </div>
        
        <div class="tree-view" v-if="entries.length > 0">
          <div
            v-for="entry in entries"
            :key="entry.indexPath"
            :class="['tree-row', { active: entry.node === activeNode }]"
            :style="{ paddingLeft: entry.depth * 50 + 'px' }"
            @click="selectNode(entry.node)"
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
          :active-node="activeNode"
          :visible="true"
          @apply="applyMetadata"
        />
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
</style>
