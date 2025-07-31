import type { Stroke, StrokePoint } from './strokeTypes';
import { DRAWING_CONSTANTS } from './constants';

export class StrokeInterpolator {
  private readonly NORMALIZED_POINT_COUNT = DRAWING_CONSTANTS.POINTS_PER_STROKE;
  
  /**
   * Normalize stroke to standard length using arc-length parameterization
   */
  normalizeStroke(stroke: Stroke): StrokePoint[] {
    if (stroke.points.length < 2) {
      throw new Error('Stroke must have at least 2 points');
    }
    
    // Calculate cumulative arc lengths
    const arcLengths = this.calculateArcLengthParams(stroke.points);
    const totalLength = arcLengths[arcLengths.length - 1];
    
    if (totalLength === 0) {
      throw new Error('Stroke has zero length');
    }
    
    const normalizedPoints: StrokePoint[] = [];
    
    for (let i = 0; i < this.NORMALIZED_POINT_COUNT; i++) {
      const targetT = i / (this.NORMALIZED_POINT_COUNT - 1);
      const targetLength = targetT * totalLength;
      
      // Find the segment containing this arc length
      let segmentIndex = 0;
      for (let j = 1; j < arcLengths.length; j++) {
        if (arcLengths[j] >= targetLength) {
          segmentIndex = j - 1;
          break;
        }
      }
      
      // Handle edge case for last point
      if (segmentIndex >= stroke.points.length - 1) {
        segmentIndex = stroke.points.length - 2;
      }
      
      // Interpolate between points using cubic spline
      
      const segmentStart = arcLengths[segmentIndex];
      const segmentEnd = arcLengths[segmentIndex + 1];
      const segmentLength = segmentEnd - segmentStart;
      
      let localT = 0;
      if (segmentLength > 0) {
        localT = (targetLength - segmentStart) / segmentLength;
      }
      
      // Cubic spline interpolation for smoother results
      const interpolatedPoint = this.cubicSplineInterpolate(
        stroke.points,
        segmentIndex,
        localT
      );
      
      normalizedPoints.push({
        x: interpolatedPoint.x,
        y: interpolatedPoint.y,
        t: targetT
      });
    }
    
    return normalizedPoints;
  }
  
  /**
   * Interpolate between two normalized strokes
   */
  interpolateStrokes(strokeA: StrokePoint[], strokeB: StrokePoint[], t: number): StrokePoint[] {
    if (strokeA.length !== strokeB.length) {
      throw new Error('Strokes must have the same number of points for interpolation');
    }
    
    if (strokeA.length !== this.NORMALIZED_POINT_COUNT) {
      throw new Error(`Strokes must be normalized to ${this.NORMALIZED_POINT_COUNT} points`);
    }
    
    const clampedT = Math.max(0, Math.min(1, t));
    const interpolatedPoints: StrokePoint[] = [];
    
    for (let i = 0; i < strokeA.length; i++) {
      const pointA = strokeA[i];
      const pointB = strokeB[i];
      
      interpolatedPoints.push({
        x: pointA.x + (pointB.x - pointA.x) * clampedT,
        y: pointA.y + (pointB.y - pointA.y) * clampedT,
        t: pointA.t // t should be the same for both strokes
      });
    }
    
    return interpolatedPoints;
  }
  
  /**
   * Calculate arc-length parameterization for even spacing
   */
  private calculateArcLengthParams(points: StrokePoint[]): number[] {
    const arcLengths: number[] = [0];
    let cumulativeLength = 0;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const segmentLength = Math.sqrt(dx * dx + dy * dy);
      
      cumulativeLength += segmentLength;
      arcLengths.push(cumulativeLength);
    }
    
    return arcLengths;
  }
  
  /**
   * Cubic spline interpolation between points for smooth curves
   */
  private cubicSplineInterpolate(points: StrokePoint[], segmentIndex: number, t: number): StrokePoint {
    const n = points.length;
    
    // Clamp segment index
    const i = Math.max(0, Math.min(segmentIndex, n - 2));
    
    // Get control points (with boundary handling)
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[Math.min(n - 1, i + 1)];
    const p3 = points[Math.min(n - 1, i + 2)];
    
    // Catmull-Rom spline coefficients
    const t2 = t * t;
    const t3 = t2 * t;
    
    const a0 = -0.5 * t3 + t2 - 0.5 * t;
    const a1 = 1.5 * t3 - 2.5 * t2 + 1.0;
    const a2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
    const a3 = 0.5 * t3 - 0.5 * t2;
    
    const x = a0 * p0.x + a1 * p1.x + a2 * p2.x + a3 * p3.x;
    const y = a0 * p0.y + a1 * p1.y + a2 * p2.y + a3 * p3.y;
    
    return { x, y, t: p1.t + (p2.t - p1.t) * t };
  }
  
  /**
   * Validate that a stroke is properly normalized
   */
  validateNormalizedStroke(points: StrokePoint[]): boolean {
    if (points.length !== this.NORMALIZED_POINT_COUNT) {
      return false;
    }
    
    // Check that t values are properly distributed
    for (let i = 0; i < points.length; i++) {
      const expectedT = i / (points.length - 1);
      const actualT = points[i].t;
      
      // Allow small floating point tolerance
      if (Math.abs(expectedT - actualT) > 1e-6) {
        return false;
      }
    }
    
    return true;
  }
}
