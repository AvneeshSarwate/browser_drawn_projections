<!-- eslint-disable vue/multi-word-component-names -->
<template>
  <div class="timeline-container">
    <div class="timeline-controls">
      <button @click="play" :disabled="isPlaying">▶️</button>
      <button @click="pause" :disabled="!isPlaying">⏸️</button>
      <button @click="stop">⏹️</button>
      <span class="time-display">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
    </div>
    <div
      ref="timelineTrackRef"
      class="timeline-track"
      @click="seek"
      @mousedown="startDrag"
    >
      <div class="timeline-progress" :style="{ width: progressPercentage + '%' }"></div>
      <div class="timeline-playhead" 
        :style="{ left: progressPercentage + '%' }"
        @mousedown.stop="startDrag"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { startAnimationLoop, type AnimationLoopHandle } from './animationLoop'

interface Props {
  strokes: Map<string, any>
  selectedStrokes: Set<string>
  useRealTiming: boolean
  maxInterStrokeDelay: number
  overrideDuration?: number
  lockWhileAnimating?: (animating: boolean) => void
}

const props = defineProps<Props>()

const emit = defineEmits<{
  timeUpdate: [time: number]
}>()

const currentTime = ref(0)
const duration = ref(0)
const isPlaying = ref(false)
const timelineTrackRef = ref<HTMLElement | null>(null)
let animationLoop: AnimationLoopHandle | undefined
let startTime = 0
let dragRect: DOMRect | null = null

// Calculate total duration based on strokes
const calculateDuration = () => {
  // Use override duration if provided, otherwise calculate from strokes
  if (props.overrideDuration !== undefined) {
    duration.value = props.overrideDuration
  } else {
    let totalDuration = 0
    const strokesToAnimate: any[] = []
    
    if (props.selectedStrokes.size > 0) {
      // Get selected strokes in order
      props.selectedStrokes.forEach(strokeId => {
        const stroke = props.strokes.get(strokeId)
        if (stroke) strokesToAnimate.push(stroke)
      })
      
      // Sort by creation time (assuming stroke IDs contain timestamps)
      strokesToAnimate.sort((a, b) => {
        const timeA = parseInt(a.id.split('-')[1] || '0')
        const timeB = parseInt(b.id.split('-')[1] || '0')
        return timeA - timeB
      })
      
      // Calculate duration with 0.1s gaps between non-contiguous strokes
      strokesToAnimate.forEach((stroke, index) => {
        if (stroke.timestamps && stroke.timestamps.length > 0) {
          const strokeDuration = stroke.timestamps[stroke.timestamps.length - 1] || 0
          totalDuration += strokeDuration
          
          // Add gap between strokes (except after the last one)
          if (index < strokesToAnimate.length - 1) {
            totalDuration += 100 // 0.1 seconds = 100ms
          }
        }
      })
    } else {
      // Calculate duration for all strokes with original gaps
      const allStrokes = Array.from(props.strokes.values())
      allStrokes.sort((a, b) => {
        const timeA = parseInt(a.id.split('-')[1] || '0')
        const timeB = parseInt(b.id.split('-')[1] || '0')
        return timeA - timeB
      })
      
      let lastEndTime = 0
      allStrokes.forEach((stroke, index) => {
        if (stroke.timestamps && stroke.timestamps.length > 0) {
          const strokeStartTime = stroke.creationTime || parseInt(stroke.id.split('-')[1] || '0')
          const strokeDuration = stroke.timestamps[stroke.timestamps.length - 1] || 0
          
          if (index === 0) {
            totalDuration = strokeDuration
            lastEndTime = strokeStartTime + strokeDuration
          } else {
            // Gap is between end of previous stroke and start of current stroke
            let gap = Math.max(0, strokeStartTime - lastEndTime)
            // Apply max threshold if not using real timing
            if (!props.useRealTiming && gap > props.maxInterStrokeDelay) {
              gap = props.maxInterStrokeDelay
            }
            totalDuration += gap + strokeDuration
            lastEndTime = strokeStartTime + strokeDuration
          }
        }
      })
    }
    
    duration.value = totalDuration
  }
  
  // Reset current time if it's beyond the new duration
  if (duration.value > 0 && currentTime.value > duration.value) {
    currentTime.value = 0
    emit('timeUpdate', 0)
  }
}

// Watch for changes in strokes, selection, timing mode, or override duration
watch([() => props.strokes, () => props.selectedStrokes, () => props.useRealTiming, () => props.maxInterStrokeDelay, () => props.overrideDuration], () => {
  calculateDuration()
}, { immediate: true, deep: true })

