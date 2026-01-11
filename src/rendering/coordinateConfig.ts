/**
 * Coordinate system configuration for managing Y-axis direction differences
 * between Konva/p5.js (Y-down) and shader texture sampling conventions.
 *
 * Coordinate systems:
 * - Konva/p5.js/Canvas2D: Origin top-left, Y increases downward
 * - WebGL texture UVs: Origin bottom-left, V increases upward (standard OpenGL)
 * - WebGPU (Babylon): Origin top-left, handled via invertY on upload
 *
 * When Babylon's WebGPU backend uploads canvas textures with invertY=true,
 * the texture ends up in Y-down space matching the source canvas.
 * WebGL's DynamicTexture upload does NOT flip, so textures remain in canvas Y-down
 * but are sampled with OpenGL's Y-up UV convention, causing a mismatch.
 */

/**
 * Engine-like object that may have the isWebGPU property.
 * Using a minimal interface to avoid type compatibility issues between
 * BABYLON.Engine and BABYLON.WebGPUEngine.
 */
interface EngineWithWebGPUFlag {
  isWebGPU?: boolean
}

/**
 * Detect if the engine is WebGPU-based.
 * WebGPU engines have different texture coordinate handling than WebGL.
 */
export const isWebGPUEngine = (engine: EngineWithWebGPUFlag): boolean => {
  // WebGPUEngine has isWebGPU property set to true
  return engine.isWebGPU === true
}

/**
 * Determine if polygon Y coordinates need flipping for the given engine.
 *
 * The polygon mask shader compares UV coordinates against normalized polygon points.
 * We need the polygon points to match the texture's Y orientation.
 *
 * - WebGPU: Babylon uploads with invertY=true, flipping the texture. The shader's
 *           UV.y=0 corresponds to the TOP of the original canvas. Polygon points
 *           at y=minY (top) should map to UV.y=0, but our normalization gives 0.
 *           However, the texture is flipped, so we need to flip polygon Y to match.
 * - WebGL: DynamicTexture upload does not flip. Canvas row 0 (top) maps to texture
 *           row 0, which in OpenGL is at v=0 (bottom). So UV.y=0 is the TOP of
 *           the original canvas content. Polygon normalization gives y=minY → 0,
 *           which matches. No flip needed.
 */
export const shouldFlipPolygonY = (engine: EngineWithWebGPUFlag): boolean => {
  // WebGPU needs Y-flip because invertY on upload flips the texture
  // WebGL does NOT need flip because canvas top maps to texture v=0
  return isWebGPUEngine(engine)
}

/**
 * Normalize a Y coordinate from canvas/Konva space to shader UV space.
 *
 * @param y - The Y coordinate in canvas space (Y-down, origin top-left)
 * @param bboxMinY - The minimum Y of the bounding box
 * @param bboxH - The height of the bounding box
 * @param flipY - Whether to flip Y for the target coordinate system
 * @returns Normalized Y in [0, 1] range, flipped if necessary
 */
export const normalizeYForShader = (
  y: number,
  bboxMinY: number,
  bboxH: number,
  flipY: boolean
): number => {
  const h = Math.max(1e-6, bboxH)
  const normalized = Math.min(1, Math.max(0, (y - bboxMinY) / h))
  return flipY ? 1 - normalized : normalized
}

/**
 * Normalize a point from canvas/Konva space to shader UV space.
 *
 * @param point - The point in canvas space
 * @param bbox - The bounding box for normalization
 * @param flipY - Whether to flip Y for the target coordinate system
 * @returns Normalized point in [0, 1] UV space
 */
export const normalizePointForShader = (
  point: { x: number; y: number },
  bbox: { minX: number; minY: number; w: number; h: number },
  flipY: boolean
): { x: number; y: number } => {
  const w = Math.max(1e-6, bbox.w)
  const h = Math.max(1e-6, bbox.h)
  const normalizedX = Math.min(1, Math.max(0, (point.x - bbox.minX) / w))
  const normalizedY = Math.min(1, Math.max(0, (point.y - bbox.minY) / h))
  return {
    x: normalizedX,
    y: flipY ? 1 - normalizedY : normalizedY,
  }
}
