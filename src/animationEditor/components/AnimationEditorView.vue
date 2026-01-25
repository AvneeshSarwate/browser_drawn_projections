<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted, computed, shallowRef, reactive, watch } from 'vue'
import type { TrackDef, EditorMode, TrackElement, NumberElement, EnumElement, FuncElementData } from '../types'
import { Core } from '../core'
import { RenderScheduler } from '../renderScheduler'
import { NAME_COLUMN_WIDTH, EDIT_SIDEBAR_WIDTH } from '../constants'
import TimeRibbon from './TimeRibbon.vue'
import TrackList from './TrackList.vue'
import Playhead from './Playhead.vue'
import EditModeView from './EditModeView.vue'
import ToastContainer from './ToastContainer.vue'
import { AnimationEditorWebSocketController, coreToTrackData, type TrackData } from '../animationEditorWebSocket'

const props = withDefaults(defineProps<{
  duration?: number
  wsAddress?: string
  interactive?: boolean
}>(), {
  interactive: true
})

// WebSocket-overridable config
const wsConfig = reactive({
  interactive: undefined as boolean | undefined,
  duration: undefined as number | undefined
})

// Effective values (WebSocket overrides props)
const effectiveInteractive = computed(() => wsConfig.interactive ?? props.interactive)

// WebSocket controller
const wsController = shallowRef<AnimationEditorWebSocketController | null>(null)

// Core state
const core = new Core(props.duration)
const scheduler = new RenderScheduler()

// Wire up invalidation
core.setInvalidateCallback(() => scheduler.invalidate())

// Editor mode
const mode = ref<EditorMode>('view')

// Reactive state that shadows core state for Vue reactivity
const currentTime = ref(0)
const trackIds = ref<string[]>([])

// Track selection for edit mode (checkboxes in view mode)
const selectedTrackIdsForEdit = ref<Set<string>>(new Set())

// View window state
const windowStart = ref(0)
const windowEnd = ref(core.duration)

// Live playhead for visualization (separate from scrub playhead)
const livePlayhead = ref(0)

// Search filter
const searchFilter = ref('')

// ResizeObserver reference for cleanup
let resizeObserver: ResizeObserver | null = null

// Track list container ref for playhead positioning
const trackListRef = ref<HTMLElement | null>(null)
const canvasAreaWidth = ref(0)

// Provide to children
provide('core', core)
provide('scheduler', scheduler)
provide('windowStart', windowStart)
provide('windowEnd', windowEnd)
provide('searchFilter', searchFilter)
provide('selectedTrackIdsForEdit', selectedTrackIdsForEdit)

// Toggle track selection for edit mode
function toggleTrackSelection(trackId: string) {
  if (selectedTrackIdsForEdit.value.has(trackId)) {
    selectedTrackIdsForEdit.value.delete(trackId)
  } else {
    selectedTrackIdsForEdit.value.add(trackId)
  }
  // Trigger reactivity
  selectedTrackIdsForEdit.value = new Set(selectedTrackIdsForEdit.value)
}

provide('toggleTrackSelection', toggleTrackSelection)

// Computed: filtered track IDs (uses reactive trackIds)
const filteredTrackIds = computed(() => {
  const filter = searchFilter.value.toLowerCase().trim()
  if (!filter) return trackIds.value

  return trackIds.value.filter(id => {
    const track = core.getTrackById(id)
    return track && track.def.name.toLowerCase().includes(filter)
  })
})

// Computed: TimeRibbon spacer width based on mode
const ribbonSpacerWidth = computed(() => {
  return mode.value === 'view'
    ? NAME_COLUMN_WIDTH
    : EDIT_SIDEBAR_WIDTH
})

