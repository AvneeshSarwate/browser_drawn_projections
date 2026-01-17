import Konva from 'konva'
import type { PianoRollState, NoteData, MpePitchPoint } from './pianoRollState'
import {
  uid,
  screenToPitchPosition,
  pitchPositionToScreen,
  quantizeToGrid,
  isNoteVisible,
  getNotesInRect,
  updateOverlapPreview,
  clearOverlapPreview,
  executeOverlapChanges,
  getNoteDisplayDuration,
  applySnapToNoteStart,
  getGridUnitWidth,
  midiPitchToString,
  quantize
} from './pianoRollUtils'
import { CommandStack } from './commandStack'

const MPE_PITCH_OFFSET_RANGE = 24
const MPE_FINE_DRAG_FACTOR = 0.2
const MPE_TOOLTIP_OFFSET = { x: 12, y: -14 }

// ================= State Serialization =================

export function captureState(state: PianoRollState): string {
  return JSON.stringify({
    notes: Array.from(state.notes.entries()),
    selection: Array.from(state.selection.selectedIds)
  })
}

export function restoreState(state: PianoRollState, snapshot: string) {
  const data = JSON.parse(snapshot)
  state.notes = new Map(data.notes)
  state.selection.selectedIds = new Set(data.selection)
  state.needsRedraw = true
}

function selectionSetsDiffer(previous: Set<string>, current: Set<string>): boolean {
  if (previous.size !== current.size) return true
  for (const id of previous) {
    if (!current.has(id)) {
      return true
    }
  }
  return false
}

function mutateSelection(state: PianoRollState, mutate: () => void): boolean {
  const before = new Set(state.selection.selectedIds)
  mutate()
  const changed = selectionSetsDiffer(before, state.selection.selectedIds)
  if (changed) {
    state.notifyExternalChange?.('selection')
  }
  return changed
}

// ================= Layer Initialization =================

export function initializeLayers(state: PianoRollState, stage: Konva.Stage, onCommandStackChange?: () => void) {
  // Grid layer (bottom, non-interactive)
  const gridLayer = new Konva.Layer({
    listening: false,
    name: 'grid-layer'
  })
  stage.add(gridLayer)
  state.layers.grid = gridLayer

  // Notes layer (interactive)
  const notesLayer = new Konva.Layer({
    name: 'notes-layer'
  })
  stage.add(notesLayer)
  state.layers.notes = notesLayer

  // Overlay layer (for UI elements)
  const overlayLayer = new Konva.Layer({
    name: 'overlay-layer'
  })
  stage.add(overlayLayer)
  state.layers.overlay = overlayLayer

  // Create selection rectangle
  state.selection.selectionRect = new Konva.Rect({
    stroke: '#4A90E2',
    strokeWidth: 1,
    dash: [3, 3],
    fill: 'rgba(74, 144, 226, 0.1)',
    listening: false,
    visible: false
  })
  overlayLayer.add(state.selection.selectionRect)

  // Create queue playhead element (green)
  const pianoRollHeight = 128 * state.grid.noteHeight
  state.queuePlayhead.element = new Konva.Line({
    points: [0, 0, 0, pianoRollHeight],
    stroke: '#00ff00',
    strokeWidth: 2,
    listening: false
  })
  overlayLayer.add(state.queuePlayhead.element)

  // Create live playhead element (orange)
  state.livePlayhead.element = new Konva.Line({
    points: [0, 0, 0, pianoRollHeight],
    stroke: '#ff8800',
    strokeWidth: 2,
    listening: false
  })
  overlayLayer.add(state.livePlayhead.element)

  // Initialize command stack
  state.command.stack = new CommandStack(
    () => captureState(state),
    (snapshot) => restoreState(state, snapshot),
    () => {
      state.needsRedraw = true
      onCommandStackChange?.()
    }
  )
}

// ================= Rendering Functions =================

