import type { StrokeTextureManager } from './strokeTextureManager'

export type AnchorKind =
  | 'start'
  | 'center'
  | 'end'
  | 'bbox-center'
  | 'bbox-tl'
  | 'bbox-tr'
  | 'bbox-bl'
  | 'bbox-br'

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Calculate anchor point for a single stroke (possibly interpolated)
 */
export function getStrokeAnchor(
  textureManager: StrokeTextureManager,
  strokeA: number,
  strokeB: number,
  interpolationT: number,
  anchorKind: AnchorKind
): Point {
  try {
    // Get stroke data and bounds
    const pointsA = textureManager.getStrokeData(strokeA)
    const pointsB = textureManager.getStrokeData(strokeB)
    const boundsA = textureManager.getStrokeBounds(strokeA)
    const boundsB = textureManager.getStrokeBounds(strokeB)

    if (!pointsA || !pointsB || !boundsA || !boundsB) {
      console.warn(`Missing stroke data for strokeA=${strokeA} or strokeB=${strokeB}`)
      return { x: 0, y: 0 }
    }

    switch (anchorKind) {
      case 'start': {
        // Interpolate first points
        const startX = pointsA[0].x * (1 - interpolationT) + pointsB[0].x * interpolationT
        const startY = pointsA[0].y * (1 - interpolationT) + pointsB[0].y * interpolationT
        return { x: startX, y: startY }
      }

      case 'end': {
        // Interpolate last points
        const lastIdxA = pointsA.length - 1
        const lastIdxB = pointsB.length - 1
        const endX = pointsA[lastIdxA].x * (1 - interpolationT) + pointsB[lastIdxB].x * interpolationT
        const endY = pointsA[lastIdxA].y * (1 - interpolationT) + pointsB[lastIdxB].y * interpolationT
        return { x: endX, y: endY }
      }

      case 'center':
      case 'bbox-center': {
        // Interpolate bounding box centers
        const centerX = ((boundsA.minX + boundsA.maxX) * 0.5) * (1 - interpolationT) +
          ((boundsB.minX + boundsB.maxX) * 0.5) * interpolationT
        const centerY = ((boundsA.minY + boundsA.maxY) * 0.5) * (1 - interpolationT) +
          ((boundsB.minY + boundsB.maxY) * 0.5) * interpolationT
        return { x: centerX, y: centerY }
      }

      case 'bbox-tl': {
        // Interpolate top-left corners
        const tlX = boundsA.minX * (1 - interpolationT) + boundsB.minX * interpolationT
        const tlY = boundsA.minY * (1 - interpolationT) + boundsB.minY * interpolationT
        return { x: tlX, y: tlY }
      }

      case 'bbox-tr': {
        // Interpolate top-right corners
        const trX = boundsA.maxX * (1 - interpolationT) + boundsB.maxX * interpolationT
        const trY = boundsA.minY * (1 - interpolationT) + boundsB.minY * interpolationT
        return { x: trX, y: trY }
      }

      case 'bbox-bl': {
        // Interpolate bottom-left corners
        const blX = boundsA.minX * (1 - interpolationT) + boundsB.minX * interpolationT
        const blY = boundsA.maxY * (1 - interpolationT) + boundsB.maxY * interpolationT
        return { x: blX, y: blY }
      }

      case 'bbox-br': {
        // Interpolate bottom-right corners
        const brX = boundsA.maxX * (1 - interpolationT) + boundsB.maxX * interpolationT
        const brY = boundsA.maxY * (1 - interpolationT) + boundsB.maxY * interpolationT
        return { x: brX, y: brY }
      }

      default:
        console.warn(`Unknown anchor kind: ${anchorKind}`)
        return { x: 0, y: 0 }
    }
  } catch (error) {
    console.warn('Failed to calculate stroke anchor:', error)
    return { x: 0, y: 0 }
  }
}

/**
 * Calculate bounding box that encompasses all strokes in a group
 */
export function calculateGroupBounds(
  textureManager: StrokeTextureManager,
  strokeIndices: number[]
): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const strokeIndex of strokeIndices) {
    const bounds = textureManager.getStrokeBounds(strokeIndex)
    if (bounds) {
      minX = Math.min(minX, bounds.minX)
      maxX = Math.max(maxX, bounds.maxX)
      minY = Math.min(minY, bounds.minY)
      maxY = Math.max(maxY, bounds.maxY)
    }
  }

  return { minX, maxX, minY, maxY }
}

/**
 * Get the chronologically first stroke (lowest creation time)
 * For now, we'll use the first in the array - could be enhanced with actual timing data
 */
function getEarliestStroke(strokeIndices: number[]): number {
  return strokeIndices[0] || 0
}

/**
 * Get the chronologically last stroke (highest creation time)
 * For now, we'll use the last in the array - could be enhanced with actual timing data
 */
function getLatestStroke(strokeIndices: number[]): number {
  return strokeIndices[strokeIndices.length - 1] || 0
}

/**
 * Calculate anchor point for a group of strokes
 */
export function getGroupAnchor(
  textureManager: StrokeTextureManager,
  strokeIndices: number[],
  anchorKind: AnchorKind
): Point {
  if (strokeIndices.length === 0) {
    return { x: 0, y: 0 }
  }

  try {
    switch (anchorKind) {
      case 'start': {
        // First point of chronologically first stroke
        const firstStroke = getEarliestStroke(strokeIndices)
        const strokeData = textureManager.getStrokeData(firstStroke)
        if (strokeData && strokeData.length > 0) {
          return { x: strokeData[0].x, y: strokeData[0].y }
        }
        return { x: 0, y: 0 }
      }

      case 'end': {
        // Last point of chronologically last stroke
        const lastStroke = getLatestStroke(strokeIndices)
        const strokeData = textureManager.getStrokeData(lastStroke)
        if (strokeData && strokeData.length > 0) {
          const lastPoint = strokeData[strokeData.length - 1]
          return { x: lastPoint.x, y: lastPoint.y }
        }
        return { x: 0, y: 0 }
      }

      case 'center':
      case 'bbox-center': {
        // Center of bounding box encompassing all strokes
        const groupBounds = calculateGroupBounds(textureManager, strokeIndices)
        return {
          x: (groupBounds.minX + groupBounds.maxX) / 2,
          y: (groupBounds.minY + groupBounds.maxY) / 2
        }
      }

      case 'bbox-tl': {
        const bounds = calculateGroupBounds(textureManager, strokeIndices)
        return { x: bounds.minX, y: bounds.minY }
      }

      case 'bbox-tr': {
        const bounds = calculateGroupBounds(textureManager, strokeIndices)
        return { x: bounds.maxX, y: bounds.minY }
      }

      case 'bbox-bl': {
        const bounds = calculateGroupBounds(textureManager, strokeIndices)
        return { x: bounds.minX, y: bounds.maxY }
      }

      case 'bbox-br': {
        const bounds = calculateGroupBounds(textureManager, strokeIndices)
        return { x: bounds.maxX, y: bounds.maxY }
      }

      default:
        console.warn(`Unknown anchor kind: ${anchorKind}`)
        return { x: 0, y: 0 }
    }
  } catch (error) {
    console.warn('Failed to calculate group anchor:', error)
    return { x: 0, y: 0 }
  }
}