// Helper: Convert TrackData from WebSocket to TrackDef for Core
function trackDataToCoreTracks(tracks: TrackData[], trackOrder: string[]) {
  // Clear existing tracks
  for (const id of [...core.orderedTrackIds]) {
    core.deleteTrack(id)
  }

  // Add tracks in order
  for (const trackId of trackOrder) {
    const trackData = tracks.find(t => t.id === trackId)
    if (!trackData) continue

    // Create track definition (without callbacks - those are on Deno side)
    const def: TrackDef = {
      name: trackData.name,
      fieldType: trackData.fieldType,
      data: trackData.elementData.map(elem => {
        if (trackData.fieldType === 'number') {
          const e = elem as { time: number; value: number }
          return { time: e.time, element: e.value }
        } else if (trackData.fieldType === 'enum') {
          const e = elem as { time: number; value: string }
          return { time: e.time, element: e.value }
        } else {
          const e = elem as { time: number; value: { funcName: string; args: unknown[] } }
          return { time: e.time, element: e.value }
        }
      }),
      low: trackData.low,
      high: trackData.high
    }

    core.addTrack(def)
  }

  // Update reactive state
  trackIds.value = [...core.orderedTrackIds]
  windowEnd.value = core.duration
  scheduler.invalidate()
}

// Helper: Send tracks update via WebSocket
function sendTracksUpdate(source?: 'tracks' | 'time' | 'window' | 'other') {
  if (!wsController.value?.isConnected) return

  const { tracks, trackOrder } = coreToTrackData(core.tracksById, core.orderedTrackIds)
  wsController.value.sendTracksUpdate(tracks, trackOrder, source)
}

// Helper: Send state update via WebSocket
function sendStateUpdate(source?: 'tracks' | 'time' | 'window' | 'other') {
  if (!wsController.value?.isConnected) return

  wsController.value.sendStateUpdate(
    currentTime.value,
    core.duration,
    windowStart.value,
    windowEnd.value,
    source
  )
}

// Update canvas area width on resize
onMounted(() => {
  const updateWidth = () => {
    if (trackListRef.value) {
      canvasAreaWidth.value = trackListRef.value.clientWidth - NAME_COLUMN_WIDTH
    }
  }

  updateWidth()

  resizeObserver = new ResizeObserver(updateWidth)
  if (trackListRef.value) {
    resizeObserver.observe(trackListRef.value)
  }

  // Initial draw
  scheduler.invalidate()

  // Initialize WebSocket if address provided
  if (props.wsAddress) {
    wsController.value = new AnimationEditorWebSocketController(props.wsAddress)
    wsController.value.setHandlers({
      onSetTracks: (tracks, trackOrder) => {
        trackDataToCoreTracks(tracks, trackOrder)
        // Don't echo back to sender
      },
      onScrubToTime: (time) => {
        scrubToTime(time)
      },
      onSetLivePlayhead: (position) => {
        livePlayhead.value = position
        scheduler.invalidate()
      },
      onSetConfig: (config) => {
        if (config.interactive !== undefined) wsConfig.interactive = config.interactive
        if (config.duration !== undefined) wsConfig.duration = config.duration
      },
      onGetState: (requestId) => {
        const { tracks, trackOrder } = coreToTrackData(core.tracksById, core.orderedTrackIds)
        wsController.value?.sendStateResponse(
          currentTime.value,
          core.duration,
          windowStart.value,
          windowEnd.value,
          tracks,
          trackOrder,
          requestId
        )
      }
    })
    wsController.value.connect()
  }
})

onUnmounted(() => {
  wsController.value?.disconnect()
  resizeObserver?.disconnect()
  resizeObserver = null
})

function toggleMode() {
  mode.value = mode.value === 'view' ? 'edit' : 'view'
  // Refresh track IDs when switching back to view mode
  if (mode.value === 'view') {
    trackIds.value = [...core.orderedTrackIds]
    scheduler.invalidate()
  }
}

function onWindowChange() {
  scheduler.invalidate()
}

