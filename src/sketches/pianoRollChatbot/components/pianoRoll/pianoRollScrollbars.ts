import type { Ref } from 'vue'
import type { PianoRollState } from './pianoRollState'
import { MIN_HORIZONTAL_SPAN, MIN_VERTICAL_SPAN, TOTAL_PITCHES } from './pianoRollConstants'
import { clamp, getStageHeight, getStageWidth } from './pianoRollViewport'

export type HorizontalDragMode = 'move' | 'resize-start' | 'resize-end'
export type VerticalDragMode = 'move' | 'resize-start' | 'resize-end'

export interface HorizontalDragState {
  mode: HorizontalDragMode
  pointerId: number
  pointerStart: number
  trackRect: DOMRect
  startQuarter: number
  endQuarter: number
  anchorQuarter: number
  spanQuarter: number
  stageWidth: number
  pointerOffset: number
}

export interface VerticalDragState {
  mode: VerticalDragMode
  pointerId: number
  pointerStart: number
  trackRect: DOMRect
  topIndex: number
  bottomIndex: number
  anchorIndex: number
  span: number
  stageHeight: number
  pointerOffset: number
}

export interface HorizontalScrollbarOptions {
  state: PianoRollState
  horizontalTrack: Ref<HTMLDivElement | undefined>
  isInteractive: () => boolean
  getViewportRange: () => { startQuarter: number, endQuarter: number }
  applyHorizontalZoom: (newQuarterNoteWidth: number, newStartQuarter: number) => void
  enforceScrollBounds: () => void
  notifyViewportChange: () => void
  getFallbackWidth: () => number
}

export interface VerticalScrollbarOptions {
  state: PianoRollState
  verticalTrack: Ref<HTMLDivElement | undefined>
  isInteractive: () => boolean
  getViewportRange: () => { topIndex: number, bottomIndex: number }
  applyVerticalZoom: (newNoteHeight: number, newTopIndex: number) => void
  enforceScrollBounds: () => void
  notifyViewportChange: () => void
  getFallbackHeight: () => number
}

export class HorizontalScrollbarController {
  private dragState: HorizontalDragState | null = null

  constructor(private readonly options: HorizontalScrollbarOptions) {}

  getThumbMetrics = () => {
    const totalQuarter = this.options.state.grid.maxLength
    if (totalQuarter <= 0) return { start: 0, size: 1 }

    const quarterNoteWidth = this.options.state.grid.quarterNoteWidth
    const stageWidth = getStageWidth(this.options.state, this.options.getFallbackWidth())
    if (quarterNoteWidth <= 0 || stageWidth <= 0) return { start: 0, size: 1 }

    const startQuarter = this.options.state.viewport.scrollX / quarterNoteWidth
    const visibleSpanQuarter = stageWidth / quarterNoteWidth

    const normalizedSize = Math.min(1, visibleSpanQuarter / totalQuarter)
    if (normalizedSize >= 1) {
      return { start: 0, size: 1 }
    }

    const normalizedStart = startQuarter / totalQuarter
    const clampedStart = clamp(normalizedStart, 0, 1 - normalizedSize)

    return { start: clampedStart, size: normalizedSize }
  }

  getThumbStyle = () => {
    const { start, size } = this.getThumbMetrics()
    const clampedSize = clamp(size, 0, 1)
    const width = Math.min(1, Math.max(clampedSize, 0.01))
    const left = clamp(start, 0, 1 - width)
    return {
      left: `${left * 100}%`,
      width: `${width * 100}%`
    }
  }

  startDrag = (mode: HorizontalDragMode, event: PointerEvent) => {
    if (!this.options.isInteractive()) return
    const track = this.options.horizontalTrack.value
    if (!track) return

    this.stopDrag()

    const trackRect = track.getBoundingClientRect()
    if (trackRect.width <= 0) return

    const { startQuarter, endQuarter } = this.options.getViewportRange()
    const spanQuarter = Math.max(MIN_HORIZONTAL_SPAN, endQuarter - startQuarter)
    const stageWidth = getStageWidth(this.options.state, this.options.getFallbackWidth())
    const totalQuarter = this.options.state.grid.maxLength
    if (stageWidth <= 0 || totalQuarter <= 0) return

    const startNormalized = startQuarter / totalQuarter
    const endNormalized = endQuarter / totalQuarter
    let pointerOffset = 0
    if (mode === 'resize-start') {
      pointerOffset = event.clientX - (trackRect.left + startNormalized * trackRect.width)
    } else if (mode === 'resize-end') {
      pointerOffset = event.clientX - (trackRect.left + endNormalized * trackRect.width)
    }

    this.dragState = {
      mode,
      pointerId: event.pointerId,
      pointerStart: event.clientX,
      trackRect,
      startQuarter,
      endQuarter,
      anchorQuarter: mode === 'resize-start' ? endQuarter : startQuarter,
      spanQuarter,
      stageWidth,
      pointerOffset
    }

    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.stopDrag)

