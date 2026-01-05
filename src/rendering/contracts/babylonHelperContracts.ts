import type * as BABYLON from 'babylonjs'

export type SampleMode = 'nearest' | 'linear'
export type RenderPrecision = 'unsigned_int' | 'half_float'

export interface Vec2Like { x: number; y: number }
export interface Vec3Like { x: number; y: number; z: number }
export interface Vec4Like { x: number; y: number; z: number; w: number }

export type Point2DContract = readonly [number, number]

export type TextureSourceContract =
  | BABYLON.BaseTexture
  | BABYLON.RenderTargetTexture
  | { output: BABYLON.RenderTargetTexture }

export interface ShaderGraphNodeContract {
  id: string
  name: string
  ref: ShaderEffectContract
}

export interface ShaderGraphEdgeContract {
  from: string
  to: string
}

export interface ShaderGraphContract {
  nodes: ShaderGraphNodeContract[]
  edges: ShaderGraphEdgeContract[]
}

export interface ShaderEffectContract<I = Record<string, unknown>> {
  id: string
  debugId: string
  effectName: string
  width: number
  height: number
  inputs: Partial<I>
  uniforms: Record<string, unknown>
  output: BABYLON.RenderTargetTexture
  setSrcs(fx: Partial<I>): void
  render(engine: any, frameId?: string): void
  setUniforms(uniforms: Record<string, unknown>): void
  updateUniforms(): void
  dispose(): void
  disposeAll(): void
  getOrderedEffects(): ShaderEffectContract[]
  getGraph(): ShaderGraphContract
  renderAll(engine: any, frameId?: string): void
  getUniformsMeta?: () => unknown
  getUniformRuntime?: () => Record<string, unknown>
}

export type CanvasPaintCtorContract<Inputs extends { src: unknown }> = new (
  engine: any,
  inputs: Inputs,
  width?: number,
  height?: number,
  sampleMode?: SampleMode,
  precision?: RenderPrecision,
  targetCanvas?: HTMLCanvasElement,
) => ShaderEffectContract<Inputs>

export type PassthruEffectCtorContract<Inputs extends { src: unknown }> = new (
  engine: any,
  inputs: Inputs,
  width?: number,
  height?: number,
  sampleMode?: SampleMode,
  precision?: RenderPrecision,
) => ShaderEffectContract<Inputs>

export type FeedbackNodeCtorContract<StartState> = new (
  engine: any,
  startState: StartState,
  width?: number,
  height?: number,
  sampleMode?: SampleMode,
  precision?: RenderPrecision,
) => ShaderEffectContract<{ initialState: StartState }>

export interface CanvasTextureContract {
  readonly texture: BABYLON.BaseTexture
  readonly width: number
  readonly height: number
  update(canvas: HTMLCanvasElement | OffscreenCanvas): void
  dispose(): void
}

export type CanvasTextureCtorContract = new (options: {
  engine: any
  scene: BABYLON.Scene
  width?: number
  height?: number
  samplingMode?: number
}) => CanvasTextureContract

export interface Power2DSceneContract {
  scene: BABYLON.Scene
  camera: BABYLON.FreeCamera
  canvasWidth: number
  canvasHeight: number
  resize(width: number, height: number): void
}

export type CreatePower2DSceneContract = (options: {
  engine: any
  canvasWidth: number
  canvasHeight: number
  clearColor?: BABYLON.Color4
}) => Power2DSceneContract

export interface StyledShapeBodyContract {
  setUniforms(uniforms: Record<string, unknown>): void
  setTexture(name: string, source: TextureSourceContract): void
  setTextureSampler(name: string, sampler: BABYLON.TextureSampler): void
  mesh: BABYLON.Mesh
}

export interface StyledShapeStrokeContract extends StyledShapeBodyContract {
  thickness: number
}

export interface StyledShapeContract {
  body: StyledShapeBodyContract
  stroke: StyledShapeStrokeContract | null
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  position: BABYLON.Vector3
  scaling: BABYLON.Vector3
  alphaIndex: number
  setPoints(points: readonly Point2DContract[], closed?: boolean): void
  setCanvasSize(width: number, height: number): void
  dispose(): void
}

export type StyledShapeCtorContract = new (options: {
  scene: BABYLON.Scene
  points: readonly Point2DContract[]
  bodyMaterial: unknown
  strokeMaterial?: unknown
  strokeThickness?: number
  closed?: boolean
  canvasWidth: number
  canvasHeight: number
}) => StyledShapeContract

export interface BatchedStyledShapeContract {
  setUniforms(uniforms: Record<string, unknown>): void
  setTexture(name: string, source: TextureSourceContract): void
  setTextureSampler(name: string, sampler: BABYLON.TextureSampler): void
  writeInstanceAttr(index: number, values: Record<string, unknown>): void
  updateInstanceBuffer(): void
  beforeRender(): void
  setCanvasSize(width: number, height: number): void
  dispose(): void
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  position: BABYLON.Vector3
  scaling: BABYLON.Vector3
}

export type BatchedStyledShapeCtorContract = new (options: {
  scene: BABYLON.Scene
  points: readonly Point2DContract[]
  material: unknown
  instanceCount: number
  canvasWidth: number
  canvasHeight: number
  closed?: boolean
}) => BatchedStyledShapeContract

export type RectPtsContract = (opts: { x: number; y: number; width: number; height: number }) => Point2DContract[]
export type CirclePtsContract = (opts: { cx: number; cy: number; radius: number; segments?: number }) => Point2DContract[]
