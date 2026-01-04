<script setup lang="ts">
import { appStateName, type Power2DTestAppState, bypassPostRef, engineRef, shaderGraphEndNodeRef, resolution } from './appState';
import { inject, onMounted, onUnmounted, watch, type WatchStopHandle } from 'vue';
import { CanvasPaint, PassthruEffect, type ShaderEffect } from '@/rendering/babylonGL/shaderFXBabylon_GL';
import * as BABYLON from 'babylonjs';
import Stats from 'stats-gl';
import { createPower2DScene, RectPts, CirclePts, StyledShape, BatchedStyledShape, CanvasTexture } from '@/rendering/babylonGL/power2d';
import { BasicMaterial } from './basic.material.gl.generated';
import { BasicStrokeMaterial } from './basic.strokeMaterial.gl.generated';
import { InstancedBasicMaterial } from './instancedBasic.material.gl.generated';
import { WebcamPixelMaterial } from './webcamPixel.material.gl.generated';
import { RunnerStrokeMaterial } from './runner.strokeMaterial.gl.generated';

const TEST_CANVAS_SIZE = { width: 320, height: 200 };

const appState = inject<Power2DTestAppState>(appStateName)!;
let shaderGraphEndNode: ShaderEffect | undefined = undefined;
let engineWatcher: WatchStopHandle | undefined;

let powerScene: BABYLON.Scene | undefined;
let powerCamera: BABYLON.FreeCamera | undefined;
let powerTarget: BABYLON.RenderTargetTexture | undefined;
let powerShapes: Array<{ dispose: () => void }> = [];
let batchedCircles: BatchedStyledShape<typeof InstancedBasicMaterial> | undefined;
let webcamRect: StyledShape<typeof WebcamPixelMaterial> | undefined;
let testCanvasElement: HTMLCanvasElement | undefined;
let testCanvasTexture: CanvasTexture | undefined;
let canvasPaint: CanvasPaint | undefined;
let stats: Stats | undefined;

const drawToCanvas = (canvas: HTMLCanvasElement, time: number) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#ff6b6b');
  grad.addColorStop(1, '#4d96ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(5, 20, 155, 60);

  ctx.fillStyle = '#111';
  ctx.font = '20px sans-serif';
  ctx.fillText('Canvas input tex', 9, 58);

  const t = (Math.sin(time * 0.8) + 1) * 0.5;
  const circleX = width * 0.2 + t * width * 0.6;
  const circleY = height * 0.6;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(circleX, circleY, 40, 0, Math.PI * 2);
  ctx.stroke();
};

const clearDrawFuncs = () => {
  appState.drawFunctions.length = 0;
  appState.drawFuncMap.clear();
};

const chooseTextureType = (engine: BABYLON.Engine): number => {
  const caps = engine.getCaps();
  if (caps.textureHalfFloatRender) {
    return BABYLON.Engine.TEXTURETYPE_HALF_FLOAT;
  }
  if (caps.textureFloatRender) {
    return BABYLON.Engine.TEXTURETYPE_FLOAT;
  }
  return BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE;
};

