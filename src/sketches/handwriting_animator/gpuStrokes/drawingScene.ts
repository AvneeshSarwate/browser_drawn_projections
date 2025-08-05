import * as BABYLON from 'babylonjs';
import { StrokeDataGenerator } from './strokeDataGenerator';
import { StrokeInterpolator } from './strokeInterpolator';
import { StrokeTextureManager } from './strokeTextureManager';
import { DrawLifecycleManager } from './drawLifecycleManager';
import { DRAWING_CONSTANTS } from './constants';
import strokeAnimationWGSL from './strokeAnimation.wgsl?raw';
import Stats from '@/rendering/stats';
import type { LaunchConfig } from './strokeTypes';
import { getStrokeAnchor, getGroupAnchor, type AnchorKind } from './coordinateUtils';

export class DrawingScene {
  private engine!: BABYLON.WebGPUEngine;
  private scene!: BABYLON.Scene;
  private strokeTextureManager!: StrokeTextureManager;
  private lifecycleManager!: DrawLifecycleManager;
  private computeShader!: BABYLON.ComputeShader;
  private instancedMesh!: BABYLON.Mesh;
  private matrixBuffer!: BABYLON.StorageBuffer;
  private globalParamsBuffer!: BABYLON.UniformBuffer;
  private maxAnimations: number = DRAWING_CONSTANTS.MAX_ANIMATIONS;
  private pointsPerStroke: number = DRAWING_CONSTANTS.POINTS_PER_STROKE;
  private maxInstances: number = this.maxAnimations * this.pointsPerStroke;
  private canvasWidth!: number;
  private canvasHeight!: number;
  
  async createScene(canvas: HTMLCanvasElement, stats: Stats): Promise<void> {
    // Store canvas dimensions for use throughout the system
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;
    
    await this.initializeEngine(canvas);
    this.setupCamera();
    // await this.setupStrokeData(); // only for test data
    this.setupMaterials();
    await this.setupComputeShader();
    this.startRenderLoop(stats);
  }
  
  private async initializeEngine(canvas: HTMLCanvasElement): Promise<void> {
    // Check for WebGPU support
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser");
    }
    
