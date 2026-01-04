import * as BABYLON from 'babylonjs';

/**
 * Options for creating a CanvasTexture.
 */
export interface CanvasTextureOptions {
  engine: BABYLON.Engine;
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
 * Uses DynamicTexture for WebGL.
 */
export class CanvasTexture {
  private readonly scene: BABYLON.Scene;
  private readonly samplingMode: number;

  private dynamicTexture: BABYLON.DynamicTexture;
  private ctx: BABYLON.ICanvasRenderingContext;
  private texWidth: number;
  private texHeight: number;

  constructor(options: CanvasTextureOptions) {
    this.scene = options.scene;
    this.samplingMode = options.samplingMode ?? BABYLON.Texture.BILINEAR_SAMPLINGMODE;
    this.texWidth = options.width ?? 1;
    this.texHeight = options.height ?? 1;

    this.dynamicTexture = this.createDynamicTexture(this.texWidth, this.texHeight);
    this.ctx = this.dynamicTexture.getContext();

    this.ctx.clearRect(0, 0, this.texWidth, this.texHeight);
    this.dynamicTexture.update(false);
  }

  private createDynamicTexture(width: number, height: number): BABYLON.DynamicTexture {
    const texture = new BABYLON.DynamicTexture(
      'power2dCanvasTexture',
      { width, height },
      this.scene,
      false,
      this.samplingMode,
    );
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.updateSamplingMode(this.samplingMode);
    return texture;
  }

  /**
   * The texture to pass to setTexture().
   */
  get texture(): BABYLON.BaseTexture {
    return this.dynamicTexture;
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
    const width = canvas.width;
    const height = canvas.height;

    if (width !== this.texWidth || height !== this.texHeight) {
      this.dynamicTexture.dispose();
      this.dynamicTexture = this.createDynamicTexture(width, height);
      this.ctx = this.dynamicTexture.getContext();
      this.texWidth = width;
      this.texHeight = height;
    }

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(canvas, 0, 0, width, height);
    this.dynamicTexture.update(false);
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.dynamicTexture.dispose();
  }
}

export interface Power2DSceneOptions {
  engine: BABYLON.Engine;
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
