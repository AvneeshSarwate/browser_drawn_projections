<script setup lang="ts">
import TrackRow from './TrackRow.vue'

defineProps<{
  trackIds: string[]
}>()
</script>

<template>
  <div class="track-list">
    <TrackRow
      v-for="trackId in trackIds"
      :key="trackId"
      :track-id="trackId"
    />
    <div v-if="trackIds.length === 0" class="empty-message">
      No tracks
    </div>
  </div>
</template>

<style scoped>
.track-list {
  display: flex;
  flex-direction: column;
}

.empty-message {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 14px;
}
</style>
