import * as BABYLON from 'babylonjs';

/**
 * Options for creating a CanvasTexture.
 */
export interface CanvasTextureOptions {
  engine: BABYLON.WebGPUEngine;
  scene: BABYLON.Scene;
  /** Initial width (will auto-resize on update if canvas size differs) */
  width?: number;
  /** Initial height (will auto-resize on update if canvas size differs) */
  height?: number;
  /** Sampling mode (default: BILINEAR) */
  samplingMode?: number;
}

/**
 * Helper class for efficiently uploading canvas content to a GPU texture.
 * Handles the WebGPU-specific initialization and resize logic.
 *
 * Usage:
 * ```ts
 * const canvasTex = new CanvasTexture({ engine, scene });
 * // In render loop:
 * canvasTex.update(myCanvas);
 * shape.body.setTexture('myTex', canvasTex.texture);
 * ```
 */
export class CanvasTexture {
  private readonly engine: BABYLON.WebGPUEngine;
  private readonly scene: BABYLON.Scene;
  private readonly samplingMode: number;

  private internalTexture: BABYLON.InternalTexture;
  private readonly _texture: BABYLON.BaseTexture;
  private texWidth: number;
  private texHeight: number;
  private pendingDispose: BABYLON.InternalTexture | null = null;

  constructor(options: CanvasTextureOptions) {
    this.engine = options.engine;
    this.scene = options.scene;
    this.samplingMode = options.samplingMode ?? BABYLON.Texture.BILINEAR_SAMPLINGMODE;
    this.texWidth = options.width ?? 1;
    this.texHeight = options.height ?? 1;

    // Create initial internal texture
    this.internalTexture = this.engine.createDynamicTexture(
      this.texWidth,
      this.texHeight,
      false, // no mipmaps
      this.samplingMode,
    );
    this.internalTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    this.internalTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    // IMPORTANT: Must upload initial data to make texture "ready" for WebGPU
    // See: https://forum.babylonjs.com/t/webgpu-and-dynamic-texture/42065
    const initCanvas = document.createElement('canvas');
    initCanvas.width = this.texWidth;
    initCanvas.height = this.texHeight;
    const ctx = initCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, this.texWidth, this.texHeight);
    this.engine.updateDynamicTexture(
      this.internalTexture,
      initCanvas,
      false,
      false,
      this.samplingMode,
    );

    // Wrap in BaseTexture for shader binding
    this._texture = new BABYLON.BaseTexture(this.scene, this.internalTexture);
    this._texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    this._texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    this._texture.updateSamplingMode(this.samplingMode);
  }

  /**
   * The texture to pass to setTexture().
   */
  get texture(): BABYLON.BaseTexture {
    return this._texture;
  }

  /**
   * Current texture width.
   */
  get width(): number {
    return this.texWidth;
  }

  /**
   * Current texture height.
   */
  get height(): number {
    return this.texHeight;
  }

  /**
   * Update the texture from a canvas. Handles resize automatically.
   * Call this once per frame before rendering.
   */
  update(canvas: HTMLCanvasElement | OffscreenCanvas): void {
    // Dispose any pending texture from previous resize
    if (this.pendingDispose) {
      this.pendingDispose.dispose();
      this.pendingDispose = null;
    }

    const width = canvas.width;
    const height = canvas.height;

    // Recreate texture if dimensions changed
    if (width !== this.texWidth || height !== this.texHeight) {
      // Defer disposal to avoid "destroyed texture" errors
      this.pendingDispose = this.internalTexture;

      // Create new internal texture
      this.internalTexture = this.engine.createDynamicTexture(
        width,
        height,
        false,
        this.samplingMode,
      );
      this.internalTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      this.internalTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

      // Update the BaseTexture wrapper to point to new internal texture
      this._texture._texture = this.internalTexture;

      this.texWidth = width;
      this.texHeight = height;
    }

    // Upload canvas content to GPU (uses copyExternalImageToTexture internally)
    this.engine.updateDynamicTexture(
      this.internalTexture,
      canvas as HTMLCanvasElement,
      false,
      false,
      this.samplingMode,
    );
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.pendingDispose?.dispose();
    this.internalTexture.dispose();
    this._texture.dispose();
  }
}

export interface Power2DSceneOptions {
  engine: BABYLON.WebGPUEngine;
  canvasWidth: number;
  canvasHeight: number;
  clearColor?: BABYLON.Color4;
}

export interface Power2DScene {
  scene: BABYLON.Scene;
  camera: BABYLON.FreeCamera;
  canvasWidth: number;
  canvasHeight: number;
  resize(width: number, height: number): void;
}

export function createPower2DScene(options: Power2DSceneOptions): Power2DScene {
  const { engine, canvasWidth, canvasHeight, clearColor } = options;

  const scene = new BABYLON.Scene(engine);
  scene.autoClear = true;
  scene.clearColor = clearColor ?? new BABYLON.Color4(0, 0, 0, 1);
  scene.autoClearDepthAndStencil = true;

  const camera = new BABYLON.FreeCamera('power2dCamera', new BABYLON.Vector3(0, 0, -1), scene);
  camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
  camera.minZ = 0;
  camera.maxZ = 10;
  camera.orthoLeft = -1;
  camera.orthoRight = 1;
  camera.orthoTop = 1;
  camera.orthoBottom = -1;

  scene.activeCamera = camera;

  const resize = (width: number, height: number) => {
    // Shader handles pixel-to-NDC conversion; keep camera fixed.
    void width;
    void height;
  };

  return {
    scene,
    camera,
    canvasWidth,
    canvasHeight,
    resize,
  };
}