    // Initialize WebGPU engine
    this.engine = new BABYLON.WebGPUEngine(canvas);
    await this.engine.initAsync();
    
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.1, 0.1, 0.1, 1);
    
    // Initialize managers
    this.strokeTextureManager = new StrokeTextureManager(this.engine);
    this.lifecycleManager = new DrawLifecycleManager(this.engine, this.strokeTextureManager);
  }
  
  private setupCamera(): void {
    // Create orthographic camera for 2D rendering
    const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -1), this.scene);
    
    // Set up orthographic projection to match canvas coordinates
    const aspectRatio = this.canvasWidth / this.canvasHeight;
    
    camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    camera.orthoLeft = -aspectRatio;
    camera.orthoRight = aspectRatio;
    camera.orthoTop = 1;
    camera.orthoBottom = -1;
    camera.minZ = 0.1;
    camera.maxZ = 100;
  }
  
  private async setupStrokeData(): Promise<void> {
    // Generate test strokes
    const generator = new StrokeDataGenerator();
    const interpolator = new StrokeInterpolator();
    
    const testStrokes = generator.generateTestStrokes();
    
    // Normalize and upload to GPU
    const normalizedStrokes = testStrokes.slice(0, DRAWING_CONSTANTS.MAX_STROKES).map((stroke, index) => {
      const normalizedPoints = interpolator.normalizeStroke(stroke);
      
      // Validate normalized stroke
      if (!interpolator.validateNormalizedStroke(normalizedPoints)) {
        throw new Error(`Failed to normalize stroke ${stroke.id}`);
      }
      
      // Create normalized stroke object with original bounding box
      const normalizedStroke = {
        ...stroke,
        points: normalizedPoints
      };
      
      return {
        index,
        stroke: normalizedStroke
      };
    });
    
    this.strokeTextureManager.uploadStrokes(normalizedStrokes);
    
    console.log(`Uploaded ${normalizedStrokes.length} test strokes to GPU`);
  }
  
  private setupMaterials(): void {
    // Create base mesh for instancing (2D circle)
    const aspectRatio = this.canvasWidth / this.canvasHeight;
    const targetPixelSize = 50; // Larger base size for visibility
    const orthoWidth = 2 * aspectRatio;
    const circleRadius = (targetPixelSize / this.canvasWidth) * orthoWidth * 0.5;
    
    this.instancedMesh = BABYLON.MeshBuilder.CreateDisc(
      "strokePoint",
      {
        radius: circleRadius,
        tessellation: 8 // Simple circles for performance
      },
      this.scene
    );
    
    // Create material
    const material = new BABYLON.StandardMaterial("strokeMaterial", this.scene);
    material.diffuseColor = new BABYLON.Color3(1.0, 1.0, 1.0); // White color
    material.emissiveColor = new BABYLON.Color3(1.0, 1.0, 1.0); // White emissive for visibility
    material.disableLighting = true; // For 2D we don't need lighting
    this.instancedMesh.material = material;
    
    // Set up instancing
    this.instancedMesh.thinInstanceCount = this.maxInstances;
    this.instancedMesh.forcedInstanceCount = this.maxInstances;
    this.instancedMesh.manualUpdateOfWorldMatrixInstancedBuffer = true;
    
    // Create matrix buffer for instances
    this.matrixBuffer = new BABYLON.StorageBuffer(
      this.engine,
      this.maxInstances * DRAWING_CONSTANTS.MATRIX_SIZE,
      BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX | 
      BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
      BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE
    );
    
    // Set up vertex buffers for world matrix
    this.setupInstancedVertexBuffers();
  }
  
  private setupInstancedVertexBuffers(): void {
    const strideFloats = 16;  // 16 floats per instance (64 bytes)
    const vsize = 4;          // 4 floats per attribute (vec4)
    
    const world0 = new BABYLON.VertexBuffer(
      this.engine,
      this.matrixBuffer.getBuffer(),
      "world0",
      false, false, strideFloats, true, 0, vsize
    );
    
    const world1 = new BABYLON.VertexBuffer(
      this.engine,
      this.matrixBuffer.getBuffer(),
      "world1",
      false, false, strideFloats, true, 4, vsize
    );
    
    const world2 = new BABYLON.VertexBuffer(
      this.engine,
      this.matrixBuffer.getBuffer(),
      "world2",
      false, false, strideFloats, true, 8, vsize
    );
    
    const world3 = new BABYLON.VertexBuffer(
      this.engine,
      this.matrixBuffer.getBuffer(),
      "world3",
      false, false, strideFloats, true, 12, vsize
    );
    
    // Attach vertex buffers to mesh
    this.instancedMesh.setVerticesBuffer(world0);
    this.instancedMesh.setVerticesBuffer(world1);
    this.instancedMesh.setVerticesBuffer(world2);
    this.instancedMesh.setVerticesBuffer(world3);
  }
  
  private async setupComputeShader(): Promise<void> {
    // Create global parameters uniform buffer
    this.globalParamsBuffer = new BABYLON.UniformBuffer(this.engine);
    this.globalParamsBuffer.addUniform("time", 1);
    this.globalParamsBuffer.addUniform("canvasWidth", 1);
    this.globalParamsBuffer.addUniform("canvasHeight", 1);
    this.globalParamsBuffer.addUniform("maxAnimations", 1);
    this.globalParamsBuffer.addUniform("deltaTime", 1);
    this.globalParamsBuffer.addUniform("textureHeight", 1);
    this.globalParamsBuffer.addUniform("padding1", 1);
    this.globalParamsBuffer.addUniform("padding2", 1);
    
    // Set initial values
    this.globalParamsBuffer.updateFloat("canvasWidth", this.canvasWidth);
    this.globalParamsBuffer.updateFloat("canvasHeight", this.canvasHeight);
    this.globalParamsBuffer.updateFloat("maxAnimations", this.maxAnimations);
    this.globalParamsBuffer.updateFloat("textureHeight", DRAWING_CONSTANTS.MAX_STROKES);
    this.globalParamsBuffer.update();
    
    // Store shader in ShaderStore
    BABYLON.ShaderStore.ShadersStoreWGSL["strokeAnimation"] = strokeAnimationWGSL;
    
    // Create compute shader
    this.computeShader = new BABYLON.ComputeShader(
      "strokeAnimation",
      this.engine,
      { computeSource: strokeAnimationWGSL },
      {
        bindingsMapping: {
          "instanceMatrices": { group: 0, binding: 0 },
          "launchConfigs": { group: 0, binding: 1 },
          "globalParams": { group: 0, binding: 2 },
          "strokeTexture": { group: 0, binding: 3 },
          "strokeSampler": { group: 0, binding: 4 }
        }
      }
    );
    
    // Bind resources
    this.computeShader.setStorageBuffer("instanceMatrices", this.matrixBuffer);
    this.computeShader.setStorageBuffer("launchConfigs", this.lifecycleManager.getGPUBuffer());
    this.computeShader.setUniformBuffer("globalParams", this.globalParamsBuffer);
    this.computeShader.setTexture("strokeTexture", this.strokeTextureManager.getStrokeTexture(), false);
    this.computeShader.setTextureSampler("strokeSampler", new BABYLON.TextureSampler());
    
    // Wait for shader to be ready
    while (!this.computeShader.isReady()) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    
    console.log("Compute shader initialized successfully");
  }
  
  private startRenderLoop(stats: Stats): void {
    let lastTime = performance.now() * 0.001;
    
    this.scene.registerBeforeRender(() => {
      const currentTime = performance.now() * 0.001;
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      // Update animation lifecycle
      this.lifecycleManager.tick(currentTime);
      
      // Update global parameters
      this.globalParamsBuffer.updateFloat("time", currentTime);
      this.globalParamsBuffer.updateFloat("deltaTime", deltaTime);
      this.globalParamsBuffer.update();
      
      // Dispatch compute shader with optimized 1D layout
      const totalThreads = this.maxAnimations * this.pointsPerStroke;
      const workgroupSize = DRAWING_CONSTANTS.WORKGROUP_SIZE;
      const workgroups = Math.ceil(totalThreads / workgroupSize);
      this.computeShader.dispatch(workgroups, 1, 1);
      
      // Debug: Log active animations every few seconds
      if (Math.floor(currentTime) % 3 === 0 && deltaTime < 0.1) {
        const status = this.lifecycleManager.getStatus();
        if (status.activeCount > 0) {
          console.log(`Active animations: ${status.activeCount}, dispatching ${workgroups} workgroups (${totalThreads} threads)`);
        }
      }
    });
    
    this.engine.runRenderLoop(() => {
      stats.begin();
      this.scene.render();
      stats.end();
    });
    
    // Handle resize
    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }
  
  /**
   * Get system status for debugging
   */
  getStatus(): {
    animations: ReturnType<DrawLifecycleManager['getStatus']>;
    memory: ReturnType<StrokeTextureManager['getMemoryInfo']>;
  } {
    return {
      animations: this.lifecycleManager.getStatus(),
      memory: this.strokeTextureManager.getMemoryInfo()
    };
  }
  
  /**
   * Upload strokes to GPU
   */
  uploadStrokes(strokes: Array<{index: number, stroke: any}>): void {
    this.strokeTextureManager?.uploadStrokes(strokes);
  }
  
  /**
   * Launch animation from mouse click (legacy method - use launchStrokeWithAnchor instead)
   * @deprecated Use launchStrokeWithAnchor for new code
   */
  launchStroke(
    x: number, 
    y: number, 
    strokeA: number, 
    strokeB: number,
    options?: {
      interpolationT?: number;
      duration?: number;
      scale?: number;
      position?: 'start' | 'center' | 'end';
      loop?: boolean;
      startPhase?: number;
      active?: boolean;
      controlMode?: 'manual' | 'auto';
    }
  ): string | undefined {
    return this.lifecycleManager?.launchStroke(x, y, strokeA, strokeB, options);
  }

  /**
   * Launch stroke with proper anchor handling
   */
  launchStrokeWithAnchor(
    clickX: number,
    clickY: number,
    strokeA: number,
    strokeB: number,
    options: {
      anchor?: AnchorKind;
      interpolationT?: number;
      duration?: number;
      scale?: number;
      loop?: boolean;
      startPhase?: number;
      active?: boolean;
      controlMode?: 'manual' | 'auto';
    } = {}
  ): string | undefined {
    if (!this.strokeTextureManager || !this.lifecycleManager) {
      console.warn('DrawingScene not properly initialized');
      return undefined;
    }

    const anchor = getStrokeAnchor(
      this.strokeTextureManager,
      strokeA,
      strokeB,
      options.interpolationT ?? 0.0,
      options.anchor ?? 'center'
    );

    const scale = options.scale ?? 1.0;
    const startPoint = {
      x: clickX - anchor.x * scale,
      y: clickY - anchor.y * scale
    };

    return this.lifecycleManager.launchRaw(startPoint, strokeA, strokeB, options);
  }

  /**
   * Launch group of strokes with unified anchor handling
   */
  launchGroup(
    clickX: number,
    clickY: number,
    strokeIndices: number[],
    options: {
      anchor?: AnchorKind;
      duration?: number;
      scale?: number;
      loop?: boolean;
      startPhase?: number;
      active?: boolean;
      controlMode?: 'manual' | 'auto';
    } = {}
  ): string[] {
    if (!this.strokeTextureManager || !this.lifecycleManager) {
      console.warn('DrawingScene not properly initialized');
      return [];
    }

    if (strokeIndices.length === 0) {
      console.warn('No strokes provided for group launch');
      return [];
    }

    // Calculate group-level anchor
    const groupAnchor = getGroupAnchor(
      this.strokeTextureManager,
      strokeIndices,
      options.anchor ?? 'center'
    );

    const scale = options.scale ?? 1.0;
    
    // Calculate one shared translation for the whole group
    // The GPU will add scale * strokePoint to this base, so the group anchor will land at clickX, clickY
    const baseStartPoint = {
      x: clickX - groupAnchor.x * scale,
      y: clickY - groupAnchor.y * scale
    };

    const launchedIds: string[] = [];

    // Launch each stroke with the same base translation
    // The relative positioning between strokes is handled automatically by the GPU
    // since each stroke has different normalized coordinates
    for (const strokeIndex of strokeIndices) {
      const animationId = this.lifecycleManager.launchRaw(
        baseStartPoint,
        strokeIndex,
        strokeIndex,
        {
          interpolationT: 0.0, // No interpolation for group strokes
          duration: options.duration,
          scale,
          loop: options.loop,
          startPhase: options.startPhase,
          active: options.active,
          controlMode: options.controlMode ?? 'manual' // Default to manual for groups
        }
      );

      if (animationId) {
        launchedIds.push(animationId);
      }
    }

    console.log(`Launched group with ${launchedIds.length} strokes at (${clickX.toFixed(1)}, ${clickY.toFixed(1)}) using ${options.anchor ?? 'center'} anchor`);
    return launchedIds;
  }

  /**
   * Update existing animation
   */
  updateStroke(id: string, updates: Partial<LaunchConfig>): boolean {
    return this.lifecycleManager?.updateAnimation(id, updates);
  }

  /**
   * Cancel an active stroke animation
   */
  cancelStroke(id: string): boolean {
    return this.lifecycleManager?.cancelAnimation(id);
  }

  /**
   * Clear all looped animations
   */
  clearLoopedAnimations(): void {
    this.lifecycleManager?.clearLoopedAnimations();
  }

  /**
   * Get stroke bounding box for relative positioning
   */
  getStrokeBounds(strokeIndex: number): { minX: number; maxX: number; minY: number; maxY: number } | null {
    return this.strokeTextureManager?.getStrokeBounds(strokeIndex) || null;
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.strokeTextureManager?.dispose();
    this.lifecycleManager?.dispose();
    this.matrixBuffer?.dispose();
    this.globalParamsBuffer?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
  }
}