const progressPercentage = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  const milliseconds = Math.floor((ms % 1000) / 10)
  return `${seconds}.${milliseconds.toString().padStart(2, '0')}s`
}

const play = () => {
  if (isPlaying.value || duration.value === 0) return

  isPlaying.value = true
  props.lockWhileAnimating?.(true) // Lock UI during animation
  startTime = performance.now() - currentTime.value

  animationLoop = startAnimationLoop(() => {
    if (!isPlaying.value) {
      animationLoop = undefined
      return false
    }

    currentTime.value = performance.now() - startTime

    if (currentTime.value >= duration.value) {
      currentTime.value = 0
      isPlaying.value = false
      props.lockWhileAnimating?.(false) // Unlock UI when animation completes
      emit('timeUpdate', 0)
      animationLoop = undefined
      return false
    }

    emit('timeUpdate', currentTime.value)
    return true
  })
}

const pause = () => {
  isPlaying.value = false

  // Only unlock if timeline is at start position (safe state)
  const isAtStart = currentTime.value === 0
  props.lockWhileAnimating?.(!isAtStart)

  animationLoop?.cancel()
  animationLoop = undefined
}

const stop = () => {
  isPlaying.value = false
  isDragging.value = false // Also stop any ongoing drag
  props.lockWhileAnimating?.(false) // Unlock UI when stopped
  currentTime.value = 0
  animationLoop?.cancel()
  animationLoop = undefined
  emit('timeUpdate', 0)
}

// Dragging state
const isDragging = ref(false)

const updatePosition = (event: MouseEvent) => {
  if (!dragRect) return

  const x = Math.max(0, Math.min(event.clientX - dragRect.left, dragRect.width))
  const percentage = dragRect.width > 0 ? x / dragRect.width : 0
  currentTime.value = percentage * duration.value
  emit('timeUpdate', currentTime.value)
}

const handleMouseMove = (event: MouseEvent) => {
  if (!isDragging.value) return
  updatePosition(event)
}

const handleMouseUp = () => {
  if (!isDragging.value) return

  isDragging.value = false

  // Only unlock if timeline is at start position (safe state)
  const isAtStart = currentTime.value === 0
  props.lockWhileAnimating?.(!isAtStart)

  dragRect = null
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
}

const startDrag = (event: MouseEvent) => {
  event.preventDefault()

  const timelineTrack = timelineTrackRef.value
  if (!timelineTrack) return

  isDragging.value = true
  props.lockWhileAnimating?.(true) // Lock UI during scrubbing

  dragRect = timelineTrack.getBoundingClientRect()

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)

  // Handle initial click position
  updatePosition(event)
}

const seek = (event: MouseEvent) => {
  // Only seek if not dragging (for direct clicks on track)
  if (!isDragging.value) {
    const timelineTrack = event.currentTarget as HTMLElement
    const rect = timelineTrack.getBoundingClientRect()
    const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
    const percentage = x / rect.width
    currentTime.value = percentage * duration.value
    
    // Lock UI when seeking to non-zero position (modifies canvas state)
    const isAtStart = currentTime.value === 0
    props.lockWhileAnimating?.(!isAtStart)
    
    if (isPlaying.value) {
      startTime = performance.now() - currentTime.value
    }
    
    emit('timeUpdate', currentTime.value)
  }
}

onUnmounted(() => {
  animationLoop?.cancel()
  animationLoop = undefined

  // Clean up any ongoing drag state
  if (isDragging.value) {
    isDragging.value = false
    props.lockWhileAnimating?.(false)
  }

  dragRect = null
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
})
</script>

<style scoped>
.timeline-container {
  width: 600px;
  background: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.timeline-controls button {
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 16px;
}

.timeline-controls button:hover:not(:disabled) {
  background: #f0f0f0;
}

.timeline-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.time-display {
  margin-left: auto;
  font-family: monospace;
  font-size: 14px;
  color: #666;
}

.timeline-track {
  position: relative;
  height: 40px;
  background: #f0f0f0;
  border-radius: 4px;
  cursor: pointer;
}

.timeline-progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: #0066ff;
  border-radius: 4px;
}

.timeline-playhead {
  position: absolute;
  top: -5px;
  width: 10px;
  height: 50px;
  background: #0066ff;
  border-radius: 2px;
  transform: translateX(-50%);
  cursor: grab;
  z-index: 10;
}

.timeline-playhead:hover {
  background: #0052cc;
}

.timeline-playhead:active {
  cursor: grabbing;
}
</style>