export function renderGrid(state: PianoRollState) {
  const gridLayer = state.layers.grid
  if (!gridLayer || !state.stage) return

  const gridCache = state.renderCache.grid

  const stage = state.stage
  const viewportWidth = stage.width()
  const viewportHeight = stage.height()

  // Only redraw if viewport or subdivision changed
  if (gridCache.lastScrollX === state.viewport.scrollX &&
      gridCache.lastScrollY === state.viewport.scrollY &&
      gridCache.lastSubdivision === state.grid.subdivision &&
      gridCache.lastQuarterNoteWidth === state.grid.quarterNoteWidth &&
      gridCache.lastNoteHeight === state.grid.noteHeight &&
      gridCache.lastStageWidth === viewportWidth &&
      gridCache.lastStageHeight === viewportHeight) {
    return
  }

  gridCache.lastScrollX = state.viewport.scrollX
  gridCache.lastScrollY = state.viewport.scrollY
  gridCache.lastSubdivision = state.grid.subdivision
  gridCache.lastQuarterNoteWidth = state.grid.quarterNoteWidth
  gridCache.lastNoteHeight = state.grid.noteHeight
  gridCache.lastStageWidth = viewportWidth
  gridCache.lastStageHeight = viewportHeight

  gridLayer.destroyChildren()

  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight, numMeasures, timeSignature } = state.grid

  const pianoRollHeight = 128 * noteHeight
  const pulsesPerMeasure = timeSignature * 4
  const measureWidth = quarterNoteWidth * pulsesPerMeasure

  // Draw measure backgrounds
  const firstVisibleMeasure = Math.floor(scrollX / measureWidth)
  const lastVisibleMeasure = Math.ceil((scrollX + viewportWidth) / measureWidth)

  for (let i = firstVisibleMeasure; i <= lastVisibleMeasure && i < numMeasures; i++) {
    const color = i % 2 === 0 ? state.grid.backgroundColor1 : state.grid.backgroundColor2
    const x = i * measureWidth - scrollX

    gridLayer.add(new Konva.Rect({
      x,
      y: -scrollY,
      width: measureWidth,
      height: pianoRollHeight,
      fill: color,
      listening: false
    }))
  }

  // Draw vertical lines (time grid)
  const numVertLines = numMeasures * pulsesPerMeasure * (state.grid.subdivision / 4)
  const vertLineSpace = quarterNoteWidth * (4 / state.grid.subdivision)

  const firstVisibleLine = Math.floor(scrollX / vertLineSpace)
  const lastVisibleLine = Math.ceil((scrollX + viewportWidth) / vertLineSpace)

  for (let i = firstVisibleLine; i <= lastVisibleLine && i < numVertLines; i++) {
    const xPos = i * vertLineSpace - scrollX
    const isQuarterNote = (i * vertLineSpace) % quarterNoteWidth === 0
    const strokeWidth = isQuarterNote ? 1.8 : 1

    gridLayer.add(new Konva.Line({
      points: [xPos, -scrollY, xPos, pianoRollHeight - scrollY],
      stroke: '#000',
      strokeWidth,
      listening: false
    }))
  }

  // Draw horizontal lines (pitch boundaries)
  const firstVisiblePitch = Math.floor(scrollY / noteHeight)
  const lastVisiblePitch = Math.ceil((scrollY + viewportHeight) / noteHeight)

  for (let i = firstVisiblePitch; i <= lastVisiblePitch && i < 128; i++) {
    const yPos = i * noteHeight - scrollY

    gridLayer.add(new Konva.Line({
      points: [0 - scrollX, yPos, numMeasures * measureWidth - scrollX, yPos],
      stroke: '#000',
      strokeWidth: 1,
      listening: false
    }))
  }

  gridLayer.batchDraw()
}

export function renderVisibleNotes(state: PianoRollState) {
  const notesLayer = state.layers.notes
  if (!notesLayer || !state.stage) return

  notesLayer.destroyChildren()

  const { scrollX, scrollY } = state.viewport
  const { quarterNoteWidth, noteHeight } = state.grid

  // Separate notes into selected and unselected for proper z-order
  const unselectedNotes: Array<[string, NoteData]> = []
  const selectedNotes: Array<[string, NoteData]> = []

  state.notes.forEach((note, id) => {
    if (!isNoteVisible(note, state)) return

    if (state.selection.selectedIds.has(id)) {
      selectedNotes.push([id, note])
    } else {
      unselectedNotes.push([id, note])
    }
  })

  // Render unselected notes first (back)
  unselectedNotes.forEach(([id, note]) => {
    const screen = pitchPositionToScreen(note.pitch, note.position, state)
    // Use display duration (may be truncated)
    const displayDuration = getNoteDisplayDuration(state, id, note.duration)
    const width = displayDuration * quarterNoteWidth
    const isHidden = state.interaction.hiddenNoteIds.has(id)

    const rect = new Konva.Rect({
      x: screen.x,
      y: screen.y,
      width,
      height: noteHeight,
      fill: state.grid.noteColor,
      stroke: '#000',
      strokeWidth: 1,
      opacity: isHidden ? 0.3 : 1.0,
      listening: true
    })
    rect.setAttr('noteId', id)
    notesLayer.add(rect)

    // Add note label
    const labelText = midiPitchToString(note.pitch)
    const label = new Konva.Text({
      x: screen.x + 4,
      y: screen.y + 2,
      text: labelText,
      fontSize: 14,
      fill: '#000',
      listening: false
    })
    notesLayer.add(label)

    renderMpePitchCurve({
      state,
      noteId: id,
      note,
      screenX: screen.x,
      screenY: screen.y,
      width,
      isSelected: false
    })
  })

  // Render selected notes last (front) - ensures they appear on top
  selectedNotes.forEach(([id, note]) => {
    const screen = pitchPositionToScreen(note.pitch, note.position, state)
    // Selected notes use their actual duration (not truncated)
    const width = note.duration * quarterNoteWidth
    const isHidden = state.interaction.hiddenNoteIds.has(id)

    const rect = new Konva.Rect({
      x: screen.x,
      y: screen.y,
      width,
      height: noteHeight,
      fill: state.grid.selectedNoteColor,
      stroke: '#000',
      strokeWidth: 1,
      opacity: isHidden ? 0.3 : 1.0,
      listening: true
    })
    rect.setAttr('noteId', id)
    notesLayer.add(rect)

    // Add note label
    const labelText = midiPitchToString(note.pitch)
    const label = new Konva.Text({
      x: screen.x + 4,
      y: screen.y + 2,
      text: labelText,
      fontSize: 14,
      fill: '#000',
      listening: false
    })
    notesLayer.add(label)

    renderMpePitchCurve({
      state,
      noteId: id,
      note,
      screenX: screen.x,
      screenY: screen.y,
      width,
      isSelected: true
    })
  })

  notesLayer.batchDraw()
}

