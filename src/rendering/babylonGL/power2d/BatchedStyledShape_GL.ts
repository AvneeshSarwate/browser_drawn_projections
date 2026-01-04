import * as BABYLON from 'babylonjs';
import earcut from 'earcut';
import type {
  BatchInstanceAttrs,
  BatchMaterialDef,
  InstanceAttrLayout,
  MaterialInstanceOf,
  MaterialTextureNames,
  MaterialUniforms,
  Point2D,
  TextureSource,
} from './types_GL';
import { createMaterialInstanceName } from '../../power2d/materialNames';

interface BatchedStyledShapeOptions<M extends BatchMaterialDef<object, string, Record<string, unknown>>> {
  scene: BABYLON.Scene;
  points: readonly Point2D[];
  material: M;
  instanceCount: number;
  canvasWidth: number;
  canvasHeight: number;
  closed?: boolean;
}

export class BatchedStyledShape<M extends BatchMaterialDef<object, string, Record<string, unknown>>> {
  private readonly scene: BABYLON.Scene;
  private readonly mesh: BABYLON.Mesh;
  private readonly materialInstance: MaterialInstanceOf<M>;
  private readonly instanceCount: number;
  private readonly instanceLayout: InstanceAttrLayout<BatchInstanceAttrs<M>>;

  private readonly instanceBuffers: Record<string, Float32Array> = {};
  private readonly instanceFloatCounts: Record<string, number> = {};
  private readonly instanceMatrices: Float32Array;
  private needsInstanceUpdate = false;

  private canvasWidth: number;
  private canvasHeight: number;
  private _x = 0;
  private _y = 0;
  private _rotation = 0;
  private _scaleX = 1;
  private _scaleY = 1;
  private readonly shapeTranslate = new BABYLON.Vector2(0, 0);
  private readonly shapeScale = new BABYLON.Vector2(1, 1);

  constructor(options: BatchedStyledShapeOptions<M>) {
    this.scene = options.scene;
    this.instanceCount = options.instanceCount;
    this.instanceLayout = options.material.instanceAttrLayout as InstanceAttrLayout<BatchInstanceAttrs<M>>;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;

    const materialName = createMaterialInstanceName('power2dBatchMaterial');
    this.materialInstance = options.material.createMaterial(this.scene, materialName) as MaterialInstanceOf<M>;
    this.materialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);
    this.applyShapeTransform();

    this.mesh = this.createMesh(options.points, options.closed ?? true);
    this.mesh.material = this.materialInstance.material;

    this.instanceMatrices = new Float32Array(this.instanceCount * 16);
    this.fillIdentityMatrices(this.instanceMatrices, this.instanceCount);
    this.mesh.thinInstanceSetBuffer('matrix', this.instanceMatrices, 16, true);
    this.mesh.thinInstanceCount = this.instanceCount;
    this.mesh.forcedInstanceCount = this.instanceCount;

