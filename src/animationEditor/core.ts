/**
 * Animation Editor Core
 * Non-reactive state management and track evaluation logic
 */

import type {
  TrackDef,
  TrackRuntime,
  FuncElement,
  TrackElement,
  NumberElement,
  EnumElement,
  FuncElementData,
  WorldSnapshot,
  TrackSnapshot,
  DragPreviewState,
} from './types'
import { DEFAULT_NUMBER_LOW, DEFAULT_NUMBER_HIGH, DEFAULT_TIMELINE_DURATION, TIME_COLLISION_EPS } from './constants'
import { upperBound, lerp, clamp } from './utils'

let trackIdCounter = 0
let elementIdCounter = 0

function generateTrackId(): string {
  return `track_${++trackIdCounter}`
}

function generateElementId(): string {
  return `elem_${++elementIdCounter}`
}

export class Core {
  tracksByName: Map<string, TrackRuntime> = new Map()
  tracksById: Map<string, TrackRuntime> = new Map()
  orderedTrackIds: string[] = []
  currentTime: number = 0
  lastTime: number = 0
  duration: number

  // Undo/redo stacks
  undoStack: WorldSnapshot[] = []
  redoStack: WorldSnapshot[] = []

  // Drag preview for live callbacks
  dragPreview: DragPreviewState | null = null

  private onInvalidate: (() => void) | null = null

  constructor(duration?: number) {
    this.duration = duration ?? DEFAULT_TIMELINE_DURATION
  }

  /**
   * Set the invalidation callback (called when rendering should update)
   */
  setInvalidateCallback(cb: () => void): void {
    this.onInvalidate = cb
  }

  private invalidate(): void {
    this.onInvalidate?.()
  }

  // ===========================================================================
  // Track Management
  // ===========================================================================

  /**
   * Add a track to the editor
   * Returns false if track name already exists
   */
  addTrack(def: TrackDef): boolean {
    if (this.tracksByName.has(def.name)) {
      console.warn(`Track "${def.name}" already exists`)
      return false
    }

    // Sort data by time (stable sort preserves insertion order for equal times)
    const sortedData = [...def.data].sort((a, b) => a.time - b.time)

    // Build element data with IDs
    const elementData: TrackElement[] = []
    const times: number[] = []
    const elements: (number | string | FuncElement)[] = []

    for (const datum of sortedData) {
      const id = generateElementId()
      times.push(datum.time)
      elements.push(datum.element)

      if (def.fieldType === 'number') {
        elementData.push({ id, time: datum.time, value: datum.element as number })
      } else if (def.fieldType === 'enum') {
        elementData.push({ id, time: datum.time, value: datum.element as string })
      } else {
        elementData.push({ id, time: datum.time, value: datum.element as FuncElement })
      }
    }

    // Determine low/high bounds for number tracks
    const low = def.low ?? DEFAULT_NUMBER_LOW
    const high = def.high ?? DEFAULT_NUMBER_HIGH

    const id = generateTrackId()
    const runtime: TrackRuntime = {
      id,
      def,
      times,
      elements,
      elementData,
      low,
      high,
    }

    this.tracksByName.set(def.name, runtime)
    this.tracksById.set(id, runtime)
    this.orderedTrackIds.push(id)

    // Update duration if needed
    if (times.length > 0) {
      const maxTime = times[times.length - 1]
      if (maxTime + 1 > this.duration) {
        this.duration = maxTime + 1
      }
    }

    this.invalidate()
    return true
  }

  /**
   * Delete a track by ID
   */
  deleteTrack(trackId: string): boolean {
    const track = this.tracksById.get(trackId)
    if (!track) return false

    this.tracksByName.delete(track.def.name)
    this.tracksById.delete(trackId)
    this.orderedTrackIds = this.orderedTrackIds.filter(id => id !== trackId)

    this.invalidate()
    return true
  }

  /**
   * Get a track by name
   */
  getTrack(name: string): TrackRuntime | undefined {
    return this.tracksByName.get(name)
  }

  /**
   * Get a track by ID
   */
  getTrackById(id: string): TrackRuntime | undefined {
    return this.tracksById.get(id)
  }

  /**
   * Get all tracks in order
   */
  getOrderedTracks(): TrackRuntime[] {
    return this.orderedTrackIds
      .map(id => this.getTrackById(id))
      .filter((t): t is TrackRuntime => t !== undefined)
  }

