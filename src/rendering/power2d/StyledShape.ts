import * as BABYLON from 'babylonjs';
import earcut from 'earcut';
import type { MaterialDef, MaterialInstance, Point2D, TextureSource } from './types';
import { generateStrokeMesh } from './strokeMeshGenerator';
import { createMaterialInstanceName } from './materialNames';

interface StrokeAPI<U, T extends string> {
  setUniforms(uniforms: Partial<U>): void;
  setTexture(name: T, source: TextureSource): void;
  setTextureSampler?(name: T, sampler: BABYLON.TextureSampler): void;
  thickness: number;
  mesh: BABYLON.Mesh;
}

interface StyledShapeOptions<BodyU, BodyT extends string, StrokeU = never, StrokeT extends string = never> {
  scene: BABYLON.Scene;
  points: readonly Point2D[];
  bodyMaterial: MaterialDef<BodyU, BodyT>;
  strokeMaterial?: MaterialDef<StrokeU, StrokeT>;
  strokeThickness?: number;
  closed?: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export class StyledShape<BodyU extends object, BodyT extends string, StrokeU extends object = never, StrokeT extends string = never> {
  private readonly scene: BABYLON.Scene;
  private bodyMesh: BABYLON.Mesh;
  private strokeMesh: BABYLON.Mesh | null = null;
  private readonly bodyMaterialInstance: MaterialInstance<BodyU, BodyT>;
  private strokeMaterialInstance: MaterialInstance<StrokeU, StrokeT> | null = null;
  private readonly parentNode: BABYLON.TransformNode;

  private points: readonly Point2D[];
  private closed: boolean;
  private canvasWidth: number;
  private canvasHeight: number;
  private _strokeThickness: number;
  private _alphaIndex = 0;

  constructor(options: StyledShapeOptions<BodyU, BodyT, StrokeU, StrokeT>) {
    this.scene = options.scene;
    this.points = options.points;
    this.closed = options.closed ?? true;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;
    this._strokeThickness = options.strokeThickness ?? 1;

    this.parentNode = new BABYLON.TransformNode('styledShape', this.scene);

    const bodyMaterialName = createMaterialInstanceName('power2dBodyMaterial');
    this.bodyMaterialInstance = options.bodyMaterial.createMaterial(this.scene, bodyMaterialName);
    this.bodyMaterialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);

    this.bodyMesh = this.createBodyMesh();
    this.bodyMesh.parent = this.parentNode;
    this.bodyMesh.material = this.bodyMaterialInstance.material;

    if (options.strokeMaterial) {
      const strokeMaterialName = createMaterialInstanceName('power2dStrokeMaterial');
      this.strokeMaterialInstance = options.strokeMaterial.createMaterial(this.scene, strokeMaterialName) as MaterialInstance<StrokeU, StrokeT>;
      this.strokeMaterialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);
      this.strokeMaterialInstance.material.setFloat('power2d_strokeThickness', this._strokeThickness);

      this.strokeMesh = this.createStrokeMesh();
      this.strokeMesh.parent = this.parentNode;
      this.strokeMesh.material = this.strokeMaterialInstance.material;
    }
  }

  //===========================================================================
  // Body API
  //===========================================================================

  get body() {
    const self = this;
    return {
      setUniforms(uniforms: Partial<BodyU>): void {
        self.bodyMaterialInstance.setUniforms(uniforms);
      },
      setTexture(name: BodyT, source: TextureSource): void {
        const texture = self.resolveTexture(source);
        self.bodyMaterialInstance.setTexture(name, texture);
      },
      setTextureSampler(name: BodyT, sampler: BABYLON.TextureSampler): void {
        self.bodyMaterialInstance.setTextureSampler?.(name, sampler);
      },
      get mesh(): BABYLON.Mesh {
        return self.bodyMesh;
      },
    };
  }

  //===========================================================================
  // Stroke API
  //===========================================================================

  get stroke(): StrokeAPI<StrokeU, StrokeT> | null {
    if (!this.strokeMaterialInstance || !this.strokeMesh) {
      return null;
    }

    const self = this;
    return {
      setUniforms(uniforms: Partial<StrokeU>): void {
        self.strokeMaterialInstance!.setUniforms(uniforms);
      },
      setTexture(name: StrokeT, source: TextureSource): void {
        const texture = self.resolveTexture(source);
        self.strokeMaterialInstance!.setTexture(name, texture);
      },
      setTextureSampler(name: StrokeT, sampler: BABYLON.TextureSampler): void {
        self.strokeMaterialInstance!.setTextureSampler?.(name, sampler);
      },
      get thickness(): number {
        return self._strokeThickness;
      },
      set thickness(value: number) {
        if (value !== self._strokeThickness) {
          self._strokeThickness = value;
          if (self.strokeMaterialInstance) {
            self.strokeMaterialInstance.material.setFloat('power2d_strokeThickness', value);
          }
          self.rebuildStrokeMesh();
        }
      },
      get mesh(): BABYLON.Mesh {
        return self.strokeMesh!;
      },
    };
  }

  //===========================================================================
  // Transform API
  //===========================================================================

  get position(): BABYLON.Vector3 {
    return this.parentNode.position;
  }

  set position(value: BABYLON.Vector3) {
    this.parentNode.position = value;
  }

  get rotation(): BABYLON.Vector3 {
    return this.parentNode.rotation;
  }

  set rotation(value: BABYLON.Vector3) {
    this.parentNode.rotation = value;
  }

  get scaling(): BABYLON.Vector3 {
    return this.parentNode.scaling;
  }

  set scaling(value: BABYLON.Vector3) {
    this.parentNode.scaling = value;
  }

  get alphaIndex(): number {
    return this._alphaIndex;
  }

  set alphaIndex(value: number) {
    this._alphaIndex = value;
    this.bodyMesh.alphaIndex = value;
    if (this.strokeMesh) {
      this.strokeMesh.alphaIndex = value;
    }
  }

  //===========================================================================
  // Point Updates
  //===========================================================================

  setPoints(points: readonly Point2D[], closed?: boolean): void {
    this.points = points;
    if (closed !== undefined) {
      this.closed = closed;
    }

    this.bodyMesh.dispose(false, false);
    this.bodyMesh = this.createBodyMesh();
    this.bodyMesh.parent = this.parentNode;
    this.bodyMesh.material = this.bodyMaterialInstance.material;
    this.bodyMesh.alphaIndex = this._alphaIndex;

    if (this.strokeMesh) {
      this.rebuildStrokeMesh();
    }
  }

  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    this.bodyMaterialInstance.setCanvasSize(width, height);
    if (this.strokeMaterialInstance) {
      this.strokeMaterialInstance.setCanvasSize(width, height);
    }
  }

  //===========================================================================
  // Mesh Creation (Private)
  //===========================================================================

  private createBodyMesh(): BABYLON.Mesh {
    const contour: number[] = [];
    for (const [x, y] of this.points) {
      contour.push(x, y);
    }

    const indices = earcut(contour, undefined, 2);
    const positions: number[] = [];
    const uvs: number[] = [];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of this.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const width = maxX - minX || 1;
    const height = maxY - minY || 1;

    for (const [x, y] of this.points) {
      positions.push(x, y, 0);
      uvs.push((x - minX) / width, (y - minY) / height);
    }

    const mesh = new BABYLON.Mesh('styledShapeBody', this.scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.uvs = uvs;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);

    return mesh;
  }

  private createStrokeMesh(): BABYLON.Mesh {
    const strokeData = generateStrokeMesh(this.points, this._strokeThickness, this.closed);

    const mesh = new BABYLON.Mesh('styledShapeStroke', this.scene);
    const vertexData = new BABYLON.VertexData();

    vertexData.positions = Array.from(strokeData.positions);
    vertexData.uvs = Array.from(strokeData.uvs);
    vertexData.indices = Array.from(strokeData.indices);
    vertexData.applyToMesh(mesh);

    mesh.setVerticesData('strokeNormal', Array.from(strokeData.normals), false, 2);
    mesh.setVerticesData('strokeSide', Array.from(strokeData.sides), false, 1);
    mesh.setVerticesData('strokeArcLength', Array.from(strokeData.arcLengths), false, 1);
    mesh.setVerticesData('strokeNormalizedArc', Array.from(strokeData.normalizedArcs), false, 1);
    mesh.setVerticesData('strokeMiterFactor', Array.from(strokeData.miterFactors), false, 1);

    return mesh;
  }

  private rebuildStrokeMesh(): void {
    if (!this.strokeMesh || !this.strokeMaterialInstance) return;

    this.strokeMesh.dispose(false, false);
    this.strokeMesh = this.createStrokeMesh();
    this.strokeMesh.parent = this.parentNode;
    this.strokeMesh.material = this.strokeMaterialInstance.material;
    this.strokeMesh.alphaIndex = this._alphaIndex;
  }

  //===========================================================================
  // Texture Resolution
  //===========================================================================

  private resolveTexture(source: TextureSource): BABYLON.BaseTexture {
    // Handle ShaderEffect-like objects with output property
    if ('output' in source && source.output instanceof BABYLON.RenderTargetTexture) {
      return source.output;
    }

    // Handle BaseTexture (including RenderTargetTexture and CanvasTexture.texture)
    return source as BABYLON.BaseTexture;
  }

  //===========================================================================
  // Disposal
  //===========================================================================

  dispose(): void {
    this.bodyMesh.dispose(false, false);
    this.bodyMaterialInstance.dispose();

    if (this.strokeMesh) {
      this.strokeMesh.dispose(false, false);
    }
    if (this.strokeMaterialInstance) {
      this.strokeMaterialInstance.dispose();
    }

    this.parentNode.dispose();
  }
}
