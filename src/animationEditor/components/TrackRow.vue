<script setup lang="ts">
import { inject, computed } from 'vue'
import type { Ref } from 'vue'
import type { Core } from '../core'
import {
  TRACK_ROW_HEIGHT,
  NAME_COLUMN_WIDTH,
  NAME_BG_COLOR,
  NAME_TEXT_COLOR,
  NAME_FONT_SIZE,
} from '../constants'
import TrackCanvas from './TrackCanvas.vue'

const props = defineProps<{
  trackId: string
}>()

const core = inject<Core>('core')!
const windowStart = inject<Ref<number>>('windowStart')!
const windowEnd = inject<Ref<number>>('windowEnd')!
const selectedTrackIdsForEdit = inject<Ref<Set<string>>>('selectedTrackIdsForEdit')!
const toggleTrackSelection = inject<(trackId: string) => void>('toggleTrackSelection')!

const track = computed(() => core.getTrackById(props.trackId))
const isSelected = computed(() => selectedTrackIdsForEdit.value.has(props.trackId))

function onCheckboxChange() {
  toggleTrackSelection(props.trackId)
}
</script>

<template>
  <div class="track-row" v-if="track">
    <div class="name-cell">
      <input
        type="checkbox"
        :checked="isSelected"
        @change="onCheckboxChange"
        class="track-checkbox"
        title="Select for editing"
      />
      <span class="track-name">{{ track.def.name }}</span>
    </div>
    <div class="canvas-cell">
      <TrackCanvas
        :track="track"
        :window-start="windowStart"
        :window-end="windowEnd"
      />
    </div>
  </div>
</template>

<style scoped>
.track-row {
  display: flex;
  height: v-bind('TRACK_ROW_HEIGHT + "px"');
  border-bottom: 1px solid #2a2d30;
}

.name-cell {
  width: v-bind('NAME_COLUMN_WIDTH + "px"');
  min-width: v-bind('NAME_COLUMN_WIDTH + "px"');
  background: v-bind('NAME_BG_COLOR');
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.track-checkbox {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  accent-color: #3a7ca5;
  cursor: pointer;
}

.track-name {
  font-size: v-bind('NAME_FONT_SIZE + "px"');
  color: v-bind('NAME_TEXT_COLOR');
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.canvas-cell {
  flex: 1;
  position: relative;
  overflow: hidden;
}
</style>
