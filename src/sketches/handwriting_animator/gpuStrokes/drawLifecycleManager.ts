import * as BABYLON from 'babylonjs';
import { PriorityQueue } from './priorityQueue';
import type { LaunchConfig, AnimationControlMode } from './strokeTypes';
import { DRAWING_CONSTANTS } from './constants';
import type { StrokeTextureManager } from './strokeTextureManager';
import * as strokeAnimation from './strokeAnimation.compute.wgsl.generated';

export class DrawLifecycleManager {
  private priorityQueue: PriorityQueue<LaunchConfig>;
  private activeConfigs: Map<string, LaunchConfig>;
  private launchConfigStorage!: strokeAnimation.LaunchConfigsStorageState;
  private maxSimultaneousAnimations: number = DRAWING_CONSTANTS.MAX_ANIMATIONS;
  private nextId: number = 0;
  private strokeTextureManager?: StrokeTextureManager;
  
  constructor(engine: BABYLON.WebGPUEngine, strokeTextureManager?: StrokeTextureManager) {
    this.priorityQueue = new PriorityQueue<LaunchConfig>();
    this.activeConfigs = new Map();
    this.strokeTextureManager = strokeTextureManager;
    this.createGPUBuffer(engine);
  }
  
  private createGPUBuffer(engine: BABYLON.WebGPUEngine): void {
    this.launchConfigStorage = strokeAnimation.createStorageBuffer_launchConfigs(engine, this.maxSimultaneousAnimations);
    this.clearGPUBuffer();
  }

  updateAnimation(id: string, updates: Partial<LaunchConfig>): boolean {
    const config = this.activeConfigs.get(id);
    if (!config) {
      console.warn(`Animation with ID ${id} not found`);
      return false;
    }

    // Update the config with the new values
    Object.assign(config, updates);
    return true;
  }

  /**
   * Add new animation to queue
   */
  addAnimation(config: Omit<LaunchConfig, 'id' | 'startTime' | 'elapsedTime' | 'phase'>): string {
    const id = `anim_${this.nextId++}`;
    const currentTime = performance.now() * 0.001; // Convert to seconds
    
    const fullConfig: LaunchConfig = {
      ...config,
      id,
      startTime: currentTime,
      elapsedTime: 0,
      phase: config.startPhase, // Initialize phase with startPhase offset
      active: config.active
    };
    
    // Validate config
    const validation = this.validateConfig(fullConfig);
    if (!validation.valid) {
      throw new Error(`Invalid animation config: ${validation.errors.join(', ')}`);
    }
    
    if (fullConfig.controlMode === 'manual') {
      // For manual control, we don't add to the queue, just set active
      this.activeConfigs.set(id, fullConfig);
    } else {
      // For auto control, add to the priority queue
      const deadline = currentTime + config.totalDuration;
      this.priorityQueue.add(id, deadline, fullConfig);
    }

    return id;
  }
  
  /**
   * Update all active animations and GPU buffer
   */
  tick(currentTime: number): void {
    // Process pending animations from queue
    this.processQueue(currentTime);
    
    // Update active animations
    this.updateActiveNonManualAnimations(currentTime);
    
    // Upload to GPU
    this.uploadToGPU();
  }
  
  private processQueue(currentTime: number): void {
    // Move ready animations from queue to active set
    while (!this.priorityQueue.isEmpty() && this.activeConfigs.size < this.maxSimultaneousAnimations) {
      const next = this.priorityQueue.peek();
      if (!next) break;
      
      // Check if it's time to start this animation
      const config = next.metadata;
      if (currentTime >= config.startTime) {
        this.priorityQueue.pop();
        this.activeConfigs.set(config.id, config);
      } else {
        break; // Queue is sorted by deadline, so no more ready animations
      }
    }
    
    // Remove completed animations (but not looping ones)
    const completedIds: string[] = [];
    for (const [id, config] of this.activeConfigs) {
      if ((config.phase >= 1.0 || !config.active) && !config.loop && config.controlMode !== 'manual') {
        completedIds.push(id);
      }
    }
    
    for (const id of completedIds) {
      this.activeConfigs.delete(id);
    }
  }
  
  private updateActiveNonManualAnimations(currentTime: number): void {
    for (const config of this.activeConfigs.values()) {
      if (config.controlMode === 'manual') continue;

      // Update elapsed time and calculate base phase
      config.elapsedTime = currentTime - config.startTime;
      const basePhase = config.elapsedTime / config.totalDuration;
      
      if (config.loop) {
        // For looping animations, cycle the phase between 0 and 1, offset by startPhase
        config.phase = (basePhase + config.startPhase) % 1.0;
        // Keep animation active for looping
        config.active = true;
      } else {
        // For non-looping animations, add startPhase offset and clamp to [0,1]
        config.phase = Math.min(basePhase + config.startPhase, 1.0);
        
        // Mark as inactive if completed (phase >= 1.0)
        if (config.phase >= 1.0) {
          config.active = false;
        }
      }
    }
  }
  