const setupSketch = (engine: BABYLON.Engine) => {
  shaderGraphEndNodeRef.value = undefined;
  clearDrawFuncs();

  const logicalWidth = resolution.width;
  const logicalHeight = resolution.height;
  const renderWidth = engine.getRenderWidth();
  const renderHeight = engine.getRenderHeight();

  const power2d = createPower2DScene({
    engine,
    canvasWidth: logicalWidth,
    canvasHeight: logicalHeight,
    clearColor: new BABYLON.Color4(0, 0, 0, 0),
  });
  powerScene = power2d.scene;
  powerCamera = power2d.camera;

  const rect = new StyledShape({
    scene: powerScene,
    points: RectPts({ x: 0, y: 0, width: 150, height: 100 }),
    bodyMaterial: BasicMaterial,
    strokeMaterial: BasicStrokeMaterial,
    strokeThickness: 6,
    canvasWidth: logicalWidth,
    canvasHeight: logicalHeight,
  });
  rect.x = 300;
  rect.y = 100;
  rect.alphaIndex = 1;

  const circle = new StyledShape({
    scene: powerScene,
    points: CirclePts({ cx: 0, cy: 0, radius: 60, segments: 48 }),
    bodyMaterial: BasicMaterial,
    strokeMaterial: RunnerStrokeMaterial,
    strokeThickness: 10,
    canvasWidth: logicalWidth,
    canvasHeight: logicalHeight,
  });
  circle.x = 100;
  circle.y = 200;
  circle.alphaIndex = 2;

  const instancedCount = 6;
  const instancedBasePositions: Array<[number, number]> = [
    [20, -20],
    [120, 20],
    [220, -20],
    [320, 20],
    [420, -20],
    [520, 20],
    [620, -20],
    [720, 20],
  ];

  batchedCircles = new BatchedStyledShape({
    scene: powerScene,
    points: CirclePts({ cx: 0, cy: 0, radius: 26, segments: 20 }),
    material: InstancedBasicMaterial,
    instanceCount: instancedCount,
    canvasWidth: logicalWidth,
    canvasHeight: logicalHeight,
  });

  batchedCircles.y = 500;

  for (let i = 0; i < instancedCount; i++) {
    const [x, y] = instancedBasePositions[i];
    batchedCircles.writeInstanceAttr(i, {
      offset: [x, y],
      scale: 1.0,
      rotation: i * 0.2,
      tint: [0.8, 0.9, 1.0],
      instanceIndex: i,
    });
  }
  batchedCircles.beforeRender();

  const webcamAspect = TEST_CANVAS_SIZE.width / TEST_CANVAS_SIZE.height;
  const webcamHeight = 240;
  const webcamWidth = Math.round(webcamHeight * webcamAspect);
  webcamRect = new StyledShape({
    scene: powerScene,
    points: RectPts({ x: 0, y: 0, width: webcamWidth, height: webcamHeight }),
    bodyMaterial: WebcamPixelMaterial,
    canvasWidth: logicalWidth,
    canvasHeight: logicalHeight,
  });
  webcamRect.x = 800;
  webcamRect.y = 80;
  webcamRect.alphaIndex = 0;
  if (webcamRect && powerScene) {
    const canvas = document.createElement('canvas');
    canvas.width = TEST_CANVAS_SIZE.width;
    canvas.height = TEST_CANVAS_SIZE.height;
    drawToCanvas(canvas, 0);
    testCanvasElement = canvas;
    testCanvasTexture = new CanvasTexture({
      engine,
      scene: powerScene,
      width: canvas.width,
      height: canvas.height,
      samplingMode: BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    });
    testCanvasTexture.update(canvas);
    webcamRect.body.setTexture('webcamTex', testCanvasTexture.texture);
  }

  powerShapes = [rect, circle];
  if (webcamRect) {
    powerShapes.push(webcamRect);
  }

  powerTarget = new BABYLON.RenderTargetTexture(
    'power2dRT',
    { width: renderWidth, height: renderHeight },
    powerScene,
    false,
    true,
    chooseTextureType(engine),
    false,
    BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    false,
  );
  powerTarget.renderList = powerScene.meshes;
  powerTarget.activeCamera = powerCamera;
  powerTarget.ignoreCameraViewport = true;
  powerTarget.clearColor = new BABYLON.Color4(0, 0, 0, 0);

  if (powerCamera) {
    powerCamera.outputRenderTarget = null;
  }

  const passthru = new PassthruEffect(engine, { src: powerTarget }, renderWidth, renderHeight, 'linear');
  canvasPaint = new CanvasPaint(engine, { src: passthru }, renderWidth, renderHeight);
  shaderGraphEndNode = canvasPaint;
  shaderGraphEndNodeRef.value = shaderGraphEndNode;

  appState.shaderDrawFunc = () => {
    const statsRef = stats;
    statsRef?.begin();
    const time = performance.now() * 0.001;

    rect.setCanvasSize(logicalWidth, logicalHeight);
    circle.setCanvasSize(logicalWidth, logicalHeight);
    rect.body.setUniforms({ time, color: new BABYLON.Vector3(1, 0.4, 0.2) });
    rect.stroke?.setUniforms({ color: new BABYLON.Vector3(1.0, 0.9, 0.0) });
    circle.body.setUniforms({ time: time + 1.2, color: new BABYLON.Vector3(0.2, 0.6, 1.0) });
    circle.stroke?.setUniforms({
      time,
      speed: 0.15,
      segmentLength: 0.18,
      feather: 0.06,
    });

    if (batchedCircles) {
      batchedCircles.setCanvasSize(logicalWidth, logicalHeight);
      batchedCircles.setUniforms({ time, color: new BABYLON.Vector3(0.6, 0.9, 0.7) });
      for (let i = 0; i < instancedCount; i++) {
        const [baseX, baseY] = instancedBasePositions[i];
        const offsetX = Math.sin(time * 1.3 + i) * 12;
        const offsetY = Math.cos(time * 1.1 + i) * 10;
        batchedCircles.writeInstanceAttr(i, {
          offset: [baseX + offsetX, baseY + offsetY],
          rotation: time * 0.6 + i * 0.4,
        });
      }
      batchedCircles.beforeRender();
    }

    if (webcamRect) {
      webcamRect.setCanvasSize(logicalWidth, logicalHeight);
      webcamRect.body.setUniforms({
        pixelSize: 8,
        tint: new BABYLON.Vector3(1.0, 1.0, 1.0),
        opacity: 1.0,
      });
    }
    if (testCanvasTexture && testCanvasElement) {
      drawToCanvas(testCanvasElement, time);
      testCanvasTexture.update(testCanvasElement);
    }

    engine.beginFrame();
    if (bypassPostRef.value) {
      engine.restoreDefaultFramebuffer();
      powerScene?.render(false);
      engine.endFrame();
      statsRef?.end();
      statsRef?.update();
      return;
    }
    powerTarget?.render();
    canvasPaint?.renderAll(engine);
    engine.endFrame();
    statsRef?.end();
    statsRef?.update();
  };
};

