<script lang="ts" setup>
import { computed } from 'vue'
import { type TreeProp } from '@/stores/undoCommands'

const props = defineProps<{ objectToEdit: TreeProp }>()

//todo api - add arrays to the tree prop type
//todo - add a panel for adjusting the display properties AutoUI view (make it like unity inspector)

const renderInputs = computed(() => {
  return Object.keys(props.objectToEdit).map(key => {
    const value = props.objectToEdit[key]
    if (typeof value === 'string' || typeof value === 'number') {
      return { key, type: 'input' }
    } else if (typeof value === 'boolean') {
      return { key, type: 'boolean' }
    } else if (typeof value === 'object' && value !== null) {
      return { key, type: 'nested' }
    }
  })
})

</script>
  
<template>
  <div v-for="(item, index) in renderInputs" :key="index">
    <div v-if="item?.type === 'input'">
      <label :for="item.key">{{ item.key }}</label> <!-- todo api - key should be full path-chain to prevent duplicates -->
       <!-- eslint-disable-next-line vue/no-mutating-props -->
      <input :id="item.key" v-model="props.objectToEdit[item.key]" />
    </div>
    <div v-else-if="item?.type === 'boolean'">
      <label :for="item.key">{{ item.key }}</label>
      <!-- eslint-disable-next-line vue/no-mutating-props -->
      <input :id="item.key" type="checkbox" v-model="props.objectToEdit[item.key]" />
    </div>
    <div v-else-if="item?.type === 'nested'">
      <details>
        <summary>{{ item.key }}</summary>
        <div class="autoUIInset">
          <AutoUI :object-to-edit="(props.objectToEdit[item.key] as TreeProp)" />
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
/* Add CSS styles if needed */
.autoUIInset {
  margin-left: 25px;
}
</style>
