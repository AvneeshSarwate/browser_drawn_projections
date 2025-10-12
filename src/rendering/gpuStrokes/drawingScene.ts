import * as BABYLON from 'babylonjs';
import { StrokeDataGenerator } from './strokeDataGenerator';
import { StrokeInterpolator } from './strokeInterpolator';
import { StrokeTextureManager } from './strokeTextureManager';
import { DrawLifecycleManager } from './drawLifecycleManager';
import { DRAWING_CONSTANTS } from './constants';
//@ts-ignore
import Stats from '@/rendering/stats';
import type { LaunchConfig, StrokeColor } from './strokeTypes';
import { getStrokeAnchor, getGroupAnchor, type AnchorKind } from './coordinateUtils';
import * as strokeAnimation from './strokeAnimation.compute.wgsl.generated';

export interface RenderTargetOptions {
  width: number;
  height: number;
  name?: string;
  sampleMode?: number;
  textureType?: number;
}

export interface DrawingSceneOptions {
  renderTarget?: RenderTargetOptions;
  startRenderLoop?: boolean;
}

export class DrawingScene {
  private engine!: BABYLON.WebGPUEngine;
  private scene!: BABYLON.Scene;
  private strokeTextureManager!: StrokeTextureManager;
  private lifecycleManager!: DrawLifecycleManager;
  private shaderState!: strokeAnimation.ShaderState;
  private instancedMesh!: BABYLON.Mesh;
  private camera!: BABYLON.FreeCamera;
  private instanceMatricesStorage!: strokeAnimation.InstanceMatricesStorageState;
  private instanceColorsStorage!: strokeAnimation.InstanceColorsStorageState;
  private globalParamsState!: strokeAnimation.GlobalParamsUniformState;
  private maxAnimations: number = DRAWING_CONSTANTS.MAX_ANIMATIONS;
  private pointsPerStroke: number = DRAWING_CONSTANTS.POINTS_PER_STROKE;
  private maxInstances: number = this.maxAnimations * this.pointsPerStroke;
  private canvasWidth!: number;
  private canvasHeight!: number;
  private renderTarget?: BABYLON.RenderTargetTexture;
  private lastFrameTime = 0;
  private resizeHandler?: () => void;
  private renderLoopCallback?: () => void;
  private autoRenderLoop = true;
  
  async createScene(canvas: HTMLCanvasElement, stats: Stats | null, options: DrawingSceneOptions = {}): Promise<void> {
    const renderTargetOptions = options.renderTarget;

    // Store canvas dimensions for use throughout the system (allow override from render target)
    this.canvasWidth = renderTargetOptions?.width ?? canvas.width;
    this.canvasHeight = renderTargetOptions?.height ?? canvas.height;
    
    await this.initializeEngine(canvas);
    this.setupCamera();
    // await this.setupStrokeData(); // only for test data
    this.setupMaterials();
    await this.setupComputeShader();

    if (renderTargetOptions) {
      this.createRenderTarget(renderTargetOptions);
    }

    this.lastFrameTime = performance.now() * 0.001;
    this.autoRenderLoop = options.startRenderLoop ?? !renderTargetOptions;

    this.attachResizeHandler();

    if (this.autoRenderLoop) {
      this.startRenderLoop(stats);
    }
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

    this.camera = camera;
    this.scene.activeCamera = camera;
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
    // material.useVertexColors = true;
    this.instancedMesh.material = material;
    
    // Set up instancing
    this.instancedMesh.thinInstanceCount = this.maxInstances;
    this.instancedMesh.forcedInstanceCount = this.maxInstances;
    this.instancedMesh.manualUpdateOfWorldMatrixInstancedBuffer = true;
    
    // Create matrix buffer for instances with vertex + storage usage
    this.instanceMatricesStorage = strokeAnimation.createStorageBuffer_instanceMatrices(
      this.engine,
      this.maxInstances,
      {
        usage:
          BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
          BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
          BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      }
    );
    this.instanceMatricesStorage.data.fill(0);
    this.instanceMatricesStorage.buffer.update(this.instanceMatricesStorage.data);

    this.instanceColorsStorage = strokeAnimation.createStorageBuffer_instanceColors(
      this.engine,
      this.maxInstances,
      {
        usage:
          BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
          BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
          BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
      }
    );
    this.instanceColorsStorage.data.fill(0);
    this.instanceColorsStorage.buffer.update(this.instanceColorsStorage.data);

    // Set up vertex buffers for world matrix
    this.setupInstancedVertexBuffers();
  }

  private setupInstancedVertexBuffers(): void {
    const strideFloats = 16;  // 16 floats per instance (64 bytes)
    const vsize = 4;          // 4 floats per attribute (vec4)
    const matrixBuffer = this.instanceMatricesStorage.buffer;

    const world0 = new BABYLON.VertexBuffer(
      this.engine,
      matrixBuffer.getBuffer(),
      "world0",
      false, false, strideFloats, true, 0, vsize
    );

    const world1 = new BABYLON.VertexBuffer(
      this.engine,
      matrixBuffer.getBuffer(),
      "world1",
      false, false, strideFloats, true, 4, vsize
    );

    const world2 = new BABYLON.VertexBuffer(
      this.engine,
      matrixBuffer.getBuffer(),
      "world2",
      false, false, strideFloats, true, 8, vsize
    );

    const world3 = new BABYLON.VertexBuffer(
      this.engine,
      matrixBuffer.getBuffer(),
      "world3",
      false, false, strideFloats, true, 12, vsize
    );
    
    // Attach vertex buffers to mesh
    this.instancedMesh.setVerticesBuffer(world0);
    this.instancedMesh.setVerticesBuffer(world1);
    this.instancedMesh.setVerticesBuffer(world2);
    this.instancedMesh.setVerticesBuffer(world3);
    
    const colorBuffer = new BABYLON.VertexBuffer(
      this.engine,
      this.instanceColorsStorage.buffer.getBuffer(),
      BABYLON.VertexBuffer.ColorKind,
      false,
      false,
      this.instanceColorsStorage.floatsPerElement,
      true,
      0,
      this.instanceColorsStorage.floatsPerElement
    );
    this.instancedMesh.setVerticesBuffer(colorBuffer);
  }
  