    event.preventDefault()
  }

  stopDrag = () => {
    if (!this.dragState) return
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.stopDrag)
    this.dragState = null
  }

  handlePointerMove = (event: PointerEvent) => {
    const drag = this.dragState
    if (!drag || event.pointerId !== drag.pointerId) return

    const totalQuarter = this.options.state.grid.maxLength
    const trackRect = drag.trackRect
    if (totalQuarter <= 0 || trackRect.width <= 0 || drag.stageWidth <= 0) return

    event.preventDefault()

    if (drag.mode === 'move') {
      const deltaPx = event.clientX - drag.pointerStart
      const deltaQuarter = (deltaPx / trackRect.width) * totalQuarter
      const maxStartQuarter = Math.max(0, totalQuarter - drag.spanQuarter)
      const newStartQuarter = clamp(drag.startQuarter + deltaQuarter, 0, maxStartQuarter)

      this.options.state.viewport.scrollX = newStartQuarter * this.options.state.grid.quarterNoteWidth
      this.options.enforceScrollBounds()
      this.options.state.needsRedraw = true
      this.options.notifyViewportChange()
      return
    }

    const rawX = clamp(event.clientX, trackRect.left, trackRect.right)
    const adjustedX = clamp(rawX - drag.pointerOffset, trackRect.left, trackRect.right)
    const norm = (adjustedX - trackRect.left) / trackRect.width

    if (drag.mode === 'resize-start') {
      let newStartQuarter = norm * totalQuarter
      const maxStartQuarter = drag.anchorQuarter - MIN_HORIZONTAL_SPAN
      newStartQuarter = clamp(newStartQuarter, 0, Math.max(0, maxStartQuarter))

      const newSpanQuarter = Math.max(MIN_HORIZONTAL_SPAN, drag.anchorQuarter - newStartQuarter)
      const newQuarterNoteWidth = drag.stageWidth / newSpanQuarter
      this.options.applyHorizontalZoom(newQuarterNoteWidth, newStartQuarter)

      drag.startQuarter = newStartQuarter
      drag.spanQuarter = newSpanQuarter
      return
    }

    if (drag.mode === 'resize-end') {
      let newEndQuarter = norm * totalQuarter
      const minEndQuarter = drag.anchorQuarter + MIN_HORIZONTAL_SPAN
      newEndQuarter = clamp(newEndQuarter, Math.min(minEndQuarter, totalQuarter), totalQuarter)

      const newSpanQuarter = Math.max(MIN_HORIZONTAL_SPAN, newEndQuarter - drag.anchorQuarter)
      const newQuarterNoteWidth = drag.stageWidth / newSpanQuarter
      this.options.applyHorizontalZoom(newQuarterNoteWidth, drag.anchorQuarter)

      drag.endQuarter = newEndQuarter
      drag.spanQuarter = newSpanQuarter
    }
  }

  onTrackPointerDown = (event: PointerEvent) => {
    if (!this.options.isInteractive()) return
    const track = this.options.horizontalTrack.value
    if (!track) return

    const trackRect = track.getBoundingClientRect()
    if (trackRect.width <= 0) return

    const norm = clamp((event.clientX - trackRect.left) / trackRect.width, 0, 1)
    const { startQuarter, endQuarter } = this.options.getViewportRange()
    const spanQuarter = Math.max(MIN_HORIZONTAL_SPAN, endQuarter - startQuarter)
    const totalQuarter = this.options.state.grid.maxLength
    const maxStartQuarter = Math.max(0, totalQuarter - spanQuarter)
    const targetStartQuarter = clamp(norm * totalQuarter - spanQuarter / 2, 0, maxStartQuarter)

    this.options.state.viewport.scrollX = targetStartQuarter * this.options.state.grid.quarterNoteWidth
    this.options.enforceScrollBounds()
    this.options.state.needsRedraw = true
    this.options.notifyViewportChange()
  }
}

export class VerticalScrollbarController {
  private dragState: VerticalDragState | null = null

  constructor(private readonly options: VerticalScrollbarOptions) {}

  getThumbMetrics = () => {
    const total = TOTAL_PITCHES
    if (total <= 0) return { start: 0, size: 1 }

    const noteHeight = this.options.state.grid.noteHeight
    const stageHeight = getStageHeight(this.options.state, this.options.getFallbackHeight())
    if (noteHeight <= 0 || stageHeight <= 0) return { start: 0, size: 1 }

    const topIndex = this.options.state.viewport.scrollY / noteHeight
    const visibleSpan = stageHeight / noteHeight

    const normalizedSize = Math.min(1, visibleSpan / total)
    if (normalizedSize >= 1) {
      return { start: 0, size: 1 }
    }

    const normalizedStart = topIndex / total
    const clampedStart = clamp(normalizedStart, 0, 1 - normalizedSize)

    return { start: clampedStart, size: normalizedSize }
  }

  getThumbStyle = () => {
    const { start, size } = this.getThumbMetrics()
    const clampedSize = clamp(size, 0, 1)
    const height = Math.min(1, Math.max(clampedSize, 0.01))
    const top = clamp(start, 0, 1 - height)
    return {
      top: `${top * 100}%`,
      height: `${height * 100}%`
    }
  }

