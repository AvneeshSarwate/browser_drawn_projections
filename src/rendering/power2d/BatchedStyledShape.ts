import * as BABYLON from 'babylonjs';
import earcut from 'earcut';
import type { BatchMaterialDef, InstanceAttrLayout, Point2D, TextureSource } from './types';
import { createMaterialInstanceName } from './materialNames';

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

  constructor(options: BatchedStyledShapeOptions<U, T, I>) {
    this.scene = options.scene;
    this.instanceCount = options.instanceCount;
    this.instanceLayout = options.material.instanceAttrLayout;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;

    const engine = this.scene.getEngine() as BABYLON.WebGPUEngine;

    const materialName = createMaterialInstanceName('power2dBatchMaterial');
    this.materialInstance = options.material.createMaterial(this.scene, materialName);
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

    // Set up thin instancing - must call thinInstanceSetBuffer first to initialize
    // (matches pattern from letterParticles.ts)
    this.mesh.thinInstanceSetBuffer('matrix', null, 16);
    this.mesh.thinInstanceCount = this.instanceCount;
    this.mesh.forcedInstanceCount = this.instanceCount;
    this.mesh.manualUpdateOfWorldMatrixInstancedBuffer = true;

    this.setupInstanceVertexBuffers();
  }

  setUniforms(uniforms: Partial<U>): void {
    this.materialInstance.setUniforms(uniforms);
  }

  setTexture(name: T, source: TextureSource): void {
    const texture = this.resolveTexture(source);
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

  private resolveTexture(source: TextureSource): BABYLON.BaseTexture {
    // Handle ShaderEffect-like objects with output property
    if ('output' in source && source.output instanceof BABYLON.RenderTargetTexture) {
      return source.output;
    }

    // Handle BaseTexture (including RenderTargetTexture and CanvasTexture.texture)
    return source as BABYLON.BaseTexture;
  }
}
