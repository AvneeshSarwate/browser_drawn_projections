import type { Point } from './textRegionUtils'

/**
 * Represents a single traveling circle arc animation
 * A circle moves from startPoint to endPoint over the noteDuration
 */
export type ArcAnimation = {
  id: string                    // Unique ID for this arc
  startPoint: Point             // Starting position on polygon edge
  endPoint: Point               // Ending position on polygon edge
  startTime: number             // When the animation started (performance.now())
  duration: number              // Duration in seconds (same as note duration)
  pitch: number                 // MIDI pitch for color
  velocity: number              // Note velocity for opacity/size
  melodyRootBlend: number       // 0-1 blend based on first note (D=0, C#=1)
  melodyProgBlend: number       // 0-1 position of this note within the melody timeline
}

/**
 * Draw info for a single melody - contains all active arcs for this melody
 */
export type MelodyDrawInfo = {
  melodyId: string
  polygonId: string
  activeArcs: ArcAnimation[]    // Currently animating arcs
  melodyRootBlend: number | null // Calculated from first note's pitch (D=0, C#=1)
  melodyStartTime: number | null // When the first note of the melody was launched
  melodyDurationMs: number | null // Duration used to normalize melodyProgBlend
}

/**
 * Render state for melodyMap polygons - consumed by polygonFx.ts drawing
 */
export type MelodyMapRenderState = {
  arcs: ArcAnimation[]          // All active arcs to draw for this polygon
}

/**
 * Column type for polygon assignment
 */
export type PolygonColumn = 'left' | 'middle' | 'right'

/**
 * Global state for the melody-to-polygon mapping system
 */
export type MelodyMapGlobalState = {
  // Maps melodyId to the assigned polygonId
  melodyToPolygon: Map<string, string>

  // Maps melodyId to its draw info (active arcs)
  melodyDrawInfo: Map<string, MelodyDrawInfo>

  // Counter that alternates between 'left' and 'right' for each new melody
  columnCounter: number

  // Maps polygonId to column type for quick lookup
  polygonColumns: Map<string, PolygonColumn>

  // Maps polygonId to cached edge points for random selection
  polygonEdgePoints: Map<string, Point[]>
}

/**
 * Creates the initial melody map global state
 */
export function createMelodyMapState(): MelodyMapGlobalState {
  return {
    melodyToPolygon: new Map(),
    melodyDrawInfo: new Map(),
    columnCounter: 0,
    polygonColumns: new Map(),
    polygonEdgePoints: new Map()
  }
}

/**
 * Gets the target column based on the current counter (alternates left/right)
 */
export function getTargetColumn(counter: number): PolygonColumn {
  return counter % 2 === 0 ? 'left' : 'right'
}

/**
 * Interpolates a point along an arc from start to end
 * @param arc The arc animation
 * @param progress 0-1 progress along the arc
 */
export function interpolateArcPosition(arc: ArcAnimation, progress: number): Point {
  const t = Math.max(0, Math.min(1, progress))
  return {
    x: arc.startPoint.x + (arc.endPoint.x - arc.startPoint.x) * t,
    y: arc.startPoint.y + (arc.endPoint.y - arc.startPoint.y) * t
  }
}

/**
 * Gets the current progress of an arc (0-1, can exceed 1 if past duration)
 */
export function getArcProgress(arc: ArcAnimation, currentTime: number): number {
  const elapsed = (currentTime - arc.startTime) / 1000 // Convert to seconds
  return elapsed / arc.duration
}