  startDrag = (mode: VerticalDragMode, event: PointerEvent) => {
    if (!this.options.isInteractive()) return
    const track = this.options.verticalTrack.value
    if (!track) return

    this.stopDrag()

    const trackRect = track.getBoundingClientRect()
    if (trackRect.height <= 0) return

    const { topIndex, bottomIndex } = this.options.getViewportRange()
    const span = Math.max(MIN_VERTICAL_SPAN, bottomIndex - topIndex)
    const stageHeight = getStageHeight(this.options.state, this.options.getFallbackHeight())
    if (stageHeight <= 0) return

    const topNormalized = topIndex / TOTAL_PITCHES
    const bottomNormalized = bottomIndex / TOTAL_PITCHES
    let pointerOffset = 0
    if (mode === 'resize-start') {
      pointerOffset = event.clientY - (trackRect.top + topNormalized * trackRect.height)
    } else if (mode === 'resize-end') {
      pointerOffset = event.clientY - (trackRect.top + bottomNormalized * trackRect.height)
    }

    this.dragState = {
      mode,
      pointerId: event.pointerId,
      pointerStart: event.clientY,
      trackRect,
      topIndex,
      bottomIndex,
      anchorIndex: mode === 'resize-start' ? bottomIndex : topIndex,
      span,
      stageHeight,
      pointerOffset
    }

    window.addEventListener('pointermove', this.handlePointerMove)
    window.addEventListener('pointerup', this.stopDrag)

    event.preventDefault()
  }

  stopDrag = () => {
    if (!this.dragState) return
    window.removeEventListener('pointermove', this.handlePointerMove)
    window.removeEventListener('pointerup', this.stopDrag)
    this.dragState = null
  }

  handlePointerMove = (event: PointerEvent) => {
    const drag = this.dragState
    if (!drag || event.pointerId !== drag.pointerId) return

    const trackRect = drag.trackRect
    if (trackRect.height <= 0 || drag.stageHeight <= 0) return

    event.preventDefault()

    if (drag.mode === 'move') {
      const deltaPx = event.clientY - drag.pointerStart
      const deltaIndex = (deltaPx / trackRect.height) * TOTAL_PITCHES
      const maxTopIndex = Math.max(0, TOTAL_PITCHES - drag.span)
      const newTopIndex = clamp(drag.topIndex + deltaIndex, 0, maxTopIndex)

      this.options.state.viewport.scrollY = newTopIndex * this.options.state.grid.noteHeight
      this.options.enforceScrollBounds()
      this.options.state.needsRedraw = true
      this.options.notifyViewportChange()
      return
    }

    const rawY = clamp(event.clientY, trackRect.top, trackRect.bottom)
    const adjustedY = clamp(rawY - drag.pointerOffset, trackRect.top, trackRect.bottom)
    const norm = (adjustedY - trackRect.top) / trackRect.height

    if (drag.mode === 'resize-start') {
      let newTopIndex = norm * TOTAL_PITCHES
      const maxTopIndex = drag.anchorIndex - MIN_VERTICAL_SPAN
      newTopIndex = clamp(newTopIndex, 0, Math.max(0, maxTopIndex))

      const newSpan = Math.max(MIN_VERTICAL_SPAN, drag.anchorIndex - newTopIndex)
      const newNoteHeight = drag.stageHeight / newSpan
      this.options.applyVerticalZoom(newNoteHeight, newTopIndex)

      drag.topIndex = newTopIndex
      drag.span = newSpan
      return
    }

    if (drag.mode === 'resize-end') {
      let newBottomIndex = norm * TOTAL_PITCHES
      const minBottomIndex = drag.anchorIndex + MIN_VERTICAL_SPAN
      newBottomIndex = clamp(newBottomIndex, Math.min(minBottomIndex, TOTAL_PITCHES), TOTAL_PITCHES)

      const newSpan = Math.max(MIN_VERTICAL_SPAN, newBottomIndex - drag.anchorIndex)
      const newNoteHeight = drag.stageHeight / newSpan
      this.options.applyVerticalZoom(newNoteHeight, drag.anchorIndex)

      drag.bottomIndex = newBottomIndex
      drag.span = newSpan
    }
  }

  onTrackPointerDown = (event: PointerEvent) => {
    if (!this.options.isInteractive()) return
    const track = this.options.verticalTrack.value
    if (!track) return

    const trackRect = track.getBoundingClientRect()
    if (trackRect.height <= 0) return

    const norm = clamp((event.clientY - trackRect.top) / trackRect.height, 0, 1)
    const { topIndex, bottomIndex } = this.options.getViewportRange()
    const span = Math.max(MIN_VERTICAL_SPAN, bottomIndex - topIndex)
    const maxTopIndex = Math.max(0, TOTAL_PITCHES - span)
    const targetTopIndex = clamp(norm * TOTAL_PITCHES - span / 2, 0, maxTopIndex)

    this.options.state.viewport.scrollY = targetTopIndex * this.options.state.grid.noteHeight
    this.options.enforceScrollBounds()
    this.options.state.needsRedraw = true
    this.options.notifyViewportChange()
  }
}