type MpeRenderInput = {
  state: PianoRollState
  noteId: string
  note: NoteData
  screenX: number
  screenY: number
  width: number
  isSelected: boolean
}

function renderMpePitchCurve({
  state,
  noteId,
  note,
  screenX,
  screenY,
  width,
  isSelected
}: MpeRenderInput) {
  const notesLayer = state.layers.notes
  if (!notesLayer) return

  const noteHeight = state.grid.noteHeight
  const hasMpePoints = (note.mpePitch?.points?.length ?? 0) > 0
  const isEditable = state.mpe.enabled && isSelected
  const canRenderEmptyLine = state.mpe.enabled && !hasMpePoints

  if (!hasMpePoints && !canRenderEmptyLine) {
    return
  }

  const centerY = screenY + noteHeight / 2
  const linePoints = buildMpeLinePoints({
    note,
    screenX,
    centerY,
    width,
    noteHeight
  })

  const line = new Konva.Line({
    points: linePoints.flatMap(point => [point.x, point.y]),
    stroke: isEditable ? '#185adb' : '#222',
    strokeWidth: 2,
    hitStrokeWidth: 12,
    lineCap: 'round',
    lineJoin: 'round',
    dash: hasMpePoints ? [] : [6, 4],
    listening: isEditable || canRenderEmptyLine
  })
  line.setAttr('mpeLineNoteId', noteId)
  line.setAttr('mpeLineEditable', isEditable)
  notesLayer.add(line)

  if (!hasMpePoints && canRenderEmptyLine) {
    line.on('mousedown touchstart', () => {
      const pos = state.stage?.getPointerPosition()
      if (!pos) return
      const { time, pitchOffset } = screenToMpePoint({
        x: pos.x,
        y: pos.y,
        screenX,
        screenY,
        width,
        noteHeight
      })
      state.command.stack?.executeCommand('Add MPE Pitch Point', () => {
        const target = state.notes.get(noteId)
        if (!target) return
        if (!state.selection.selectedIds.has(noteId)) {
          mutateSelection(state, () => {
            state.selection.selectedIds.clear()
            state.selection.selectedIds.add(noteId)
          })
        }
        const nextPoint: MpePitchPoint = { time, pitchOffset }
        const existing = target.mpePitch?.points ?? []
        const updatedPoints = [...existing, nextPoint]
        target.mpePitch = { points: sortMpePoints(updatedPoints) }
        state.needsRedraw = true
      })
    })
    return
  }

  if (!hasMpePoints) {
    return
  }

  if (!isEditable) {
    return
  }

  const points = note.mpePitch?.points ?? []
  points.forEach((point, index) => {
    const handlePosition = mpePointToScreen({
      point,
      screenX,
      centerY,
      width,
      noteHeight
    })
    const isHandleSelected = state.mpe.selectedHandles.has(index)
    const handle = new Konva.Circle({
      x: handlePosition.x,
      y: handlePosition.y,
      radius: 5,
      fill: isHandleSelected ? '#ffe7cc' : '#ffffff',
      stroke: isHandleSelected ? '#ff8c00' : '#185adb',
      strokeWidth: 2,
      draggable: true,
      name: 'mpe-handle'
    })
    handle.setAttr('mpeHandleNoteId', noteId)
    handle.setAttr('mpeHandleIndex', index)
    handle.setAttr('mpeLineRef', line)

    handle.dragBoundFunc((pos) => {
      const boundedX = clamp(pos.x, screenX, screenX + width)
      const boundedY = clamp(pos.y, centerY - MPE_PITCH_OFFSET_RANGE * noteHeight, centerY + MPE_PITCH_OFFSET_RANGE * noteHeight)
      return { x: boundedX, y: boundedY }
    })

    handle.on('mousedown touchstart', () => {
      if (!state.mpe.selectedHandles.has(index)) {
        state.mpe.selectedHandles.clear()
        state.mpe.selectedHandles.add(index)
        updateMpeHandleSelectionVisual(state)
      }
    })

    handle.on('dragstart', () => {
      if (!state.mpe.selectedHandles.has(index)) {
        state.mpe.selectedHandles.clear()
        state.mpe.selectedHandles.add(index)
        updateMpeHandleSelectionVisual(state)
      }
      const tooltip = createMpeDragTooltip(state)
      const data = state.notes.get(noteId)
      const points = data?.mpePitch?.points ?? []
      const startPointer = state.stage?.getPointerPosition()
      const selectedIndices = Array.from(state.mpe.selectedHandles).sort((a, b) => a - b)
      const handleRefs = new Map<number, Konva.Circle>()
      if (notesLayer) {
        notesLayer.find('.mpe-handle').forEach((node) => {
          const nodeNoteId = node.getAttr('mpeHandleNoteId')
          const nodeIndex = Number(node.getAttr('mpeHandleIndex'))
          if (!Number.isFinite(nodeIndex)) return
          if (nodeNoteId === noteId && selectedIndices.includes(nodeIndex)) {
            handleRefs.set(nodeIndex, node as Konva.Circle)
          }
        })
      }
      state.interaction.mpeDrag = {
        noteId,
        pointIndex: index,
        beforeState: captureState(state),
        tooltip,
        selectedIndices,
        startPointer: startPointer ? { x: startPointer.x, y: startPointer.y } : undefined,
        startPoints: points.map(point => ({ ...point })),
        handleRefs
      }
      if (tooltip) {
        updateMpeDragTooltip(tooltip, handle.x(), handle.y(), point.pitchOffset)
      }
    })

    handle.on('dragmove', (event) => {
      const target = event.target as Konva.Circle
      const data = state.notes.get(noteId)
      if (!data?.mpePitch) return
      const dragState = state.interaction.mpeDrag
      const pointer = state.stage?.getPointerPosition()
      if (!dragState || !pointer || !dragState.startPoints || !dragState.selectedIndices?.length) return

      const isFine = !!(event.evt as MouseEvent | PointerEvent | TouchEvent | undefined)?.shiftKey
      if (dragState.fineMode !== isFine) {
        dragState.fineMode = isFine
        dragState.startPointer = { x: pointer.x, y: pointer.y }
        dragState.startPoints = data.mpePitch.points.map(point => ({ ...point }))
      }

      const startPointer = dragState.startPointer
      const startPoints = dragState.startPoints
      if (!startPointer || !startPoints) return

      const dx = pointer.x - startPointer.x
      let dy = pointer.y - startPointer.y
      if (dragState.fineMode) {
        dy *= MPE_FINE_DRAG_FACTOR
      }

      let deltaTime = dx / width
      let deltaPitch = -(dy / noteHeight)

      const selectedBlocks = getMpeSelectedBlocks(dragState.selectedIndices)
      const timeEpsilon = 0
      let minDeltaTime = -Infinity
      let maxDeltaTime = Infinity

      selectedBlocks.forEach(({ start, end }) => {
        const blockStartTime = startPoints[start]?.time ?? 0
        const blockEndTime = startPoints[end]?.time ?? 0
        const prevTime = start > 0 ? startPoints[start - 1]?.time : undefined
        const nextTime = end < startPoints.length - 1 ? startPoints[end + 1]?.time : undefined

        const blockMin = Math.max(
          -blockStartTime,
          prevTime !== undefined ? (prevTime + timeEpsilon - blockStartTime) : -blockStartTime
        )
        const blockMax = Math.min(
          1 - blockEndTime,
          nextTime !== undefined ? (nextTime - timeEpsilon - blockEndTime) : (1 - blockEndTime)
        )

        minDeltaTime = Math.max(minDeltaTime, blockMin)
        maxDeltaTime = Math.min(maxDeltaTime, blockMax)
      })

      if (Number.isFinite(minDeltaTime) && Number.isFinite(maxDeltaTime)) {
        deltaTime = clamp(deltaTime, minDeltaTime, maxDeltaTime)
      }

      let minDeltaPitch = -Infinity
      let maxDeltaPitch = Infinity
      dragState.selectedIndices.forEach((idx) => {
        const startPitch = startPoints[idx]?.pitchOffset ?? 0
        minDeltaPitch = Math.max(minDeltaPitch, -MPE_PITCH_OFFSET_RANGE - startPitch)
        maxDeltaPitch = Math.min(maxDeltaPitch, MPE_PITCH_OFFSET_RANGE - startPitch)
      })
      if (Number.isFinite(minDeltaPitch) && Number.isFinite(maxDeltaPitch)) {
        deltaPitch = clamp(deltaPitch, minDeltaPitch, maxDeltaPitch)
      }

      const updatedPoints = [...data.mpePitch.points]
      dragState.selectedIndices.forEach((idx) => {
        const startPoint = startPoints[idx]
        if (!startPoint) return
        updatedPoints[idx] = {
          time: startPoint.time + deltaTime,
          pitchOffset: startPoint.pitchOffset + deltaPitch
        }
      })

      data.mpePitch = { points: updatedPoints }
      updateMpeLine(line, data, screenX, centerY, width, noteHeight)

      dragState.selectedIndices.forEach((idx) => {
        const handleNode = dragState.handleRefs?.get(idx)
        if (!handleNode) return
        const point = updatedPoints[idx]
        const pos = mpePointToScreen({ point, screenX, centerY, width, noteHeight })
        handleNode.position({ x: pos.x, y: pos.y })
      })

      const primaryPoint = updatedPoints[index]
      if (dragState.tooltip && primaryPoint) {
        const pos = mpePointToScreen({ point: primaryPoint, screenX, centerY, width, noteHeight })
        updateMpeDragTooltip(dragState.tooltip, pos.x, pos.y, primaryPoint.pitchOffset)
      }
    })

    handle.on('dragend', () => {
      const dragState = state.interaction.mpeDrag
      const data = state.notes.get(noteId)
      if (data?.mpePitch?.points) {
        data.mpePitch = { points: sortMpePoints(data.mpePitch.points) }
      }
      const after = captureState(state)
      if (dragState?.beforeState && dragState.beforeState !== after) {
        state.command.stack?.pushCommand('Edit MPE Pitch Curve', dragState.beforeState, after)
      }
      if (dragState?.tooltip) {
        dragState.tooltip.group.destroy()
        state.layers.overlay?.batchDraw()
      }
      state.interaction.mpeDrag = undefined
      state.needsRedraw = true
    })

    notesLayer.add(handle)
  })

  line.on('mousedown touchstart', () => {
    const pos = state.stage?.getPointerPosition()
    if (!pos) return
    const { time, pitchOffset } = screenToMpePoint({
      x: pos.x,
      y: pos.y,
      screenX,
      screenY,
      width,
      noteHeight
    })
    state.command.stack?.executeCommand('Add MPE Pitch Point', () => {
      const target = state.notes.get(noteId)
      if (!target) return
      const nextPoint: MpePitchPoint = { time, pitchOffset }
      const existing = target.mpePitch?.points ?? []
      const updatedPoints = [...existing, nextPoint]
      target.mpePitch = { points: sortMpePoints(updatedPoints) }
      state.needsRedraw = true
    })
  })
}