onMounted(() => {
  stats = new Stats({
    trackFPS: true,
    trackGPU: true,
    trackHz: true,
    logsPerSecond: 4,
    graphsPerSecond: 30,
    samplesLog: 40,
    samplesGraph: 10,
    precision: 2,
    horizontal: true,
    minimal: false,
    mode: 2,
  });
  document.body.appendChild(stats.dom);

  const engine = engineRef.value;
  if (engine) {
    setupSketch(engine);
  } else {
    engineWatcher = watch(
      engineRef,
      (engineValue) => {
        if (engineValue) {
          engineWatcher?.();
          engineWatcher = undefined;
          setupSketch(engineValue);
        }
      },
      { immediate: true }
    );
  }
});

onUnmounted(() => {
  engineWatcher?.();
  engineWatcher = undefined;
  clearDrawFuncs();
  if (stats) {
    stats.dom.remove();
    stats = undefined;
  }
  canvasPaint?.disposeAll();
  canvasPaint = undefined;
  shaderGraphEndNode?.disposeAll();
  shaderGraphEndNode = undefined;
  shaderGraphEndNodeRef.value = undefined;
  appState.shaderDrawFunc = undefined;

  powerShapes.forEach((shape) => shape.dispose());
  powerShapes = [];
  batchedCircles?.dispose();
  batchedCircles = undefined;
  webcamRect = undefined;
  if (testCanvasTexture) {
    testCanvasTexture.dispose();
    testCanvasTexture = undefined;
  }
  testCanvasElement = undefined;
  powerTarget?.dispose();
  powerTarget = undefined;
  powerScene?.dispose();
  powerScene = undefined;
  powerCamera = undefined;
});
</script>

<template>
  <div></div>
</template>

<style scoped></style>
