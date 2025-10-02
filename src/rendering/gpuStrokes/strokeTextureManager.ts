import * as BABYLON from 'babylonjs';
import type { StrokePoint, Stroke } from './strokeTypes';
import { DRAWING_CONSTANTS } from './constants';

// Float16Array is available in Chrome but TypeScript doesn't know about it yet
declare global {
  const Float16Array: {
    new(length: number): any;
    new(array: ArrayLike<number>): any;
    new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): any;
    from(array: ArrayLike<number>): any;
  };
}

type BBox = { minX: number; maxX: number; minY: number; maxY: number }

export class StrokeTextureManager {
  private engine: BABYLON.WebGPUEngine;
  private strokeTexture!: BABYLON.RawTexture;
  private maxStrokes: number = DRAWING_CONSTANTS.MAX_STROKES;
  private pointsPerStroke: number = DRAWING_CONSTANTS.POINTS_PER_STROKE;
  private textureData!: Float32Array;
  private strokeMetadata: Map<number, Stroke> = new Map();

  constructor(engine: BABYLON.WebGPUEngine) {
    this.engine = engine;
    this.createStrokeTexture();
  }

  private createStrokeTexture(): void {
    // Create RG32Float texture: 1024 width (points) x 1024 height (strokes)
    // Each texel stores (x,y) coordinates as RG channels
    const texWidth = this.pointsPerStroke;
    const texHeight = this.maxStrokes;

    // Initialize texture data with zeros
    this.textureData = new Float32Array(texWidth * texHeight * 2);

    // Convert Float32Array to Float16Array for proper half-float storage
    const float16Array = new Float16Array(this.textureData);

    this.strokeTexture = new BABYLON.RawTexture(
      float16Array,
      texWidth,
      texHeight,
      BABYLON.Constants.TEXTUREFORMAT_RG,
      this.engine,
      false, // no mipmaps
      false, // not a cube
      BABYLON.Texture.LINEAR_LINEAR,
      BABYLON.Constants.TEXTURETYPE_HALF_FLOAT, // Use half-float for filterable sampling
      undefined,
      undefined,
      undefined // Remove storage flag - this texture is for sampling only
    );

    // Set proper texture wrapping
    this.strokeTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    this.strokeTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  }

  /**
   * Upload full stroke object to specific row in texture
   */
  uploadStroke(strokeIndex: number, stroke: Stroke): void {
    this.strokeMetadata.set(strokeIndex, stroke);
    this.uploadStrokePoints(strokeIndex, stroke.points);
  }

  /**
   * Upload stroke points to specific row in texture (internal method)
   */
  private uploadStrokePoints(strokeIndex: number, points: StrokePoint[]): void {
    if (strokeIndex < 0 || strokeIndex >= this.maxStrokes) {
      throw new Error(`Stroke index ${strokeIndex} out of range [0, ${this.maxStrokes})`);
    }

    if (points.length !== this.pointsPerStroke) {
      throw new Error(`Stroke must have exactly ${this.pointsPerStroke} points, got ${points.length}`);
    }

    // Calculate the starting index for this stroke row
    const rowStartIndex = strokeIndex * this.pointsPerStroke * 2; // 2 floats per point (RG)

    // Copy stroke data into texture buffer
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const bufferIndex = rowStartIndex + i * 2;

      this.textureData[bufferIndex] = point.x;      // R channel
      this.textureData[bufferIndex + 1] = point.y;  // G channel
    }