function buildMpeLinePoints({
  note,
  screenX,
  centerY,
  width,
  noteHeight
}: {
  note: NoteData
  screenX: number
  centerY: number
  width: number
  noteHeight: number
}): Array<{ x: number; y: number }> {
  const points = note.mpePitch?.points ?? []
  if (points.length === 0) {
    return [
      { x: screenX, y: centerY },
      { x: screenX + width, y: centerY }
    ]
  }

  const sorted = sortMpePoints(points)
  const screenPoints = sorted.map(point => mpePointToScreen({ point, screenX, centerY, width, noteHeight }))

  const startPoint = screenPoints[0]
  const endPoint = screenPoints[screenPoints.length - 1]

  const withAnchors = [...screenPoints]
  if (sorted[0].time > 0) {
    withAnchors.unshift({ x: screenX, y: startPoint.y })
  } else {
    withAnchors[0] = { x: screenX, y: startPoint.y }
  }
  if (sorted[sorted.length - 1].time < 1) {
    withAnchors.push({ x: screenX + width, y: endPoint.y })
  } else {
    withAnchors[withAnchors.length - 1] = { x: screenX + width, y: endPoint.y }
  }
  return withAnchors
}

function updateMpeLine(
  line: Konva.Line,
  note: NoteData,
  screenX: number,
  centerY: number,
  width: number,
  noteHeight: number
) {
  const updatedPoints = buildMpeLinePoints({ note, screenX, centerY, width, noteHeight })
  line.points(updatedPoints.flatMap(point => [point.x, point.y]))
}

