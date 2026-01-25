<script setup lang="ts">
import { computed } from 'vue'
import type { TrackRuntime, TrackType, EditorAction } from '../types'
import {
  EDIT_SIDEBAR_BG_COLOR,
  EDIT_SIDEBAR_TRACK_BG,
  EDIT_SIDEBAR_TRACK_BG_HOVER,
  EDIT_SIDEBAR_TRACK_BG_ENABLED,
  EDIT_SIDEBAR_SECTION_MAX_HEIGHT,
} from '../constants'

const props = defineProps<{
  tracks: TrackRuntime[]
  editEnabledTrackIds: Set<string>
  frontTrackIdByType: { number?: string; enum?: string; func?: string }
}>()

const emit = defineEmits<{
  action: [action: EditorAction]
}>()

// Filter to only show enabled tracks, grouped by type
const enabledNumberTracks = computed(() =>
  props.tracks.filter(t => t.def.fieldType === 'number' && props.editEnabledTrackIds.has(t.id))
)
const enabledEnumTracks = computed(() =>
  props.tracks.filter(t => t.def.fieldType === 'enum' && props.editEnabledTrackIds.has(t.id))
)
const enabledFuncTracks = computed(() =>
  props.tracks.filter(t => t.def.fieldType === 'func' && props.editEnabledTrackIds.has(t.id))
)

function isFront(track: TrackRuntime): boolean {
  return props.frontTrackIdByType[track.def.fieldType] === track.id
}

function setFront(track: TrackRuntime) {
  emit('action', { type: 'TRACK/SET_FRONT', fieldType: track.def.fieldType, trackId: track.id })
}

function deleteTrack(trackId: string) {
  if (confirm('Delete this track?')) {
    emit('action', { type: 'TRACK/DELETE', trackId })
  }
}

function updateBounds(trackId: string, low: number, high: number) {
  emit('action', { type: 'TRACK/SET_BOUNDS', trackId, low, high })
}

function onLowChange(track: TrackRuntime, e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value) && value < track.high) {
    updateBounds(track.id, value, track.high)
  }
}

function onHighChange(track: TrackRuntime, e: Event) {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (!isNaN(value) && value > track.low) {
    updateBounds(track.id, track.low, value)
  }
}

const noTracksEnabled = computed(() =>
  props.editEnabledTrackIds.size === 0
)
</script>

<template>
  <div class="edit-sidebar">
    <!-- Number tracks section -->
    <div class="track-section" v-if="enabledNumberTracks.length > 0">
      <div class="section-header">Number Tracks</div>
      <div class="track-list">
        <div
          v-for="track in enabledNumberTracks"
          :key="track.id"
          class="track-item"
          :class="{ 'track-front': isFront(track) }"
          @click="setFront(track)"
        >
          <div class="track-row">
            <span class="track-name">{{ track.def.name }}</span>
            <button class="delete-btn" @click.stop="deleteTrack(track.id)" title="Delete track">×</button>
          </div>
          <div class="bounds-row" v-if="isFront(track)">
            <label>
              <span class="bounds-label">Low</span>
              <input
                type="number"
                :value="track.low"
                step="0.1"
                @change="onLowChange(track, $event)"
                class="bounds-input"
              />
            </label>
            <label>
              <span class="bounds-label">High</span>
              <input
                type="number"
                :value="track.high"
                step="0.1"
                @change="onHighChange(track, $event)"
                class="bounds-input"
              />
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Enum tracks section -->
    <div class="track-section" v-if="enabledEnumTracks.length > 0">
      <div class="section-header">Enum Tracks</div>
      <div class="track-list">
        <div
          v-for="track in enabledEnumTracks"
          :key="track.id"
          class="track-item"
          :class="{ 'track-front': isFront(track) }"
          @click="setFront(track)"
        >
          <div class="track-row">
            <span class="track-name">{{ track.def.name }}</span>
            <button class="delete-btn" @click.stop="deleteTrack(track.id)" title="Delete track">×</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Func tracks section -->
    <div class="track-section" v-if="enabledFuncTracks.length > 0">
      <div class="section-header">Func Tracks</div>
      <div class="track-list">
        <div
          v-for="track in enabledFuncTracks"
          :key="track.id"
          class="track-item"
          :class="{ 'track-front': isFront(track) }"
          @click="setFront(track)"
        >
          <div class="track-row">
            <span class="track-name">{{ track.def.name }}</span>
            <button class="delete-btn" @click.stop="deleteTrack(track.id)" title="Delete track">×</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="noTracksEnabled" class="empty-message">
      Select tracks in view mode
    </div>
  </div>
</template>

<style scoped>
.edit-sidebar {
  flex: 1;
  background: v-bind('EDIT_SIDEBAR_BG_COLOR');
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.track-section {
  border-bottom: 1px solid #2a2d30;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section-header {
  padding: 8px 12px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
}

.track-list {
  max-height: v-bind('EDIT_SIDEBAR_SECTION_MAX_HEIGHT + "px"');
  overflow-y: auto;
  overflow-x: hidden;
}

.track-item {
  padding: 8px 12px;
  background: v-bind('EDIT_SIDEBAR_TRACK_BG');
  cursor: pointer;
  transition: background 0.15s ease;
  border-left: 3px solid transparent;
}

.track-item:hover {
  background: v-bind('EDIT_SIDEBAR_TRACK_BG_HOVER');
}

.track-item.track-front {
  background: v-bind('EDIT_SIDEBAR_TRACK_BG_ENABLED');
  border-left-color: #3a7ca5;
}

.track-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-name {
  flex: 1;
  font-size: 12px;
  color: #c0c0c0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-front .track-name {
  color: #e0e0e0;
}

.delete-btn {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: #555;
  font-size: 14px;
  cursor: pointer;
  border-radius: 3px;
  opacity: 0;
  transition: all 0.15s ease;
}

.track-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #dc2626;
  color: #fff;
}

.bounds-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.bounds-row label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bounds-label {
  font-size: 10px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bounds-input {
  width: 56px;
  padding: 4px 6px;
  background: #1a1c20;
  border: 1px solid #2a2d30;
  border-radius: 3px;
  color: #c8c8c8;
  font-size: 11px;
  transition: border-color 0.15s ease;
}

.bounds-input:focus {
  outline: none;
  border-color: #3a7ca5;
}

.empty-message {
  padding: 24px 16px;
  text-align: center;
  color: #555;
  font-size: 12px;
}
</style>
