import * as BABYLON from 'babylonjs';

export type Point2D = readonly [number, number];

/**
 * Accepted texture sources for StyledShape/BatchedStyledShape.
 * For canvas sources, use CanvasTexture helper from sceneHelpers.ts.
 */
export type TextureSource =
  | BABYLON.BaseTexture
  | BABYLON.RenderTargetTexture
  | { output: BABYLON.RenderTargetTexture };

export interface MaterialInstance<U, T extends string> {
  material: BABYLON.ShaderMaterial;
  setUniforms(uniforms: Partial<U>): void;
  setTexture(name: T, texture: BABYLON.BaseTexture): void;
  setCanvasSize(width: number, height: number): void;
  dispose(): void;
  setTextureSampler?(name: T, sampler: BABYLON.TextureSampler): void;
}

export interface MaterialDef<U, T extends string> {
  readonly createMaterial: (scene: BABYLON.Scene, name?: string) => MaterialInstance<U, T>;
  readonly uniformDefaults: U;
  readonly textureNames: readonly T[];
}

export type MaterialUniforms<M> = M extends MaterialDef<infer U, infer _T> ? U : never;
export type MaterialTextureNames<M> = M extends MaterialDef<unknown, infer T> ? T : never;
export type MaterialInstanceOf<M> = M extends MaterialDef<unknown, infer _T> ? ReturnType<M['createMaterial']> : never;

export interface InstanceAttrLayout<I> {
  size: number;
  members: Array<{
    name: keyof I;
    offset: number;
    floatCount: number;
  }>;
}

export interface BatchMaterialDef<U, T extends string, I> extends MaterialDef<U, T> {
  readonly instanceAttrLayout: InstanceAttrLayout<I>;
}

export type BatchInstanceAttrs<M> = M extends { instanceAttrLayout: InstanceAttrLayout<infer I> } ? I : never;

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