function getSingleSelectedNoteId(state: PianoRollState) {
  if (state.selection.selectedIds.size !== 1) return null
  return Array.from(state.selection.selectedIds)[0] ?? null
}

function updateMpeHandleSelectionVisual(state: PianoRollState) {
  const notesLayer = state.layers.notes
  if (!notesLayer) return
  const selectedNoteId = getSingleSelectedNoteId(state)

  notesLayer.find('.mpe-handle').forEach((node) => {
    const handleNode = node as Konva.Circle
    const nodeIndex = Number(handleNode.getAttr('mpeHandleIndex'))
    const nodeNoteId = handleNode.getAttr('mpeHandleNoteId')
    if (!Number.isFinite(nodeIndex)) return
    const isSelected = nodeNoteId === selectedNoteId && state.mpe.selectedHandles.has(nodeIndex)
    handleNode.fill(isSelected ? '#ffe7cc' : '#ffffff')
    handleNode.stroke(isSelected ? '#ff8c00' : '#185adb')
  })

  notesLayer.batchDraw()
}

function getMpeHandlesInRect(state: PianoRollState, noteId: string, rect: { x: number; y: number; width: number; height: number }) {
  const note = state.notes.get(noteId)
  if (!note?.mpePitch?.points?.length) return []

  const screen = pitchPositionToScreen(note.pitch, note.position, state)
  const width = note.duration * state.grid.quarterNoteWidth
  const centerY = screen.y + state.grid.noteHeight / 2
  const noteHeight = state.grid.noteHeight

  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height

  const selected: number[] = []
  note.mpePitch.points.forEach((point, index) => {
    const pos = mpePointToScreen({
      point,
      screenX: screen.x,
      centerY,
      width,
      noteHeight
    })
    if (pos.x >= left && pos.x <= right && pos.y >= top && pos.y <= bottom) {
      selected.push(index)
    }
  })
  return selected
}

function getMpeSelectedBlocks(indices: number[]) {
  if (indices.length === 0) return []
  const sorted = [...indices].sort((a, b) => a - b)
  const blocks: Array<{ start: number; end: number }> = []
  let blockStart = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const idx = sorted[i]
    if (idx === prev + 1) {
      prev = idx
      continue
    }
    blocks.push({ start: blockStart, end: prev })
    blockStart = idx
    prev = idx
  }
  blocks.push({ start: blockStart, end: prev })
  return blocks
}

