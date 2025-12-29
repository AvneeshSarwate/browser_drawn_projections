import * as BABYLON from 'babylonjs';

export type Point2D = readonly [number, number];

export type TextureSource =
  | BABYLON.BaseTexture
  | BABYLON.RenderTargetTexture
  | HTMLCanvasElement
  | OffscreenCanvas
  | { output: BABYLON.RenderTargetTexture };

export interface CanvasTextureEntry {
  texture: BABYLON.BaseTexture;
  internal: BABYLON.InternalTexture;
  width: number;
  height: number;
}

export interface MaterialInstance<U, T extends string> {
  material: BABYLON.ShaderMaterial;
  setUniforms(uniforms: Partial<U>): void;
  setTexture(name: T, texture: BABYLON.BaseTexture): void;
  setCanvasSize(width: number, height: number): void;
  dispose(): void;
  setTextureSampler?: (name: T, sampler: BABYLON.TextureSampler) => void;
}

export interface MaterialDef<U, T extends string> {
  createMaterial: (scene: BABYLON.Scene, name?: string) => MaterialInstance<U, T>;
  uniformDefaults: U;
  textureNames: readonly T[];
}

export interface InstanceAttrLayout<I> {
  size: number;
  members: Array<{
    name: keyof I;
    offset: number;
    floatCount: number;
  }>;
}

export interface BatchMaterialDef<U, T extends string, I> extends MaterialDef<U, T> {
  instanceAttrLayout: InstanceAttrLayout<I>;
}

export interface StrokeMeshData {
  positions: Float32Array;
  uvs: Float32Array;
  normals: Float32Array;
  sides: Float32Array;
  arcLengths: Float32Array;
  normalizedArcs: Float32Array;
  miterFactors: Float32Array;
  indices: Uint32Array;
  totalArcLength: number;
}