    // Update the texture on GPU - convert Float32 to Float16
    const float16Array = new Float16Array(this.textureData);
    this.strokeTexture.update(float16Array);
  }

  /**
   * Batch upload multiple strokes for efficiency
   */
  uploadStrokes(strokes: { index: number; stroke: Stroke }[]): void {
    let needsUpdate = false;

    for (const strokeEntry of strokes) {
      if (strokeEntry.index < 0 || strokeEntry.index >= this.maxStrokes) {
        console.warn(`Skipping stroke index ${strokeEntry.index} - out of range [0, ${this.maxStrokes})`);
        continue;
      }

      if (strokeEntry.stroke.points.length !== this.pointsPerStroke) {
        console.warn(`Skipping stroke ${strokeEntry.index} - incorrect point count ${strokeEntry.stroke.points.length}, expected ${this.pointsPerStroke}`);
        continue;
      }

      // Store metadata for this stroke
      this.strokeMetadata.set(strokeEntry.index, strokeEntry.stroke);

      // Calculate the starting index for this stroke row
      const rowStartIndex = strokeEntry.index * this.pointsPerStroke * 2;

      // Copy stroke data into texture buffer
      for (let i = 0; i < strokeEntry.stroke.points.length; i++) {
        const point = strokeEntry.stroke.points[i];
        const bufferIndex = rowStartIndex + i * 2;

        this.textureData[bufferIndex] = point.x;      // R channel
        this.textureData[bufferIndex + 1] = point.y;  // G channel
      }

      needsUpdate = true;
    }

    // Single GPU update after all strokes are processed
    if (needsUpdate) {
      const float16Array = new Float16Array(this.textureData);
      this.strokeTexture.update(float16Array);
    }
  }

  /**
   * Clear a specific stroke from the texture
   */
  clearStroke(strokeIndex: number): void {
    if (strokeIndex < 0 || strokeIndex >= this.maxStrokes) {
      throw new Error(`Stroke index ${strokeIndex} out of range [0, ${this.maxStrokes})`);
    }

    const rowStartIndex = strokeIndex * this.pointsPerStroke * 2;

    // Zero out the stroke data
    for (let i = 0; i < this.pointsPerStroke * 2; i++) {
      this.textureData[rowStartIndex + i] = 0;
    }

    const float16Array = new Float16Array(this.textureData);
    this.strokeTexture.update(float16Array);
  }

  /**
   * Clear all stroke data
   */
  clearAllStrokes(): void {
    this.textureData.fill(0);
    const float16Array = new Float16Array(this.textureData);
    this.strokeTexture.update(float16Array);
  }

  /**
   * Get texture for binding to compute shader
   */
  getStrokeTexture(): BABYLON.RawTexture {
    return this.strokeTexture;
  }

  /**
   * Get texture dimensions
   */
  getTextureDimensions(): { width: number; height: number } {
    return {
      width: this.pointsPerStroke,
      height: this.maxStrokes
    };
  }

  /**
   * Get memory usage information
   */
  getMemoryInfo(): {
    totalBytes: number;
    usedBytes: number;
    bytesPerStroke: number;
  } {
    const bytesPerStroke = this.pointsPerStroke * 2 * 2; // 2 half-floats * 2 bytes per half-float
    const totalBytes = this.maxStrokes * bytesPerStroke;

    return {
      totalBytes,
      usedBytes: totalBytes, // Always fully allocated
      bytesPerStroke
    };
  }

  /**
   * Validate stroke data before upload
   */
  validateStrokeData(points: StrokePoint[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (points.length !== this.pointsPerStroke) {
      errors.push(`Point count mismatch: expected ${this.pointsPerStroke}, got ${points.length}`);
    }

    // Check for valid coordinates
    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      if (!isFinite(point.x) || !isFinite(point.y)) {
        errors.push(`Point ${i} has invalid coordinates: (${point.x}, ${point.y})`);
      }

      if (point.t < 0 || point.t > 1) {
        errors.push(`Point ${i} has invalid t parameter: ${point.t} (should be [0,1])`);
      }
    }

    // Check t parameter progression
    for (let i = 1; i < points.length; i++) {
      if (points[i].t < points[i - 1].t) {
        errors.push(`Point ${i} has decreasing t parameter: ${points[i].t} < ${points[i - 1].t}`);
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get raw texture data for debugging
   */
  getTextureData(): Float32Array {
    return this.textureData;
  }

  /**
   * Get stroke bounding box for a specific stroke index
   */
  getStrokeBounds(strokeIndex: number): BBox | null {
    const stroke = this.strokeMetadata.get(strokeIndex);
    return stroke ? stroke.boundingBox : null;
  }

  getStrokeGroupBounds(strokeIndexes: number[]): BBox | null {
    const bboxes = strokeIndexes.map(i => {
      const stroke = this.strokeMetadata.get(i);
      return stroke ? stroke.boundingBox : null;
    }).filter(bb => bb != null)

    if (bboxes.length == 0) return null
    
    return combineBoundingBoxes(bboxes)
  }

  /**
   * Get stroke data for a specific stroke index (for debugging)
   */
  getStrokeData(strokeIndex: number): { x: number; y: number }[] {
    if (strokeIndex < 0 || strokeIndex >= this.maxStrokes) {
      throw new Error(`Stroke index ${strokeIndex} out of range [0, ${this.maxStrokes})`);
    }

    const points: { x: number; y: number }[] = [];
    const rowStartIndex = strokeIndex * this.pointsPerStroke * 2;

    for (let i = 0; i < this.pointsPerStroke; i++) {
      const bufferIndex = rowStartIndex + i * 2;
      points.push({
        x: this.textureData[bufferIndex],
        y: this.textureData[bufferIndex + 1]
      });
    }

    return points;
  }

  /**
   * Dispose of GPU resources
   */
  dispose(): void {
    if (this.strokeTexture) {
      this.strokeTexture.dispose();
    }
  }
}

export const combineBoundingBoxes = (boxes: BBox[]): BBox => {
  const minX = Math.min(...boxes.map(b => b.minX))
  const maxX = Math.max(...boxes.map(b => b.maxX))
  const minY = Math.min(...boxes.map(b => b.minY))
  const maxY = Math.max(...boxes.map(b => b.maxY))

  return { minX, maxX, minY, maxY }
}