// Shared constants for the drawing animation system

const MAX_STROKES = 1024;

export const DRAWING_CONSTANTS = {
  // Stroke resolution
  POINTS_PER_STROKE: 1024,
  
  // System limits
  MAX_STROKES: 1024,
  MAX_ANIMATIONS: 1024,
  
  // GPU optimization
  WORKGROUP_SIZE: 64,
  
  // Buffer sizes (in bytes)
  LAUNCH_CONFIG_SIZE: 12 * 4, // 12 floats per config
  MATRIX_SIZE: 16 * 4, // 16 floats per matrix (4 vec4)
  
  // Texture dimensions  
  STROKE_TEXTURE_WIDTH: 1024, // Points per stroke
  STROKE_TEXTURE_HEIGHT: MAX_STROKES,  // Number of strokes
  
  // Memory calculations
  STROKE_TEXTURE_BYTES: 1024 * 1024 * 2 * 2, // width × height × 2 channels × 2 bytes per half-float = 4MB
} as const;

// Type-safe access to constants
export type DrawingConstants = typeof DRAWING_CONSTANTS;
