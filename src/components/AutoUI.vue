<script lang="ts" setup>
import { computed, ref, toRaw } from 'vue'
import { type TreeProp } from '@/stores/undoCommands'

type AutoUIProps = {
  objectToEdit: TreeProp,
  postEditCallback?: (objectToEdit: TreeProp) => void
}

const props = defineProps<AutoUIProps>()

//todo api - add arrays to the tree prop type
//todo - add a panel for adjusting the display properties AutoUI view (make it like unity inspector)

const objectToEdit = ref(props.objectToEdit)

const renderInputs = computed(() => {
  return Object.keys(objectToEdit.value).map(key => {
    const value = objectToEdit.value[key]
    if (typeof value === 'string' || typeof value === 'number') {
      return { key, type: 'input', valType: typeof value }
    } else if (typeof value === 'boolean') {
      return { key, type: 'boolean', valType: typeof value }
    } else if (typeof value === 'object' && value !== null) {
      return { key, type: 'nested', valType: typeof value }
    }
  })
})

//todo - for text fields, use on-change but also add a red border if the field isn't committed

const updateObject = (event: Event, valType: string) => {
  const target = event.target as HTMLInputElement
  objectToEdit.value[target.id] = valType === 'number' ? parseFloat(target.value) : target.value
  props.postEditCallback?.(objectToEdit.value)
}
</script>
  
<template>
  <div v-for="(item, index) in renderInputs" :key="index">
    <div v-if="item?.type === 'input'">
      <label :for="item.key">{{ item.key }}</label> <!-- todo api - key should be full path-chain to prevent duplicates -->
      <input :id="item.key" :value="objectToEdit[item.key]" @blur="(event: Event) => updateObject(event, item.valType)" />
    </div>
    <div v-else-if="item?.type === 'boolean'">
      <label :for="item.key">{{ item.key }}</label>
      <input :id="item.key" type="checkbox" v-model="objectToEdit[item.key]" />
    </div>
    <div v-else-if="item?.type === 'nested'">
      <details>
        <summary>{{ item.key }}</summary>
        <div class="autoUIInset">
          <AutoUI :object-to-edit="(objectToEdit[item.key] as TreeProp)" />
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
