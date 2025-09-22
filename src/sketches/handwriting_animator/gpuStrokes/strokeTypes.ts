// Type definitions for stroke data

import type { StrokeAnimationLaunchConfig } from './strokeAnimation.wgsl.generated';

export type StrokePoint = {
  x: number;
  y: number;
  t: number; // normalized time parameter [0,1]
}

export type Stroke = {
  id: string;
  points: StrokePoint[];
  boundingBox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export type AnimationControlMode = 'manual' | 'auto';

export type LaunchConfig = {
  id: string;
  strokeAIndex: number;     // Index into stroke texture (0-63)
  strokeBIndex: number;     // Index for interpolation target
  interpolationT: number;   // Blend factor between strokeA and strokeB [0,1]
  
  // Timing
  totalDuration: number;    // Total animation duration in seconds
  elapsedTime: number;      // Current elapsed time
  startTime: number;        // When animation started
  startPhase: number;       // Initial phase offset [0,1]
  controlMode: AnimationControlMode;      // Whether to control time manually
  
  // Spatial transform
  startPoint: { x: number; y: number };  // Canvas coordinates
  scale: number;            // Size multiplier
  
  // Animation state
  active: boolean;
  phase: number;           // Current animation phase [0,1]
  loop: boolean;           // Whether animation should loop continuously
}

// GPU-compatible layout (aligned to 16-byte boundaries)
export type GPULaunchConfig = StrokeAnimationLaunchConfig;