  private uploadToGPU(): void {
    const storage = this.launchConfigStorage;

    // Clear buffer
    storage.data.fill(0);

    // Pack active configs into GPU buffer format
    let index = 0;
    for (const config of this.activeConfigs.values()) {
      if (index >= this.maxSimultaneousAnimations) break;
      
      const gpuConfig = this.convertToGPUFormat(config);
      strokeAnimation.writeStorageValue_launchConfigs(storage, index, gpuConfig);
      index++;
    }
    
    // Upload to GPU
    strokeAnimation.updateStorageBuffer_launchConfigs(storage);
  }
  
  private convertToGPUFormat(config: LaunchConfig): strokeAnimation.StrokeAnimationLaunchConfig {
    return {
      strokeAIndex: config.strokeAIndex,
      strokeBIndex: config.strokeBIndex,
      interpolationT: config.interpolationT,
      totalDuration: config.totalDuration,
      
      elapsedTime: config.elapsedTime,
      startPointX: config.startPoint.x,
      startPointY: config.startPoint.y,
      scale: config.scale,
      
      isActive: config.active ? 1.0 : 0.0,
      phase: config.phase,
      reserved1: 0,
      reserved2: 0
    };
  }

  private clearGPUBuffer(): void {
    const storage = this.launchConfigStorage;
    if (!storage) {
      return;
    }
    storage.data.fill(0);
    strokeAnimation.updateStorageBuffer_launchConfigs(storage);
  }
  
  /**
   * Get GPU buffer for compute shader binding
   */
  getGPUBuffer(): BABYLON.StorageBuffer {
    return this.launchConfigStorage.buffer;
  }
  
  /**
   * Clear all looped animations
   */
  clearLoopedAnimations(): void {
    const loopedIds: string[] = [];
    for (const [id, config] of this.activeConfigs) {
      if (config.loop) {
        loopedIds.push(id);
      }
    }
    
    for (const id of loopedIds) {
      this.activeConfigs.delete(id);
    }
    
    console.log(`Cleared ${loopedIds.length} looped animations`);
  }
  
  /**
   * Launch stroke with raw coordinates (no anchor calculation)
   * This is the low-level method that doesn't perform any offset calculations
   */
  launchRaw(
    startPoint: { x: number; y: number },
    strokeA: number, 
    strokeB: number,
    options: {
      interpolationT?: number;
      duration?: number;
      scale?: number;
      loop?: boolean;
      startPhase?: number;
      controlMode?: AnimationControlMode;
      active?: boolean;
    } = {}
  ): string {
    const config = {
      strokeAIndex: strokeA,
      strokeBIndex: strokeB,
      interpolationT: options.interpolationT ?? 0.0,
      totalDuration: options.duration ?? 2.0,
      startPoint,
      scale: options.scale ?? 1.0,
      loop: options.loop ?? false,
      startPhase: options.startPhase ?? 0.0,
      controlMode: options.controlMode ?? 'auto',
      active: options.active ?? true
    };
    
    return this.addAnimation(config);
  }