// Exposed API
function addTrack(def: TrackDef, options?: { suppressWsUpdate?: boolean }): boolean {
  const result = core.addTrack(def)
  if (result) {
    // Update reactive trackIds
    trackIds.value = [...core.orderedTrackIds]
    // Update window end if duration changed
    windowEnd.value = core.duration
    // Send WebSocket update unless suppressed
    if (!options?.suppressWsUpdate) {
      sendTracksUpdate('tracks')
    }
  }
  return result
}

function scrubToTime(t: number): void {
  core.scrubToTime(t)
  currentTime.value = t
}

function jumpToTime(t: number): void {
  core.jumpToTime(t)
  currentTime.value = t
}

function setWindowRange(start: number, end: number): void {
  windowStart.value = start
  windowEnd.value = end
  scheduler.invalidate()
}

defineExpose({
  addTrack,
  scrubToTime,
  jumpToTime,
  setWindowRange,
  core,
  mode,
})
</script>

<template>
  <div class="animation-editor">
    <!-- Mode toggle header -->
    <div class="mode-header">
      <button class="mode-toggle" @click="toggleMode">
        {{ mode === 'view' ? 'Switch to Edit Mode' : 'Switch to View Mode' }}
      </button>
      <span class="mode-label">{{ mode === 'view' ? 'View Mode' : 'Edit Mode' }}</span>
    </div>

    <!-- Time ribbon (always visible, controls zoom/pan) -->
    <TimeRibbon
      :duration="core.duration"
      v-model:window-start="windowStart"
      v-model:window-end="windowEnd"
      :spacer-width="ribbonSpacerWidth"
      @update:window-start="onWindowChange"
      @update:window-end="onWindowChange"
    />

    <!-- View Mode -->
    <template v-if="mode === 'view'">
      <!-- Track list with playhead overlay -->
      <div class="track-list-container" ref="trackListRef">
        <!-- Search row aligned with track names -->
        <div class="search-row">
          <div class="name-column-header">
            <input
              v-model="searchFilter"
              type="text"
              placeholder="Search tracks..."
              class="search-input"
            />
          </div>
        </div>
        <TrackList :track-ids="filteredTrackIds" />
        <Playhead
          :current-time="currentTime"
          :window-start="windowStart"
          :window-end="windowEnd"
          :canvas-width="canvasAreaWidth"
          :left-offset="NAME_COLUMN_WIDTH"
        />
      </div>
    </template>

    <!-- Edit Mode -->
    <EditModeView
      v-else
      :core="core"
      :window-start="windowStart"
      :window-end="windowEnd"
      :current-time="currentTime"
      :initial-enabled-track-ids="selectedTrackIdsForEdit"
    />

    <!-- Toast notifications -->
    <ToastContainer />
  </div>
</template>

<style scoped>
.animation-editor {
  display: flex;
  flex-direction: column;
  background: #121416;
  color: #c8c8c8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  height: 100%;
  overflow: hidden;
}

.mode-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #0e1012;
  border-bottom: 1px solid #2a2d30;
}

.mode-toggle {
  padding: 6px 14px;
  background: #3a7ca5;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.mode-toggle:hover {
  background: #4a8cb5;
}

.mode-label {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 500;
}

.search-row {
  display: flex;
  position: sticky;
  top: 0;
  z-index: 5;
  background: #141618;
}

.name-column-header {
  width: v-bind('NAME_COLUMN_WIDTH + "px"');
  min-width: v-bind('NAME_COLUMN_WIDTH + "px"');
  padding: 6px 8px;
  box-sizing: border-box;
  background: #141618;
  border-bottom: 1px solid #2a2d30;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  background: #1a1c20;
  border: 1px solid #2a2d30;
  border-radius: 4px;
  color: #c8c8c8;
  font-size: 12px;
  transition: border-color 0.15s ease;
}

.search-input:focus {
  outline: none;
  border-color: #3a7ca5;
}

.search-input::placeholder {
  color: #555;
}

.track-list-container {
  flex: 1;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
