import type { TimeContext } from '@/channels/offline_time_context'
import type { PolygonRenderData } from '@/canvas/canvasState'
import type { Point } from './textRegionUtils'
import { getTextAnim } from './textRegionUtils'
import type {
  MelodyMapGlobalState,
  MelodyDrawInfo,
  ArcAnimation,
  PolygonColumn,
  MelodyMapRenderState
} from './melodyMapState'
import { getTargetColumn } from './melodyMapState'

/**
 * Generates points along the edges of a polygon for random arc start/end selection
 * @param points Polygon vertices
 * @param numPointsPerEdge Number of points to generate per edge
 */
export function generateEdgePoints(points: Point[], numPointsPerEdge: number = 10): Point[] {
  if (points.length < 3) return []

  const edgePoints: Point[] = []

  for (let i = 0; i < points.length; i++) {
    const start = points[i]
    const end = points[(i + 1) % points.length]

    for (let j = 0; j < numPointsPerEdge; j++) {
      const t = j / numPointsPerEdge
      edgePoints.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t
      })
    }
  }

  return edgePoints
}

/**
 * Gets a random point from an array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Gets two different random points from an array
 */
function twoRandomPoints(arr: Point[]): { start: Point; end: Point } {
  if (arr.length < 2) {
    return { start: arr[0] || { x: 0, y: 0 }, end: arr[0] || { x: 0, y: 0 } }
  }

  const startIdx = Math.floor(Math.random() * arr.length)
  let endIdx = Math.floor(Math.random() * arr.length)

  // Ensure we get a different point
  while (endIdx === startIdx && arr.length > 1) {
    endIdx = Math.floor(Math.random() * arr.length)
  }

  return { start: arr[startIdx], end: arr[endIdx] }
}

/**
 * Filters polygons by their melodyMap column metadata
 */
export function getPolygonsInColumn(
  polygons: PolygonRenderData,
  column: PolygonColumn
): PolygonRenderData {
  return polygons.filter((poly) => {
    const anim = getTextAnim(poly.metadata)
    if (anim.fillAnim !== 'melodyMap') return false
    return anim.column === column
  })
}

/**
 * Gets all melodyMap polygons
 */
export function getMelodyMapPolygons(polygons: PolygonRenderData): PolygonRenderData {
  return polygons.filter((poly) => {
    const anim = getTextAnim(poly.metadata)
    return anim.fillAnim === 'melodyMap'
  })
}

/**
 * Allocates a melody to a polygon based on the alternating left/right column pattern
 * @param melodyId Unique identifier for this melody instance
 * @param state The global melody map state
 * @param polygons Current polygon render data
 * @returns The allocated polygon ID, or null if no valid polygon found
 */
export function allocateMelodyToPolygon(
  melodyId: string,
  state: MelodyMapGlobalState,
  polygons: PolygonRenderData
): string | null {
  // Determine target column based on counter
  const targetColumn = getTargetColumn(state.columnCounter)

  // Get polygons in the target column
  let candidates = getPolygonsInColumn(polygons, targetColumn)

  // If no polygons in target column, try the other side
  if (candidates.length === 0) {
    const otherColumn = targetColumn === 'left' ? 'right' : 'left'
    candidates = getPolygonsInColumn(polygons, otherColumn)
  }

  // If still no candidates, try middle
  if (candidates.length === 0) {
    candidates = getPolygonsInColumn(polygons, 'middle')
  }

  // If still no candidates, no melodyMap polygons exist
  if (candidates.length === 0) {
    return null
  }

  // Pick a random polygon from candidates
  const selectedPolygon = randomChoice(candidates)
  const polygonId = selectedPolygon.id

  // Update state
  state.melodyToPolygon.set(melodyId, polygonId)
  state.columnCounter++

  // Initialize draw info for this melody
  state.melodyDrawInfo.set(melodyId, {
    melodyId,
    polygonId,
    activeArcs: []
  })

  // Cache edge points if not already cached
  if (!state.polygonEdgePoints.has(polygonId)) {
    const edgePoints = selectedPolygon.points.map(p => ({...p})) //generateEdgePoints(selectedPolygon.points as Point[])
    state.polygonEdgePoints.set(polygonId, edgePoints)
  }

  // Update polygon column cache
  const anim = getTextAnim(selectedPolygon.metadata)
  state.polygonColumns.set(polygonId, anim.column as PolygonColumn)

  return polygonId
}

/**
 * Releases a melody's polygon allocation and cleans up state
 */
export function releaseMelody(melodyId: string, state: MelodyMapGlobalState): void {
  state.melodyToPolygon.delete(melodyId)
  state.melodyDrawInfo.delete(melodyId)
}

/**
 * Creates a unique arc ID
 */
