import * as BABYLON from 'babylonjs';
import earcut from 'earcut';
import type {
  MaterialDef,
  MaterialInstanceOf,
  Point2D,
  TextureSource,
} from './types';
import { generateStrokeMesh } from './strokeMeshGenerator';
import { createMaterialInstanceName } from './materialNames';

type MaybeMaterialDef = MaterialDef<object, string> | undefined;

type UniformsOf<M> = M extends MaterialDef<infer U, infer _T> ? U : never;
type TextureNamesOf<M> = M extends MaterialDef<unknown, infer T> ? T : never;
type MaterialInstanceFor<M> = MaterialInstanceOf<M>;

interface StrokeAPI<M extends MaterialDef<object, string>> {
  setUniforms(uniforms: Partial<UniformsOf<M>>): void;
  setTexture(name: TextureNamesOf<M>, source: TextureSource): void;
  setTextureSampler(name: TextureNamesOf<M>, sampler: BABYLON.TextureSampler): void;
  thickness: number;
  mesh: BABYLON.Mesh;
}

interface StyledShapeOptions<BodyMat extends MaterialDef<object, string>, StrokeMat extends MaybeMaterialDef = undefined> {
  scene: BABYLON.Scene;
  points: readonly Point2D[];
  bodyMaterial: BodyMat;
  strokeMaterial?: StrokeMat;
  strokeThickness?: number;
  closed?: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export class StyledShape<BodyMat extends MaterialDef<object, string>, StrokeMat extends MaybeMaterialDef = undefined> {
  private readonly scene: BABYLON.Scene;
  private bodyMesh: BABYLON.Mesh;
  private strokeMesh: BABYLON.Mesh | null = null;
  private readonly bodyMaterialInstance: MaterialInstanceFor<BodyMat>;
  private strokeMaterialInstance: MaterialInstanceFor<Exclude<StrokeMat, undefined>> | null = null;
  private readonly parentNode: BABYLON.TransformNode;

  private points: readonly Point2D[];
  private closed: boolean;
  private canvasWidth: number;
  private canvasHeight: number;
  private _strokeThickness: number;
  private _alphaIndex = 0;
  private _x = 0;
  private _y = 0;
  private _rotation = 0;
  private _scaleX = 1;
  private _scaleY = 1;
  private readonly shapeTranslate = new BABYLON.Vector2(0, 0);
  private readonly shapeScale = new BABYLON.Vector2(1, 1);

  constructor(options: StyledShapeOptions<BodyMat, StrokeMat>) {
    this.scene = options.scene;
    this.points = options.points;
    this.closed = options.closed ?? true;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;
    this._strokeThickness = options.strokeThickness ?? 1;

    this.parentNode = new BABYLON.TransformNode('styledShape', this.scene);

    const bodyMaterialName = createMaterialInstanceName('power2dBodyMaterial');
    this.bodyMaterialInstance = options.bodyMaterial.createMaterial(this.scene, bodyMaterialName) as MaterialInstanceFor<BodyMat>;
    this.bodyMaterialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);

    this.bodyMesh = this.createBodyMesh();
    this.bodyMesh.parent = this.parentNode;
    this.bodyMesh.material = this.bodyMaterialInstance.material;

    if (options.strokeMaterial) {
      const strokeMaterialName = createMaterialInstanceName('power2dStrokeMaterial');
      this.strokeMaterialInstance = options.strokeMaterial.createMaterial(this.scene, strokeMaterialName) as MaterialInstanceFor<Exclude<StrokeMat, undefined>>;
      this.strokeMaterialInstance.setCanvasSize(this.canvasWidth, this.canvasHeight);
      this.strokeMaterialInstance.material.setFloat('power2d_strokeThickness', this._strokeThickness);

      this.strokeMesh = this.createStrokeMesh();
      this.strokeMesh.parent = this.parentNode;
      this.strokeMesh.material = this.strokeMaterialInstance.material;
    }

    this.applyShapeTransform();
  }

  //===========================================================================
  // Body API
  //===========================================================================

  get body() {
    const self = this;
    return {
      setUniforms(uniforms: Partial<UniformsOf<BodyMat>>): void {
        self.bodyMaterialInstance.setUniforms(uniforms);
      },
      setTexture(name: TextureNamesOf<BodyMat>, source: TextureSource): void {
        const texture = self.resolveTexture(source);
        self.bodyMaterialInstance.setTexture(name, texture);
      },
      setTextureSampler(name: TextureNamesOf<BodyMat>, sampler: BABYLON.TextureSampler): void {
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

  get stroke(): StrokeMat extends MaterialDef<object, string> ? StrokeAPI<StrokeMat> : null {
    if (!this.strokeMaterialInstance || !this.strokeMesh) {
      return null as StrokeMat extends MaterialDef<object, string> ? StrokeAPI<StrokeMat> : null;
    }

    const self = this;
    return {
      setUniforms(uniforms: Partial<UniformsOf<Exclude<StrokeMat, undefined>>>): void {
        self.strokeMaterialInstance!.setUniforms(uniforms);
      },
      setTexture(name: TextureNamesOf<Exclude<StrokeMat, undefined>>, source: TextureSource): void {
        const texture = self.resolveTexture(source);
        self.strokeMaterialInstance!.setTexture(name, texture);
      },
      setTextureSampler(name: TextureNamesOf<Exclude<StrokeMat, undefined>>, sampler: BABYLON.TextureSampler): void {
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
    } as unknown as StrokeMat extends MaterialDef<object, string> ? StrokeAPI<StrokeMat> : null;
  }

  //===========================================================================
  // Transform API
  //===========================================================================

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

  private applyShapeTransform(): void {
    this.shapeTranslate.x = this._x;
    this.shapeTranslate.y = this._y;
    this.shapeScale.x = this._scaleX;
    this.shapeScale.y = this._scaleY;

    this.bodyMaterialInstance.material.setVector2('power2d_shapeTranslate', this.shapeTranslate);
    this.bodyMaterialInstance.material.setFloat('power2d_shapeRotation', this._rotation);
    this.bodyMaterialInstance.material.setVector2('power2d_shapeScale', this.shapeScale);

    if (this.strokeMaterialInstance) {
      this.strokeMaterialInstance.material.setVector2('power2d_shapeTranslate', this.shapeTranslate);
      this.strokeMaterialInstance.material.setFloat('power2d_shapeRotation', this._rotation);
      this.strokeMaterialInstance.material.setVector2('power2d_shapeScale', this.shapeScale);
    }
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