    this.initializeInstanceBuffers();
  }

  private fillIdentityMatrices(buffer: Float32Array, count: number): void {
    for (let i = 0; i < count; i++) {
      const base = i * 16;
      buffer[base] = 1;
      buffer[base + 1] = 0;
      buffer[base + 2] = 0;
      buffer[base + 3] = 0;
      buffer[base + 4] = 0;
      buffer[base + 5] = 1;
      buffer[base + 6] = 0;
      buffer[base + 7] = 0;
      buffer[base + 8] = 0;
      buffer[base + 9] = 0;
      buffer[base + 10] = 1;
      buffer[base + 11] = 0;
      buffer[base + 12] = 0;
      buffer[base + 13] = 0;
      buffer[base + 14] = 0;
      buffer[base + 15] = 1;
    }
  }

  private initializeInstanceBuffers(): void {
    for (const member of this.instanceLayout.members) {
      const attrName = `inst_${String(member.name)}`;
      const floatCount = member.floatCount;
      const buffer = new Float32Array(this.instanceCount * floatCount);
      this.instanceBuffers[attrName] = buffer;
      this.instanceFloatCounts[attrName] = floatCount;
      this.mesh.thinInstanceSetBuffer(attrName, buffer, floatCount, false);
    }
  }

  setUniforms(uniforms: Partial<MaterialUniforms<M>>): void {
    this.materialInstance.setUniforms(uniforms);
  }

  setTexture(name: MaterialTextureNames<M>, source: TextureSource): void {
    const texture = this.resolveTexture(source);
    this.materialInstance.setTexture(name, texture);
  }

  setTextureSampler(name: MaterialTextureNames<M>, sampler: BABYLON.TextureSampler): void {
    this.materialInstance.setTextureSampler?.(name, sampler);
  }

  get x(): number {
    return this._x;
  }

  set x(value: number) {
    if (value !== this._x) {
      this._x = value;
      this.applyShapeTransform();
    }
  }

  get y(): number {
    return this._y;
  }

  set y(value: number) {
    if (value !== this._y) {
      this._y = value;
      this.applyShapeTransform();
    }
  }

  get rotation(): number {
    return this._rotation;
  }

  set rotation(value: number) {
    if (value !== this._rotation) {
      this._rotation = value;
      this.applyShapeTransform();
    }
  }

  get scaleX(): number {
    return this._scaleX;
  }

  set scaleX(value: number) {
    if (value !== this._scaleX) {
      this._scaleX = value;
      this.applyShapeTransform();
    }
  }

  get scaleY(): number {
    return this._scaleY;
  }

  set scaleY(value: number) {
    if (value !== this._scaleY) {
      this._scaleY = value;
      this.applyShapeTransform();
    }
  }

  get position(): BABYLON.Vector3 {
    return new BABYLON.Vector3(this._x, this._y, 0);
  }

  set position(value: BABYLON.Vector3) {
    this.x = value.x;
    this.y = value.y;
  }

  get scaling(): BABYLON.Vector3 {
    return new BABYLON.Vector3(this._scaleX, this._scaleY, 1);
  }

  set scaling(value: BABYLON.Vector3) {
    this.scaleX = value.x;
    this.scaleY = value.y;
  }

  writeInstanceAttr(index: number, values: Partial<BatchInstanceAttrs<M>>): void {
    const baseIndex = Math.max(0, Math.min(this.instanceCount - 1, index));
    for (const member of this.instanceLayout.members) {
      const value = values[member.name];
      if (value === undefined) {
        continue;
      }
      const attrName = `inst_${String(member.name)}`;
      const buffer = this.instanceBuffers[attrName];
      const floatCount = this.instanceFloatCounts[attrName];
      const offset = baseIndex * floatCount;
      if (typeof value === 'number') {
        buffer[offset] = value;
      } else if (Array.isArray(value)) {
        for (let i = 0; i < floatCount; i++) {
          buffer[offset + i] = value[i] ?? 0;
        }
      }
    }
    this.needsInstanceUpdate = true;
  }

  updateInstanceBuffer(): void {
    if (!this.needsInstanceUpdate) {
      return;
    }
    for (const attrName of Object.keys(this.instanceBuffers)) {
      this.mesh.thinInstanceBufferUpdated(attrName);
    }
    this.needsInstanceUpdate = false;
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

  private resolveTexture(source: TextureSource): BABYLON.BaseTexture {
    if ('output' in source && source.output instanceof BABYLON.RenderTargetTexture) {
      return source.output;
    }

    return source as BABYLON.BaseTexture;
  }

  private applyShapeTransform(): void {
    this.shapeTranslate.x = this._x;
    this.shapeTranslate.y = this._y;
    this.shapeScale.x = this._scaleX;
    this.shapeScale.y = this._scaleY;

    this.materialInstance.material.setVector2('power2d_shapeTranslate', this.shapeTranslate);
    this.materialInstance.material.setFloat('power2d_shapeRotation', this._rotation);
    this.materialInstance.material.setVector2('power2d_shapeScale', this.shapeScale);
  }
}
