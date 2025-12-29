import * as BABYLON from 'babylonjs';

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