function formatPitchOffset(value: number) {
  const rounded = Math.round(value * 100) / 100
  const safe = Object.is(rounded, -0) ? 0 : rounded
  const sign = safe >= 0 ? '+' : ''
  return `${sign}${safe.toFixed(2)}`
}

function createMpeDragTooltip(state: PianoRollState) {
  const overlay = state.layers.overlay
  if (!overlay) return undefined
  const padding = 6
  const group = new Konva.Group({ listening: false })
  const background = new Konva.Rect({
    fill: 'rgba(0, 0, 0, 0.75)',
    cornerRadius: 4
  })
  const text = new Konva.Text({
    text: '',
    fontSize: 12,
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fill: '#fff'
  })
  group.add(background)
  group.add(text)
  overlay.add(group)
  return { group, background, text, padding }
}

function updateMpeDragTooltip(
  tooltip: NonNullable<PianoRollState['interaction']['mpeDrag']>['tooltip'],
  x: number,
  y: number,
  pitchOffset: number
) {
  if (!tooltip) return
  const label = formatPitchOffset(pitchOffset)
  tooltip.text.text(label)
  const textWidth = tooltip.text.width()
  const textHeight = tooltip.text.height()
  tooltip.background.width(textWidth + tooltip.padding * 2)
  tooltip.background.height(textHeight + tooltip.padding * 2)
  tooltip.text.position({ x: tooltip.padding, y: tooltip.padding })
  tooltip.group.position({
    x: x + MPE_TOOLTIP_OFFSET.x,
    y: y + MPE_TOOLTIP_OFFSET.y - (textHeight + tooltip.padding * 2)
  })
  tooltip.group.getLayer()?.batchDraw()
}

function screenToMpePoint({
  x,
  y,
  screenX,
  screenY,
  width,
  noteHeight
}: {
  x: number
  y: number
  screenX: number
  screenY: number
  width: number
  noteHeight: number
}): MpePitchPoint {
  const centerY = screenY + noteHeight / 2
  const time = clamp((x - screenX) / width, 0, 1)
  const pitchOffset = clamp((centerY - y) / noteHeight, -MPE_PITCH_OFFSET_RANGE, MPE_PITCH_OFFSET_RANGE)
  return { time, pitchOffset }
}

function mpePointToScreen({
  point,
  screenX,
  centerY,
  width,
  noteHeight
}: {
  point: MpePitchPoint
  screenX: number
  centerY: number
  width: number
  noteHeight: number
}) {
  return {
    x: screenX + point.time * width,
    y: centerY - point.pitchOffset * noteHeight
  }
}