  private async setupComputeShader(): Promise<void> {
    this.globalParamsState = strokeAnimation.createUniformBuffer_globalParams(this.engine, {
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      maxAnimations: this.maxAnimations,
      textureHeight: DRAWING_CONSTANTS.MAX_STROKES,
      time: 0,
      deltaTime: 0,
      padding1: 0,
      padding2: 0,
    });

    this.shaderState = strokeAnimation.createShader(
      this.engine,
      {
        globalParams: this.globalParamsState,
        instanceMatrices: this.instanceMatricesStorage.buffer,
        launchConfigs: this.lifecycleManager.getGPUBuffer(),
        instanceColors: this.instanceColorsStorage.buffer,
        strokeTexture: this.strokeTextureManager.getStrokeTexture(),
        strokeSampler: new BABYLON.TextureSampler(),
      },
      { name: 'strokeAnimation' }
    );

    while (!this.shaderState.shader.isReady()) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    console.log("Compute shader initialized successfully");
  }
  
  private startRenderLoop(stats: Stats | null): void {
    this.renderLoopCallback = () => {
      stats?.begin();
      this.renderFrameInternal();
      stats?.end();
    };

    this.engine.runRenderLoop(this.renderLoopCallback);
  }

  private createRenderTarget(options: RenderTargetOptions): void {
    const textureType = options.textureType ?? BABYLON.Constants.TEXTURETYPE_HALF_FLOAT;
    const renderTarget = new BABYLON.RenderTargetTexture(
      options.name ?? 'DrawingSceneRenderTarget',
      { width: options.width, height: options.height },
      this.scene,
      /* renderLoop */ false,
      /* generateMipMaps */ false,
      textureType,
      /* isCube */ false
    );

    renderTarget.updateSamplingMode(options.sampleMode ?? BABYLON.Texture.BILINEAR_SAMPLINGMODE);
    renderTarget.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    renderTarget.ignoreCameraViewport = true;
    renderTarget.renderList = [this.instancedMesh];
    renderTarget.activeCamera = this.camera;

    this.camera.outputRenderTarget = renderTarget;
    this.renderTarget = renderTarget;
  }

  private attachResizeHandler(): void {
    if (this.resizeHandler) {
      return;
    }

    this.resizeHandler = () => {
      this.engine.resize();
    };

    window.addEventListener('resize', this.resizeHandler);
  }

  private updateFrameTimers(): { currentTime: number; deltaTime: number } {
    const currentTime = performance.now() * 0.001;
    if (this.lastFrameTime === 0) {
      this.lastFrameTime = currentTime;
    }
    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;
    return { currentTime, deltaTime };
  }

  private dispatchCompute(currentTime: number, deltaTime: number): void {
    // Update animation lifecycle
    this.lifecycleManager.tick(currentTime);

    // Update global parameters
    strokeAnimation.updateUniformBuffer_globalParams(this.globalParamsState, {
      time: currentTime,
      deltaTime,
    });

    // Dispatch compute shader with optimized 1D layout
    const totalThreads = this.maxAnimations * this.pointsPerStroke;
    const workgroupSize = DRAWING_CONSTANTS.WORKGROUP_SIZE;
    const workgroups = Math.ceil(totalThreads / workgroupSize);
    this.shaderState.shader.dispatch(workgroups, 1, 1);
  }

  private renderFrameInternal(): void {
    const { currentTime, deltaTime } = this.updateFrameTimers();
    this.dispatchCompute(currentTime, deltaTime);

    if (this.renderTarget) {
      this.scene.render();
      this.engine.restoreDefaultFramebuffer();
    } else {
      this.scene.render();
    }
  }

  /**
   * Render one frame. Intended for manual render loop usage.
   */
  renderFrame(): void {
    if (!this.engine || !this.scene) {
      return;
    }

    this.renderFrameInternal();
  }

  getRenderTarget(): BABYLON.RenderTargetTexture | undefined {
    return this.renderTarget;
  }

  getEngine(): BABYLON.WebGPUEngine {
    return this.engine;
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
      color?: Partial<StrokeColor>;
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
      color?: Partial<StrokeColor>;
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
      color?: Partial<StrokeColor>;
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
          controlMode: options.controlMode ?? 'manual', // Default to manual for groups
          color: options.color
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

  getGroupStrokeBounds(strokeIndexes: number[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
    return this.strokeTextureManager?.getStrokeGroupBounds(strokeIndexes)
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    if (this.renderLoopCallback) {
      this.engine?.stopRenderLoop(this.renderLoopCallback);
      this.renderLoopCallback = undefined;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }

    if (this.camera) {
      this.camera.outputRenderTarget = null;
    }

    this.renderTarget?.dispose();
    this.renderTarget = undefined;
    this.strokeTextureManager?.dispose();
    this.lifecycleManager?.dispose();
    this.instanceMatricesStorage?.buffer.dispose();
    this.instanceColorsStorage?.buffer.dispose();
    this.globalParamsState?.buffer.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
  }
}