  /**
   * Get tracks by type
   */
  getTracksByType(fieldType: 'number' | 'enum' | 'func'): TrackRuntime[] {
    return this.getOrderedTracks().filter(t => t.def.fieldType === fieldType)
  }

  // ===========================================================================
  // Element Editing
  // ===========================================================================

  /**
   * Rebuild parallel arrays from elementData (call after editing)
   */
  private rebuildArrays(track: TrackRuntime): void {
    // Sort by time
    track.elementData.sort((a, b) => a.time - b.time)

    // Rebuild parallel arrays
    track.times = []
    track.elements = []

    for (const elem of track.elementData) {
      track.times.push(elem.time)
      if (track.def.fieldType === 'number') {
        track.elements.push((elem as NumberElement).value)
      } else if (track.def.fieldType === 'enum') {
        track.elements.push((elem as EnumElement).value)
      } else {
        track.elements.push((elem as FuncElementData).value)
      }
    }
  }

  /**
   * Add a number element
   */
  addNumberElement(trackId: string, time: number, value: number): string | null {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'number') return null

    const id = generateElementId()
    const elem: NumberElement = { id, time, value: clamp(value, track.low, track.high) }
    track.elementData.push(elem)
    this.rebuildArrays(track)
    this.invalidate()
    return id
  }

  /**
   * Add an enum element
   */
  addEnumElement(trackId: string, time: number): string | null {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'enum') return null

    // Get first enum option from existing data
    const options = this.getEnumOptions(trackId)
    const value = options[0] || ''

    // Check for collision
    const resolvedTime = this.resolveTimeCollision(track, time, null)

    const id = generateElementId()
    const elem: EnumElement = { id, time: resolvedTime, value }
    track.elementData.push(elem)
    this.rebuildArrays(track)
    this.invalidate()
    return id
  }

  /**
   * Add a func element
   */
  addFuncElement(trackId: string, time: number): string | null {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'func') return null

    // Check for collision
    const resolvedTime = this.resolveTimeCollision(track, time, null)

    const id = generateElementId()
    const elem: FuncElementData = {
      id,
      time: resolvedTime,
      value: { funcName: 'func', args: [] },
    }
    track.elementData.push(elem)
    this.rebuildArrays(track)
    this.invalidate()
    return id
  }

  /**
   * Delete an element
   */
  deleteElement(trackId: string, elementId: string): boolean {
    const track = this.tracksById.get(trackId)
    if (!track) return false

    const idx = track.elementData.findIndex(e => e.id === elementId)
    if (idx === -1) return false

    track.elementData.splice(idx, 1)
    this.rebuildArrays(track)
    this.invalidate()
    return true
  }

  /**
   * Update a number element
   */
  updateNumberElement(trackId: string, elementId: string, time: number, value: number): boolean {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'number') return false

    const elem = track.elementData.find(e => e.id === elementId) as NumberElement | undefined
    if (!elem) return false

    elem.time = time
    elem.value = clamp(value, track.low, track.high)
    this.rebuildArrays(track)
    this.invalidate()
    return true
  }

  /**
   * Update an enum element
   */
  updateEnumElement(trackId: string, elementId: string, time: number, value?: string): { success: boolean; collision: boolean } {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'enum') return { success: false, collision: false }

    const elem = track.elementData.find(e => e.id === elementId) as EnumElement | undefined
    if (!elem) return { success: false, collision: false }

    // Resolve collision
    const resolvedTime = this.resolveTimeCollision(track, time, elementId)
    const collision = resolvedTime !== time

    elem.time = resolvedTime
    if (value !== undefined) elem.value = value
    this.rebuildArrays(track)
    this.invalidate()
    return { success: true, collision }
  }

  /**
   * Update a func element
   */
  updateFuncElement(
    trackId: string,
    elementId: string,
    time: number,
    funcName?: string,
    args?: unknown[]
  ): { success: boolean; collision: boolean } {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'func') return { success: false, collision: false }

    const elem = track.elementData.find(e => e.id === elementId) as FuncElementData | undefined
    if (!elem) return { success: false, collision: false }

    // Resolve collision
    const resolvedTime = this.resolveTimeCollision(track, time, elementId)
    const collision = resolvedTime !== time

    elem.time = resolvedTime
    if (funcName !== undefined) elem.value.funcName = funcName
    if (args !== undefined) elem.value.args = args
    this.rebuildArrays(track)
    this.invalidate()
    return { success: true, collision }
  }

  /**
   * Set track bounds (for number tracks)
   */
  setTrackBounds(trackId: string, low: number, high: number): boolean {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'number') return false

    track.low = low
    track.high = high

    // Clamp existing values
    for (const elem of track.elementData as NumberElement[]) {
      elem.value = clamp(elem.value, low, high)
    }

    this.rebuildArrays(track)
    this.invalidate()
    return true
  }

  /**
   * Resolve time collision for enum/func tracks
   * Returns a time that doesn't collide with other elements
   */
  private resolveTimeCollision(track: TrackRuntime, time: number, excludeElementId: string | null): number {
    let resolved = time
    let attempts = 0
    const maxAttempts = 100

    while (attempts < maxAttempts) {
      let collision = false
      for (const elem of track.elementData) {
        if (excludeElementId && elem.id === excludeElementId) continue
        if (Math.abs(elem.time - resolved) < TIME_COLLISION_EPS) {
          collision = true
          resolved = elem.time + TIME_COLLISION_EPS
          break
        }
      }
      if (!collision) break
      attempts++
    }

    return Math.max(0, resolved)
  }

  /**
   * Get enum options from track data
   */
  getEnumOptions(trackId: string): string[] {
    const track = this.tracksById.get(trackId)
    if (!track || track.def.fieldType !== 'enum') return []

    const values = new Set<string>()
    for (const elem of track.elementData as EnumElement[]) {
      values.add(elem.value)
    }
    return Array.from(values)
  }

  /**
   * Get an element by ID
   */
  getElement(trackId: string, elementId: string): TrackElement | undefined {
    const track = this.tracksById.get(trackId)
    if (!track) return undefined
    return track.elementData.find(e => e.id === elementId)
  }

  // ===========================================================================
  // Undo/Redo
  // ===========================================================================

  /**
   * Create a snapshot of current world state
   */
  createSnapshot(): WorldSnapshot {
    const tracks: TrackSnapshot[] = []

    for (const track of this.tracksById.values()) {
      tracks.push({
        id: track.id,
        name: track.def.name,
        fieldType: track.def.fieldType,
        elementData: JSON.parse(JSON.stringify(track.elementData)),
        low: track.low,
        high: track.high,
      })
    }

    return {
      tracks,
      trackOrder: [...this.orderedTrackIds],
    }
  }

  /**
   * Push current state to undo stack
   */
  pushSnapshot(): void {
    this.undoStack.push(this.createSnapshot())
    this.redoStack = [] // Clear redo on new action
  }

  /**
   * Restore from a snapshot
   */
  restoreSnapshot(snapshot: WorldSnapshot): void {
    // Restore track data
    for (const trackSnap of snapshot.tracks) {
      const track = this.tracksById.get(trackSnap.id)
      if (track) {
        track.elementData = JSON.parse(JSON.stringify(trackSnap.elementData))
        track.low = trackSnap.low
        track.high = trackSnap.high
        this.rebuildArrays(track)
      }
    }

    this.orderedTrackIds = [...snapshot.trackOrder]
    this.invalidate()
  }

  /**
   * Undo last action
   */
  undo(): boolean {
    if (this.undoStack.length === 0) return false

    // Save current state to redo
    this.redoStack.push(this.createSnapshot())

    // Restore previous state
    const snapshot = this.undoStack.pop()!
    this.restoreSnapshot(snapshot)
    return true
  }

  /**
   * Redo last undone action
   */
  redo(): boolean {
    if (this.redoStack.length === 0) return false

    // Save current state to undo
    this.undoStack.push(this.createSnapshot())

    // Restore next state
    const snapshot = this.redoStack.pop()!
    this.restoreSnapshot(snapshot)
    return true
  }

  // ===========================================================================
  // Drag Preview (for live callbacks)
  // ===========================================================================

  /**
   * Set drag preview state
   */
  setDragPreview(preview: DragPreviewState | null): void {
    this.dragPreview = preview
  }

  // ===========================================================================
  // Evaluation
  // ===========================================================================

  /**
   * Evaluate a number track at a given time
   * Optionally applies drag preview override
   */
  evaluateNumberTrack(track: TrackRuntime, t: number): number {
    let times = track.times
    let elements = track.elements

    // Apply drag preview if applicable
    if (
      this.dragPreview &&
      this.dragPreview.fieldType === 'number' &&
      this.dragPreview.trackId === track.id
    ) {
      // Find the element and create modified arrays
      const idx = track.elementData.findIndex(e => e.id === this.dragPreview!.elementId)
      if (idx !== -1) {
        times = [...track.times]
        elements = [...track.elements]
        times[idx] = this.dragPreview.time
        elements[idx] = this.dragPreview.value!

        // Re-sort if needed (simple bubble for single element)
        const sortedIndices = times.map((_, i) => i).sort((a, b) => times[a] - times[b])
        times = sortedIndices.map(i => times[i])
        elements = sortedIndices.map(i => elements[i])
      }
    }

    const { low, high } = track
    const n = times.length

    if (n === 0) return low

    const r = upperBound(times, t)
    const i1 = r - 1
    const i2 = r

    let value: number
    if (i1 < 0) {
      value = elements[0] as number
    } else if (i2 >= n) {
      value = elements[i1] as number
    } else {
      const t1 = times[i1]
      const t2 = times[i2]
      const v1 = elements[i1] as number
      const v2 = elements[i2] as number
      const alpha = (t - t1) / (t2 - t1)
      value = lerp(v1, v2, alpha)
    }

    return clamp(value, low, high)
  }

  /**
   * Evaluate an enum track at a given time
   * Optionally applies drag preview override
   */
  evaluateEnumTrack(track: TrackRuntime, t: number): string {
    let times = track.times
    let elements = track.elements

    // Apply drag preview if applicable
    if (
      this.dragPreview &&
      this.dragPreview.fieldType === 'enum' &&
      this.dragPreview.trackId === track.id
    ) {
      const idx = track.elementData.findIndex(e => e.id === this.dragPreview!.elementId)
      if (idx !== -1) {
        times = [...track.times]
        elements = [...track.elements]
        times[idx] = this.dragPreview.time

        // Re-sort
        const sortedIndices = times.map((_, i) => i).sort((a, b) => times[a] - times[b])
        times = sortedIndices.map(i => times[i])
        elements = sortedIndices.map(i => elements[i])
      }
    }

    const n = times.length
    if (n === 0) return ''

    const i = upperBound(times, t) - 1
    if (i < 0) {
      return elements[0] as string
    }
    return elements[i] as string
  }

  /**
   * Fire func callbacks for hits in the range (lastTime, t]
   */
  private fireFuncHits(track: TrackRuntime, fromTime: number, toTime: number): void {
    if (toTime <= fromTime) return
    if (!track.def.updateFunc) return

    const { times, elements } = track
    const start = upperBound(times, fromTime)
    const end = upperBound(times, toTime)

    for (let i = start; i < end; i++) {
      const hit = elements[i] as FuncElement
      track.def.updateFunc(hit.funcName, ...hit.args)
    }
  }

  /**
   * Scrub to a specific time
   */
  scrubToTime(t: number): void {
    this.currentTime = t

    for (const track of this.tracksByName.values()) {
      switch (track.def.fieldType) {
        case 'number':
          if (track.def.updateNumber) {
            const value = this.evaluateNumberTrack(track, t)
            track.def.updateNumber(value)
          }
          break

        case 'enum':
          if (track.def.updateEnum) {
            const value = this.evaluateEnumTrack(track, t)
            track.def.updateEnum(value)
          }
          break

        case 'func':
          this.fireFuncHits(track, this.lastTime, t)
          break
      }
    }

    this.lastTime = t
    this.invalidate()
  }

  /**
   * Evaluate callbacks at current time (for drag preview updates)
   */
  evaluateAtCurrentTime(): void {
    for (const track of this.tracksByName.values()) {
      switch (track.def.fieldType) {
        case 'number':
          if (track.def.updateNumber) {
            const value = this.evaluateNumberTrack(track, this.currentTime)
            track.def.updateNumber(value)
          }
          break

        case 'enum':
          if (track.def.updateEnum) {
            const value = this.evaluateEnumTrack(track, this.currentTime)
            track.def.updateEnum(value)
          }
          break
        // Don't fire func during drag
      }
    }
  }

  /**
   * Jump to a specific time without firing callbacks
   */
  jumpToTime(t: number): void {
    this.currentTime = t
    this.lastTime = t
    this.invalidate()
  }
}
