<script lang="ts" setup>
import { defineProps, computed } from 'vue'
import { type TreeProp } from '@/stores/undoCommands'

const props = defineProps<{objectToEdit: TreeProp}>()

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

function setPropValue(key: string, value: string | number) {
  // eslint-disable-next-line vue/no-mutating-props
  props.objectToEdit[key] = value
}

</script>
  
<template>
  <div v-for="(item, index) in renderInputs" :key="index">
    <div v-if="item?.type === 'input'">
      <label :for="item.key">{{ item.key }}</label>
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
        <AutoUI :object-to-edit="(props.objectToEdit[item.key] as TreeProp)" />
      </details>
    </div>
  </div>
</template>

<style scoped>
/* Add CSS styles if needed */
</style>