function sortMpePoints(points: MpePitchPoint[]): MpePitchPoint[] {
  return [...points].sort((a, b) => a.time - b.time)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function renderResizeHandles(state: PianoRollState) {
  const notesLayer = state.layers.notes
  if (!notesLayer) return

  const { quarterNoteWidth, noteHeight } = state.grid
  const handleRadius = 5

  // Remove existing handles
  notesLayer.find('.resize-handle').forEach(node => node.destroy())

  state.selection.selectedIds.forEach(id => {
    const note = state.notes.get(id)
    if (!note || !isNoteVisible(note, state)) return

    const screen = pitchPositionToScreen(note.pitch, note.position, state)
    const width = note.duration * quarterNoteWidth

    // Start handle
    const startHandle = new Konva.Circle({
      x: screen.x,
      y: screen.y + noteHeight / 2,
      radius: handleRadius,
      fill: '#000',
      listening: true,
      name: 'resize-handle'
    })
    startHandle.setAttr('handleNoteId', id)
    startHandle.setAttr('handleIsEnd', false)
    notesLayer.add(startHandle)

    // End handle
    const endHandle = new Konva.Circle({
      x: screen.x + width,
      y: screen.y + noteHeight / 2,
      radius: handleRadius,
      fill: '#000',
      listening: true,
      name: 'resize-handle'
    })
    endHandle.setAttr('handleNoteId', id)
    endHandle.setAttr('handleIsEnd', true)
    notesLayer.add(endHandle)
  })

  notesLayer.batchDraw()
}

export function renderMarqueeRect(state: PianoRollState) {
  if (!state.selection.selectionRect) return
  if (!state.interaction.marqueeStart || !state.interaction.marqueeCurrent) return

  const start = state.interaction.marqueeStart
  const current = state.interaction.marqueeCurrent

  const x = Math.min(start.x, current.x)
  const y = Math.min(start.y, current.y)
  const width = Math.abs(current.x - start.x)
  const height = Math.abs(current.y - start.y)

  state.selection.selectionRect.setAttrs({
    x,
    y,
    width,
    height,
    visible: width > 5 || height > 5
  })

  state.layers.overlay?.batchDraw()
}

export function updateQueuePlayheadPosition(state: PianoRollState) {
  if (!state.queuePlayhead.element) return

  const { scrollX } = state.viewport
  const x = state.queuePlayhead.position * state.grid.quarterNoteWidth - scrollX

  state.queuePlayhead.element.x(x)
  state.layers.overlay?.batchDraw()
}

export function updateLivePlayheadPosition(state: PianoRollState) {
  if (!state.livePlayhead.element) return

  const { scrollX } = state.viewport
  const x = state.livePlayhead.position * state.grid.quarterNoteWidth - scrollX

  state.livePlayhead.element.x(x)
  state.layers.overlay?.batchDraw()
}

// ================= Interaction Handlers =================

export function setupEventHandlers(state: PianoRollState, stage: Konva.Stage) {
  const notesLayer = state.layers.notes
  const gridLayer = state.layers.grid

  // Double-click on background → Add note
  stage.on('dblclick', (e) => {
    if (e.target === stage || e.target.getLayer() === gridLayer) {
      const pos = stage.getPointerPosition()
      if (!pos) return

      const { pitch, position } = screenToPitchPosition(pos, state)
      const quantizedPos = quantizeToGrid(position, state.grid.subdivision)
      const quantizedPitch = Math.round(pitch)

      state.command.stack?.executeCommand('Add Note', () => {
        const note: NoteData = {
          id: uid(),
          pitch: quantizedPitch,
          position: quantizedPos,
          duration: 4 / state.grid.subdivision,
          velocity: 0.8
        }
        state.notes.set(note.id, note)
        state.needsRedraw = true
      })
    }
  })

  // Click on note or handle
  stage.on('mousedown touchstart', (e) => {
    const target = e.target

    // Check if clicking on resize handle
    const handleNoteId = target.getAttr?.('handleNoteId')
    if (handleNoteId) {
      const isEnd = target.getAttr('handleIsEnd')
      startResize(state, stage, handleNoteId, isEnd)
      return
    }

    // Check if clicking on note
    const noteId = target.getAttr?.('noteId')
    if (noteId) {
      const isSelected = state.selection.selectedIds.has(noteId)

      mutateSelection(state, () => {
        if (!isSelected) {
          state.selection.selectedIds.clear()
          state.selection.selectedIds.add(noteId)
        }
      })

      if (state.mpe.enabled) {
        state.mpe.selectedHandles.clear()
        updateMpeHandleSelectionVisual(state)
        state.needsRedraw = true
        return
      }

      // Start drag for selected notes
      startNoteDrag(state, stage)
      state.needsRedraw = true
      return
    }

    // Clicking on background → start marquee selection
    if (target === stage || target.getLayer() === gridLayer) {
      const pos = stage.getPointerPosition()
      if (!pos) return

      state.interaction.isMarqueeSelecting = true
      state.interaction.marqueeStart = pos
      state.interaction.marqueeCurrent = pos
      state.interaction.marqueeIsShift = false

      if (state.mpe.enabled) {
        state.mpe.selectedHandles.clear()
        updateMpeHandleSelectionVisual(state)
      } else {
        mutateSelection(state, () => {
          state.selection.selectedIds.clear()
        })
      }

      state.needsRedraw = true
    }
  })

  // Mouse move
  stage.on('mousemove touchmove', (e) => {
    const pos = stage.getPointerPosition()
    if (!pos) return

    // Handle drag
    if (state.interaction.isDragging) {
      updateNoteDrag(state, stage)
      return
    }

    // Handle resize
    if (state.interaction.isResizing) {
      updateNoteResize(state, stage)
      return
    }

    // Handle marquee selection
    if (state.interaction.isMarqueeSelecting) {
      state.interaction.marqueeCurrent = pos

      renderMarqueeRect(state)

      // Update selection based on intersection
      const rect = {
        x: Math.min(state.interaction.marqueeStart!.x, pos.x),
        y: Math.min(state.interaction.marqueeStart!.y, pos.y),
        width: Math.abs(pos.x - state.interaction.marqueeStart!.x),
        height: Math.abs(pos.y - state.interaction.marqueeStart!.y)
      }

      if (state.mpe.enabled) {
        const selectedNoteId = getSingleSelectedNoteId(state)
        if (selectedNoteId) {
          const handleIndices = getMpeHandlesInRect(state, selectedNoteId, rect)
          state.mpe.selectedHandles = new Set(handleIndices)
          updateMpeHandleSelectionVisual(state)
        }
      } else {
        const intersecting = getNotesInRect(state, rect)

        mutateSelection(state, () => {
          state.selection.selectedIds.clear()
          const first = intersecting[0]
          if (first) {
            state.selection.selectedIds.add(first)
          }
        })

        state.needsRedraw = true
      }
    }
  })

  // Mouse up
  stage.on('mouseup touchend', (e) => {
    if (state.interaction.isDragging) {
      finishNoteDrag(state)
      return
    }

    if (state.interaction.isResizing) {
      finishNoteResize(state)
      return
    }

    if (state.interaction.isMarqueeSelecting) {
      const wasClick = state.interaction.marqueeStart && state.interaction.marqueeCurrent &&
        Math.abs(state.interaction.marqueeStart.x - state.interaction.marqueeCurrent.x) < 5 &&
        Math.abs(state.interaction.marqueeStart.y - state.interaction.marqueeCurrent.y) < 5

      state.interaction.isMarqueeSelecting = false
      if (state.selection.selectionRect) {
        state.selection.selectionRect.visible(false)
        state.layers.overlay?.batchDraw()
      }

      // If it was a click (not a drag), move queue playhead to clicked position
      if (wasClick && e.target === stage || e.target.getLayer() === gridLayer) {
        const pos = stage.getPointerPosition()
        if (pos) {
          const { position } = screenToPitchPosition(pos, state)
          const quantizedPos = quantizeToGrid(position, state.grid.subdivision)
          state.queuePlayhead.position = Math.max(0, Math.min(quantizedPos, state.grid.maxLength))
          state.needsRedraw = true
          state.notifyExternalChange?.('playhead') // for queue playhead update
        }
      }
    }
  })
}

// ================= Drag Handlers =================

function startNoteDrag(state: PianoRollState, stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos) return

  state.interaction.isDragging = true
  state.interaction.dragStartPos = pos
  state.interaction.quantDragActivated = false
  state.interaction.dragBeforeState = captureState(state)

  // Store initial states for all selected notes
  state.interaction.draggedNoteInitialStates.clear()
  state.selection.selectedIds.forEach(id => {
    const note = state.notes.get(id)
    if (note) {
      state.interaction.draggedNoteInitialStates.set(id, {
        position: note.position,
        pitch: note.pitch
      })
    }
  })
}

