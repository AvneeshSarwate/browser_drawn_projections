import * as BABYLON from 'babylonjs';
import earcut from 'earcut';
import type { BatchMaterialDef, CanvasTextureEntry, InstanceAttrLayout, Point2D, TextureSource } from './types';

interface BatchedStyledShapeOptions<U extends object, T extends string, I extends object> {
  scene: BABYLON.Scene;
  points: readonly Point2D[];
  material: BatchMaterialDef<U, T, I>;
  instanceCount: number;
  canvasWidth: number;
  canvasHeight: number;
  closed?: boolean;
}

export class BatchedStyledShape<U extends object, T extends string, I extends object> {
  private readonly scene: BABYLON.Scene;
  private readonly mesh: BABYLON.Mesh;
  private readonly materialInstance: ReturnType<BatchMaterialDef<U, T, I>['createMaterial']>;
  private readonly instanceCount: number;
  private readonly instanceLayout: InstanceAttrLayout<I>;

  private readonly instanceData: Float32Array;
  private readonly instanceBuffer: BABYLON.StorageBuffer;
  private useExternalBuffers = false;

  private canvasWidth: number;
  private canvasHeight: number;

  private readonly textureCache: Map<string, CanvasTextureEntry> = new Map();

  constructor(options: BatchedStyledShapeOptions<U, T, I>) {
    this.scene = options.scene;
    this.instanceCount = options.instanceCount;
    this.instanceLayout = options.material.instanceAttrLayout;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;

    const engine = this.scene.getEngine() as BABYLON.WebGPUEngine;

    this.materialInstance = options.material.createMaterial(this.scene, 'batchedMaterial');
    this.materialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);

    this.mesh = this.createMesh(options.points, options.closed ?? true);
    this.mesh.material = this.materialInstance.material;

    const floatsPerInstance = this.instanceLayout.size;
    const totalFloats = floatsPerInstance * this.instanceCount;
    this.instanceData = new Float32Array(totalFloats);

    this.instanceBuffer = new BABYLON.StorageBuffer(
      engine,
      totalFloats * 4,
      BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
        BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE,
    );

    this.mesh.thinInstanceCount = this.instanceCount;
    this.mesh.forcedInstanceCount = this.instanceCount;
    this.mesh.manualUpdateOfWorldMatrixInstancedBuffer = true;

    this.setupInstanceVertexBuffers();
  }

  setUniforms(uniforms: Partial<U>): void {
    this.materialInstance.setUniforms(uniforms);
  }

  setTexture(name: T, source: TextureSource): void {
    const texture = this.resolveTexture(source, String(name));
    this.materialInstance.setTexture(name, texture);
  }

  setTextureSampler(name: T, sampler: BABYLON.TextureSampler): void {
    this.materialInstance.setTextureSampler?.(name, sampler);
  }

  writeInstanceAttr(index: number, values: Partial<I>): void {
    if (this.useExternalBuffers) {
      console.warn('Cannot write instance attrs when using external buffers');
      return;
    }

    const floatsPerInstance = this.instanceLayout.size;
    const baseOffset = index * floatsPerInstance;

    for (const member of this.instanceLayout.members) {
      const value = values[member.name];
      if (value !== undefined) {
        const memberOffset = baseOffset + member.offset;
        if (typeof value === 'number') {
          this.instanceData[memberOffset] = value;
        } else if (Array.isArray(value)) {
          for (let i = 0; i < member.floatCount && i < value.length; i++) {
            this.instanceData[memberOffset + i] = value[i] ?? 0;
          }
        }
      }
    }
  }

  updateInstanceBuffer(): void {
    if (!this.useExternalBuffers) {
      this.instanceBuffer.update(this.instanceData);
    }
  }

  setExternalBufferMode(enabled: boolean): void {
    this.useExternalBuffers = enabled;
  }

  getInstanceBuffer(): BABYLON.StorageBuffer {
    return this.instanceBuffer;
  }

  beforeRender(): void {
    this.updateInstanceBuffer();
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.materialInstance.setCanvasSize(width, height);
  }

  dispose(): void {
    this.mesh.dispose(false, false);
    this.materialInstance.dispose();
    this.instanceBuffer.dispose();
    for (const entry of this.textureCache.values()) {
      entry.internal.dispose();
      entry.texture.dispose();
    }
  }

  private createMesh(points: readonly Point2D[], closed: boolean): BABYLON.Mesh {
    void closed;
    const contour: number[] = [];
    for (const [x, y] of points) {
      contour.push(x, y);
    }

    const indices = earcut(contour, undefined, 2);
    const positions: number[] = [];
    const uvs: number[] = [];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    for (const [x, y] of points) {
      positions.push(x, y, 0);
      uvs.push((x - minX) / width, (y - minY) / height);
    }

    const mesh = new BABYLON.Mesh('batchedShape', this.scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.uvs = uvs;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);

    return mesh;
  }

  private setupInstanceVertexBuffers(): void {
    const engine = this.scene.getEngine() as BABYLON.WebGPUEngine;
    const floatsPerInstance = this.instanceLayout.size;

    for (const member of this.instanceLayout.members) {
      const vb = new BABYLON.VertexBuffer(
        engine,
        this.instanceBuffer.getBuffer(),
        `inst_${String(member.name)}`,
        false,
        false,
        floatsPerInstance,
        true,
        member.offset,
        member.floatCount,
      );
      this.mesh.setVerticesBuffer(vb);
    }
  }

  private resolveTexture(source: TextureSource, key: string): BABYLON.BaseTexture {
    if ('output' in (source as { output?: BABYLON.RenderTargetTexture }) && (source as { output?: BABYLON.RenderTargetTexture }).output instanceof BABYLON.RenderTargetTexture) {
      return (source as { output: BABYLON.RenderTargetTexture }).output;
    }

    if (source instanceof BABYLON.RenderTargetTexture) {
      return source;
    }

    if (source instanceof BABYLON.BaseTexture) {
      return source;
    }

    const canvas = source as HTMLCanvasElement | OffscreenCanvas;
    const width = canvas.width;
    const height = canvas.height;
    const engine = this.scene.getEngine() as BABYLON.WebGPUEngine;

    let entry = this.textureCache.get(key);
    if (!entry || entry.width !== width || entry.height !== height) {
      if (entry) {
        entry.internal.dispose();
      }
      const internal = engine.createDynamicTexture(width, height, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);
      internal.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      internal.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

      const wrapper = new BABYLON.BaseTexture(this.scene, internal);
      wrapper.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      wrapper.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      wrapper.updateSamplingMode(BABYLON.Texture.BILINEAR_SAMPLINGMODE);

      entry = { texture: wrapper, internal, width, height };
      this.textureCache.set(key, entry);
    }

    engine.updateDynamicTexture(entry.internal, canvas as HTMLCanvasElement, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE);

    return entry.texture;
  }
}