function createArcId(): string {
  return `arc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Launches an arc animation for a note
 * @param melodyId The melody this note belongs to
 * @param pitch MIDI pitch
 * @param velocity Note velocity
 * @param duration Note duration in seconds
 * @param state Global melody map state
 * @returns The created arc animation, or null if melody not allocated
 */
export function launchArc(
  melodyId: string,
  pitch: number,
  velocity: number,
  duration: number,
  state: MelodyMapGlobalState
): ArcAnimation | null {
  const drawInfo = state.melodyDrawInfo.get(melodyId)
  if (!drawInfo) return null

  const edgePoints = state.polygonEdgePoints.get(drawInfo.polygonId)
  if (!edgePoints || edgePoints.length === 0) return null

  const { start, end } = twoRandomPoints(edgePoints)

  const arc: ArcAnimation = {
    id: createArcId(),
    startPoint: start,
    endPoint: end,
    startTime: performance.now(),
    duration: Math.max(0.05, duration), // Minimum duration to prevent instant disappearance
    pitch,
    velocity
  }

  drawInfo.activeArcs.push(arc)
  return arc
}

/**
 * Removes completed arcs from all melodies
 * @param state Global melody map state
 * @param currentTime Current time (performance.now())
 */
export function cleanupCompletedArcs(state: MelodyMapGlobalState, currentTime: number): void {
  for (const drawInfo of state.melodyDrawInfo.values()) {
    drawInfo.activeArcs = drawInfo.activeArcs.filter((arc) => {
      const elapsed = (currentTime - arc.startTime) / 1000
      return elapsed < arc.duration
    })
  }
}

/**
 * Gets render states for all melodyMap polygons
 * @param state Global melody map state
 * @returns Map of polygonId to MelodyMapRenderState
 */
export function getMelodyMapRenderStates(
  state: MelodyMapGlobalState
): Map<string, MelodyMapRenderState> {
  const renderStates = new Map<string, MelodyMapRenderState>()

  // Group arcs by polygon
  const arcsByPolygon = new Map<string, ArcAnimation[]>()

  for (const drawInfo of state.melodyDrawInfo.values()) {
    const existing = arcsByPolygon.get(drawInfo.polygonId) || []
    existing.push(...drawInfo.activeArcs)
    arcsByPolygon.set(drawInfo.polygonId, existing)
  }

  for (const [polygonId, arcs] of arcsByPolygon) {
    renderStates.set(polygonId, { arcs })
  }

  return renderStates
}

/**
 * Type for the visual note play function that can be passed to playClipSimple/runLineClean
 */
export type VisualNotePlayFunc = (
  pitch: number,
  velocity: number,
  ctx: TimeContext,
  noteDur: number,
  instInd: number
) => void

/**
 * Builds a note play function for a specific melody that launches visual arcs
 * @param melodyId Unique ID for this melody instance
 * @param state Global melody map state
 * @returns A function compatible with PlayNoteFunc that launches arcs
 */
export function buildVisualNotePlayFunction(
  melodyId: string,
  state: MelodyMapGlobalState
): VisualNotePlayFunc {
  return (pitch: number, velocity: number, _ctx: TimeContext, noteDur: number, _instInd: number) => {
    launchArc(melodyId, pitch, velocity, noteDur, state)
  }
}

/**
 * Builds a combined note play function that plays both audio and visual
 * @param melodyId Unique ID for this melody instance
 * @param state Global melody map state
 * @param audioPlayNote The original audio play note function
 * @returns A function that plays both audio and visual notes
 */
export function buildCombinedNotePlayFunction(
  melodyId: string,
  state: MelodyMapGlobalState,
  audioPlayNote: VisualNotePlayFunc
): VisualNotePlayFunc {
  const visualPlayNote = buildVisualNotePlayFunction(melodyId, state)

  return (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, instInd: number) => {
    // Play audio
    audioPlayNote(pitch, velocity, ctx, noteDur, instInd)
    // Launch visual arc
    visualPlayNote(pitch, velocity, ctx, noteDur, instInd)
  }
}

/**
 * Syncs the polygon column cache with current polygon data
 * Should be called when polygons change
 */
export function syncPolygonCache(
  state: MelodyMapGlobalState,
  polygons: PolygonRenderData
): void {
  // Clear caches for removed polygons
  const currentIds = new Set(polygons.map((p) => p.id))

  for (const id of state.polygonColumns.keys()) {
    if (!currentIds.has(id)) {
      state.polygonColumns.delete(id)
      state.polygonEdgePoints.delete(id)
    }
  }

  // Update/add caches for current melodyMap polygons
  for (const poly of polygons) {
    const anim = getTextAnim(poly.metadata)
    if (anim.fillAnim !== 'melodyMap') {
      // Remove from caches if no longer melodyMap
      state.polygonColumns.delete(poly.id)
      state.polygonEdgePoints.delete(poly.id)
      continue
    }

    // Update column cache
    state.polygonColumns.set(poly.id, anim.column as PolygonColumn)

    // Regenerate edge points (polygon shape might have changed)
    const edgePoints = poly.points.map(p => ({...p})) //generateEdgePoints(poly.points as Point[])
    state.polygonEdgePoints.set(poly.id, edgePoints)
  }

  // Clean up melody allocations for deleted polygons
  for (const [melodyId, polygonId] of state.melodyToPolygon) {
    if (!currentIds.has(polygonId)) {
      releaseMelody(melodyId, state)
    }
  }
}