  /**
   * Interactive launch from mouse click (legacy method - use DrawingScene.launchStrokeWithAnchor instead)
   * @deprecated Use DrawingScene.launchStrokeWithAnchor for new code
   */
  launchStroke(
    x: number, 
    y: number, 
    strokeA: number, 
    strokeB: number,
    options: {
      interpolationT?: number;
      duration?: number;
      scale?: number;
      position?: 'start' | 'center' | 'end';
      loop?: boolean;
      startPhase?: number;
      controlMode?: AnimationControlMode;
      active?: boolean;
    } = {}
  ): string {
    // Calculate position offset based on stroke bounds and position setting
    const position = options.position ?? 'center';
    const scale = options.scale ?? 1.0;
    let offsetX = 0;
    let offsetY = 0;

    if (this.strokeTextureManager) {
      try {
        // Get pre-computed bounding boxes (no calculation needed!)
        const boundsA = this.strokeTextureManager.getStrokeBounds(strokeA);
        const boundsB = this.strokeTextureManager.getStrokeBounds(strokeB);
        
        if (boundsA && boundsB) {
          const interpolationT = options.interpolationT ?? 0.0;

          // Interpolate pre-computed bounds directly (super efficient!)
          const interpBounds = {
            minX: boundsA.minX * (1 - interpolationT) + boundsB.minX * interpolationT,
            maxX: boundsA.maxX * (1 - interpolationT) + boundsB.maxX * interpolationT,
            minY: boundsA.minY * (1 - interpolationT) + boundsB.minY * interpolationT,
            maxY: boundsA.maxY * (1 - interpolationT) + boundsB.maxY * interpolationT
          };

          if (position === 'start') {
            // Interpolate just the first point (need to get stroke data for this)
            const pointsA = this.strokeTextureManager.getStrokeData(strokeA);
            const pointsB = this.strokeTextureManager.getStrokeData(strokeB);
            const startX = pointsA[0].x * (1 - interpolationT) + pointsB[0].x * interpolationT;
            const startY = pointsA[0].y * (1 - interpolationT) + pointsB[0].y * interpolationT;
            offsetX = -startX * scale;
            offsetY = -startY * scale;
          } else if (position === 'center') {
            // Use interpolated bounding box center
            offsetX = -(interpBounds.minX + interpBounds.maxX) * 0.5 * scale;
            offsetY = -(interpBounds.minY + interpBounds.maxY) * 0.5 * scale;
          } else if (position === 'end') {
            // Interpolate just the last point (need to get stroke data for this)
            const pointsA = this.strokeTextureManager.getStrokeData(strokeA);
            const pointsB = this.strokeTextureManager.getStrokeData(strokeB);
            const lastIdx = Math.min(pointsA.length, pointsB.length) - 1;
            const endX = pointsA[lastIdx].x * (1 - interpolationT) + pointsB[lastIdx].x * interpolationT;
            const endY = pointsA[lastIdx].y * (1 - interpolationT) + pointsB[lastIdx].y * interpolationT;
            offsetX = -endX * scale;
            offsetY = -endY * scale;
          }
        } else {
          console.warn(`Missing stroke bounds for strokeA=${strokeA} or strokeB=${strokeB}`);
        }
      } catch (error) {
        console.warn('Failed to calculate stroke position offset:', error);
      }
    }

    const startPoint = { x: x + offsetX, y: y + offsetY };
    return this.launchRaw(startPoint, strokeA, strokeB, options);
  }
  
  /**
   * Cancel an active animation
   */
  cancelAnimation(id: string): boolean {
    if (this.activeConfigs.has(id)) {
      const config = this.activeConfigs.get(id)!;
      config.active = false;
      this.activeConfigs.delete(id)
      return true;
    }
    
    return this.priorityQueue.remove(id);
  }
  
  /**
   * Get status information
   */
  getStatus(): {
    activeCount: number;
    queuedCount: number;
    maxCapacity: number;
    canAcceptMore: boolean;
  } {
    return {
      activeCount: this.activeConfigs.size,
      queuedCount: this.priorityQueue.size(),
      maxCapacity: this.maxSimultaneousAnimations,
      canAcceptMore: this.activeConfigs.size < this.maxSimultaneousAnimations
    };
  }
  
  /**
   * Clear all animations
   */
  clearAll(): void {
    this.activeConfigs.clear();
    while (!this.priorityQueue.isEmpty()) {
      this.priorityQueue.pop();
    }
    this.clearGPUBuffer();
  }
  
  /**
   * Validate animation configuration
   */
  private validateConfig(config: LaunchConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (config.strokeAIndex < 0 || config.strokeAIndex >= DRAWING_CONSTANTS.MAX_STROKES) {
      errors.push(`strokeAIndex ${config.strokeAIndex} out of range [0, ${DRAWING_CONSTANTS.MAX_STROKES})`);
    }
    
    if (config.strokeBIndex < 0 || config.strokeBIndex >= DRAWING_CONSTANTS.MAX_STROKES) {
      errors.push(`strokeBIndex ${config.strokeBIndex} out of range [0, ${DRAWING_CONSTANTS.MAX_STROKES})`);
    }
    
    if (config.interpolationT < 0 || config.interpolationT > 1) {
      errors.push(`interpolationT ${config.interpolationT} out of range [0, 1]`);
    }
    
    if (config.totalDuration <= 0) {
      errors.push(`totalDuration ${config.totalDuration} must be positive`);
    }
    
    if (config.scale <= 0) {
      errors.push(`scale ${config.scale} must be positive`);
    }
    
    if (!isFinite(config.startPoint.x) || !isFinite(config.startPoint.y)) {
      errors.push(`startPoint coordinates must be finite: (${config.startPoint.x}, ${config.startPoint.y})`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Dispose of GPU resources
   */
  dispose(): void {
    if (this.launchConfigStorage) {
      this.launchConfigStorage.buffer.dispose();
    }
  }
}