function updateNoteDrag(state: PianoRollState, stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos || !state.interaction.dragStartPos) return

  const dx = pos.x - state.interaction.dragStartPos.x
  const dy = pos.y - state.interaction.dragStartPos.y

  // Quantization logic
  const quantWidth = getGridUnitWidth(state)
  let xMove
  if (Math.abs(dx) < quantWidth * 0.9 && !state.interaction.quantDragActivated) {
    xMove = dx
  } else {
    xMove = Math.round(dx / quantWidth) * quantWidth
    state.interaction.quantDragActivated = true
  }

  // Pitch quantization (always snapped)
  const pitchDelta = Math.round(dy / state.grid.noteHeight)

  // Update all selected notes
  state.interaction.draggedNoteInitialStates.forEach((initial, id) => {
    const note = state.notes.get(id)
    if (note) {
      note.position = initial.position + (xMove / state.grid.quarterNoteWidth)
      note.pitch = Math.max(0, Math.min(127, initial.pitch - pitchDelta))
    }
  })

  // Apply snap-to-note-start
  applySnapToNoteStart(state)

  // Overlap detection & preview
  updateOverlapPreview(state)

  state.needsRedraw = true
}

function finishNoteDrag(state: PianoRollState) {
  // Execute overlap changes (truncate/delete notes)
  executeOverlapChanges(state)

  const after = captureState(state)
  if (state.interaction.dragBeforeState && state.interaction.dragBeforeState !== after) {
    state.command.stack?.pushCommand('Move Notes', state.interaction.dragBeforeState, after)
  }

  state.interaction.isDragging = false
  clearOverlapPreview(state)
  state.needsRedraw = true
}

// ================= Resize Handlers =================

function startResize(state: PianoRollState, stage: Konva.Stage, noteId: string, isEnd: boolean) {
  const pos = stage.getPointerPosition()
  if (!pos) return

  state.interaction.isResizing = true
  state.interaction.resizeTargetId = noteId
  state.interaction.resizeIsEnd = isEnd
  state.interaction.quantResizeActivated = false
  state.interaction.dragStartPos = pos
  state.interaction.resizeBeforeState = captureState(state)

  // Store initial states for ALL selected notes
  state.interaction.resizeInitialStates.clear()
  state.selection.selectedIds.forEach(id => {
    const note = state.notes.get(id)
    if (note) {
      state.interaction.resizeInitialStates.set(id, {
        position: note.position,
        duration: note.duration
      })
    }
  })
}

function updateNoteResize(state: PianoRollState, stage: Konva.Stage) {
  const pos = stage.getPointerPosition()
  if (!pos || !state.interaction.dragStartPos) return

  const dx = pos.x - state.interaction.dragStartPos.x

  // Apply same quantization as drag
  const quantWidth = getGridUnitWidth(state)
  let xMove
  if (Math.abs(dx) < quantWidth * 0.9 && !state.interaction.quantResizeActivated) {
    xMove = dx
  } else {
    xMove = Math.round(dx / quantWidth) * quantWidth
    state.interaction.quantResizeActivated = true
  }

  const positionDelta = xMove / state.grid.quarterNoteWidth

  // Update all selected notes
  state.interaction.resizeInitialStates.forEach((initial, id) => {
    const note = state.notes.get(id)
    if (!note) return

    if (state.interaction.resizeIsEnd) {
      // Resize end: change duration
      note.duration = Math.max(0.25, initial.duration + positionDelta)
    } else {
      // Resize start: change position AND duration
      note.position = initial.position + positionDelta
      note.duration = Math.max(0.25, initial.duration - positionDelta)
    }
  })

  updateOverlapPreview(state)
  state.needsRedraw = true
}

function finishNoteResize(state: PianoRollState) {
  // Execute overlap changes (truncate/delete notes)
  executeOverlapChanges(state)

  const after = captureState(state)
  if (state.interaction.resizeBeforeState && state.interaction.resizeBeforeState !== after) {
    state.command.stack?.pushCommand('Resize Notes', state.interaction.resizeBeforeState, after)
  }

  state.interaction.isResizing = false
  clearOverlapPreview(state)
  state.needsRedraw = true
}
