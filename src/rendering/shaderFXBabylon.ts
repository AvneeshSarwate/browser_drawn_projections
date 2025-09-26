import * as BABYLON from 'babylonjs'

export type ShaderSource =
  | BABYLON.BaseTexture
  | BABYLON.RenderTargetTexture
  | HTMLCanvasElement
  | OffscreenCanvas
  | ShaderEffect
export type ShaderInputs = {
  [key: string]: ShaderSource
}

export type Dynamic<T> = T | (() => T)
export type ShaderUniform = unknown
export type ShaderUniforms = {
  [key: string]: Dynamic<ShaderUniform>
}

function extract<T>(value: Dynamic<T>): T {
  return value instanceof Function ? value() : value
}

function resolveTexture(_engine: BABYLON.WebGPUEngine, _scene: BABYLON.Scene, source: ShaderSource): BABYLON.BaseTexture | HTMLCanvasElement | OffscreenCanvas {
  if (source instanceof ShaderEffect) {
    return source.output
  }
  if (source instanceof BABYLON.BaseTexture || source instanceof BABYLON.RenderTargetTexture) {
    return source
  }
  return source
}

interface CanvasTextureEntry {
  texture: BABYLON.BaseTexture
  internal: BABYLON.InternalTexture
  width: number
  height: number
}

const CANVAS_PAINT_VERTEX_SOURCE = `// Auto-generated style passthrough for CanvasPaint
attribute position: vec3<f32>;
attribute uv: vec2<f32>;
varying vUV: vec2<f32>;
var src: texture_2d<f32>;
var srcSampler: sampler;

#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
  vertexOutputs.position = vec4<f32>(vertexInputs.position, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
#define CUSTOM_VERTEX_MAIN_END
}

`;

const CANVAS_PAINT_FRAGMENT_SOURCE = `// Auto-generated style passthrough for CanvasPaint
varying vUV: vec2<f32>;
var src: texture_2d<f32>;
var srcSampler: sampler;

fn canvasPaintSample(uv: vec2<f32>, source: texture_2d<f32>, samplerRef: sampler) -> vec4<f32> {
  return textureSample(source, samplerRef, uv);
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
  let color = canvasPaintSample(fragmentInputs.vUV, src, srcSampler);
  fragmentOutputs.color = color;
#define CUSTOM_FRAGMENT_MAIN_END
}

`;

function createCanvasPaintMaterial(scene: BABYLON.Scene, name = 'CanvasPaintMaterial'): BABYLON.ShaderMaterial {
  // Register shaders in the WGSL store to enable preprocessor
  const vertexShaderName = `${name}VertexShader`;
  const fragmentShaderName = `${name}FragmentShader`;
  
  BABYLON.ShaderStore.ShadersStoreWGSL[vertexShaderName] = CANVAS_PAINT_VERTEX_SOURCE;
  BABYLON.ShaderStore.ShadersStoreWGSL[fragmentShaderName] = CANVAS_PAINT_FRAGMENT_SOURCE;
  
  return new BABYLON.ShaderMaterial(name, scene, {
    vertex: name,
    fragment: name,
  }, {
    attributes: ['position', 'uv'],
    uniforms: [],
    samplers: ['src'],
    samplerObjects: ['srcSampler'],
    shaderLanguage: BABYLON.ShaderLanguage.WGSL,
  });
}

export abstract class ShaderEffect {
  abstract setSrcs(fx: ShaderInputs): void
  abstract render(engine: BABYLON.Engine): void
  abstract setUniforms(uniforms: ShaderUniforms): void
  abstract updateUniforms(): void
  abstract output: BABYLON.RenderTargetTexture
  public debugId = 'unset'
  effectName = 'unset'
  width = 1280
  height = 720
  inputs: ShaderInputs = {}
  uniforms: ShaderUniforms = {}

  abstract dispose(): void

  disposeAll(): void {
    this.dispose()
    for (const key in this.inputs) {
      const input = this.inputs[key]
      if (input instanceof ShaderEffect) {
        input.disposeAll()
      }
    }
  }

  renderAll(engine: BABYLON.Engine): void {
    for (const key in this.inputs) {
      const input = this.inputs[key]
      if (input instanceof ShaderEffect) {
        input.renderAll(engine)
      }
    }
    this.render(engine)
  }
}

interface MaterialHandles<U> {
  material: BABYLON.ShaderMaterial
  setTexture(name: string, texture: BABYLON.BaseTexture): void
  setTextureSampler(name: string, sampler: BABYLON.TextureSampler): void
  setUniforms(uniforms: Partial<U>): void
}

export type ShaderMaterialFactory<U> = (scene: BABYLON.Scene, options?: { name?: string }) => MaterialHandles<U>

export interface CustomShaderEffectOptions<U> {
  factory: ShaderMaterialFactory<U>
  textureInputKey?: string
  textureInputKeys?: string[]
  width?: number
  height?: number
  sampler?: BABYLON.TextureSampler
  materialName?: string
  sampleMode?: 'nearest' | 'linear'
}

export class CustomShaderEffect<U extends object> extends ShaderEffect {
  readonly engine: BABYLON.WebGPUEngine
  readonly scene: BABYLON.Scene
  readonly output: BABYLON.RenderTargetTexture
  protected readonly quad: BABYLON.Mesh
  protected readonly camera: BABYLON.FreeCamera
  protected readonly handles: MaterialHandles<U>
  protected readonly textureKeys: string[]
  protected readonly defaultSampler: BABYLON.TextureSampler
  protected sampler?: BABYLON.TextureSampler
  protected readonly canvasTextures: Record<string, CanvasTextureEntry> = {}
  protected readonly samplingMode: number

  get material(): BABYLON.ShaderMaterial {
    return this.handles.material
  }

  constructor(engine: BABYLON.WebGPUEngine, inputs: ShaderInputs, options: CustomShaderEffectOptions<U>) {
    super()
    this.engine = engine
    const width = options.width ?? this.width
    const height = options.height ?? this.height
    const sampleMode = options.sampleMode ?? 'linear'
    const samplingConstant = sampleMode === 'nearest' ? BABYLON.Texture.NEAREST_SAMPLINGMODE : BABYLON.Texture.BILINEAR_SAMPLINGMODE
    this.samplingMode = samplingConstant

    const textureKeys = options.textureInputKeys ?? (options.textureInputKey ? [options.textureInputKey] : [])
    if (textureKeys.length === 0) {
      throw new Error('CustomShaderEffect requires at least one textureInputKey')
    }
    this.textureKeys = textureKeys

    this.scene = new BABYLON.Scene(engine)
    this.scene.autoClear = false
    this.scene.autoClearDepthAndStencil = false
    
    // Disable Babylon's default preventDefault behavior to allow mouse events
    this.scene.preventDefaultOnPointerDown = false
    this.scene.preventDefaultOnPointerUp = false
    this.scene.doNotHandleCursors = true
    
    const inputElement = engine.getInputElement()
    if (inputElement) {
      this.scene.detachControl()
    }
    this.inputs = inputs
    this.width = width
    this.height = height

    const materialName = options.materialName ?? 'ShaderFXMaterial'
    this.handles = options.factory(this.scene, { name: materialName })
    this.handles.material.backFaceCulling = false

    this.quad = BABYLON.MeshBuilder.CreatePlane('shaderFXQuad', { size: 2 }, this.scene)
    this.quad.isVisible = false
    this.quad.material = this.handles.material
    this.quad.alwaysSelectAsActiveMesh = true

    const layerMask = 0x40000000
    this.quad.layerMask = layerMask

    this.camera = new BABYLON.FreeCamera('shaderFXCamera', new BABYLON.Vector3(0, 0, -1), this.scene)
    this.camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA
    this.camera.orthoLeft = -1
    this.camera.orthoRight = 1
    this.camera.orthoTop = 1
    this.camera.orthoBottom = -1
    this.camera.layerMask = layerMask
    this.camera.minZ = 0
    this.camera.maxZ = 1
    this.camera.setEnabled(false)
    this.scene.activeCamera = this.camera

    this.output = new BABYLON.RenderTargetTexture(
      'shaderFXOutput',
      { width, height },
      this.scene,
      false,
      true,
      BABYLON.Engine.TEXTURETYPE_UNSIGNED_INT,
      false,
      samplingConstant,
      false,
    )
    this.output.activeCamera = this.camera
    this.output.ignoreCameraViewport = true
    this.output.clearColor = new BABYLON.Color4(0, 0, 0, 0)
    this.output.renderList = [this.quad]
    this.defaultSampler = options.sampler ?? new BABYLON.TextureSampler()
    if (!options.sampler) {
      this.defaultSampler.setParameters(
        BABYLON.Texture.CLAMP_ADDRESSMODE,
        BABYLON.Texture.CLAMP_ADDRESSMODE,
        BABYLON.Texture.CLAMP_ADDRESSMODE,
        undefined,
        samplingConstant,
      )
    }
    for (const key of this.textureKeys) {
      this.handles.setTextureSampler(key, this.defaultSampler)
    }
    if (options.sampler) {
      this.sampler = options.sampler
      for (const key of this.textureKeys) {
        this.handles.setTextureSampler(key, options.sampler)
      }
    }

    this._applySources()
  }

  setTextureSampler(sampler: BABYLON.TextureSampler): void {
    this.sampler = sampler
    for (const key of this.textureKeys) {
      this.handles.setTextureSampler(key, sampler)
    }
  }

  setSrcs(fx: ShaderInputs): void {
    this.inputs = { ...this.inputs, ...fx }
    this._applySources()
  }

  setUniforms(uniforms: ShaderUniforms): void {
    for (const key in uniforms) {
      this.uniforms[key] = uniforms[key]
    }
  }

  updateUniforms(): void {
    const resolved: Record<string, unknown> = {}
    for (const key in this.uniforms) {
      resolved[key] = extract(this.uniforms[key])
    }
    this.handles.setUniforms(resolved as Partial<U>)
  }

  render(_engine: BABYLON.Engine): void {
    this._applySources()
    this.updateUniforms()
    this.quad.isVisible = true
    this.output.render(false)
    this.quad.isVisible = false
  }

  dispose(): void {
    this.output.dispose()
    this.quad.dispose(false, false)
    this.camera.dispose()
    this.handles.material.dispose(true, false)
    Object.values(this.canvasTextures).forEach((entry) => {
      entry.internal.dispose()
      entry.texture.dispose()
    })
    this.scene.dispose()
  }

  protected _applySources(): void {
    for (const key of this.textureKeys) {
      const source = this.inputs[key]
      if (!source) {
        continue
      }
      const resolved = resolveTexture(this.engine, this.scene, source)
      let texture: BABYLON.BaseTexture
      if (resolved instanceof BABYLON.BaseTexture) {
        texture = resolved
      } else if (resolved instanceof BABYLON.RenderTargetTexture) {
        texture = resolved
      } else {
        let entry = this.canvasTextures[key]
        const width = resolved.width as number
        const height = resolved.height as number
        if (!entry) {
          const internal = this.engine.createDynamicTexture(width, height, false, this.samplingMode)
          internal.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE
          internal.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE
          const wrapper = new BABYLON.BaseTexture(this.scene, internal)
          wrapper.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE
          wrapper.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE
          wrapper.updateSamplingMode(this.samplingMode)
          entry = { texture: wrapper, internal, width, height }
          this.canvasTextures[key] = entry
        } else if (entry.width !== width || entry.height !== height) {
          entry.internal.dispose()
          const internal = this.engine.createDynamicTexture(width, height, false, this.samplingMode)
          internal.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE
          internal.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE
          entry.texture._texture = internal
          entry.texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE
          entry.texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE
          entry.texture.updateSamplingMode(this.samplingMode)
          entry.internal = internal
          entry.width = width
          entry.height = height
        }
        const imageSource = resolved as HTMLCanvasElement | OffscreenCanvas
        
        // Debug: Log canvas texture update
        // console.log('Updating canvas texture:', {
        //   key,
        //   width,
        //   height,
        //   canvasId: (imageSource as HTMLCanvasElement).id,
        //   canvasWidth: imageSource.width,
        //   canvasHeight: imageSource.height
        // })
        
        this.engine.updateDynamicTexture(entry.internal, imageSource, false, false, BABYLON.Constants.TEXTUREFORMAT_RGBA)
        entry.width = width
        entry.height = height
        texture = entry.texture
      }
      this.handles.setTexture(key, texture)
      this.handles.setTextureSampler(key, this.sampler ?? this.defaultSampler)
    }
  }
}

export class CanvasPaint extends CustomShaderEffect<Record<string, never>> {
  effectName = 'CanvasPaint'

  constructor(engine: BABYLON.WebGPUEngine, inputs: { src: ShaderSource }, width = 1280, height = 720, sampleMode: 'nearest' | 'linear' = 'linear') {
    super(engine, inputs, {
      factory: (sceneRef, options) => {
        const material = createCanvasPaintMaterial(sceneRef, options?.name ?? 'CanvasPaintMaterial')
        const samplerLookup = { src: 'srcSampler' } as const
        return {
          material,
          setTexture: (name, texture) => material.setTexture(name, texture),
          setTextureSampler: (name, sampler) => material.setTextureSampler(samplerLookup[name as keyof typeof samplerLookup], sampler),
          setUniforms: () => {},
        }
      },
      textureInputKeys: ['src'],
      width,
      height,
      materialName: 'CanvasPaintMaterial',
      sampleMode,
    })
  }

  override render(engine: BABYLON.Engine): void {
    this._applySources()
    this.updateUniforms()
    engine.restoreDefaultFramebuffer()
    this.quad.isVisible = true
    this.scene.render(false)
    this.quad.isVisible = false
  }
}

// export { FeedbackNode } from './feedbackNodeBabylon'


// Auto-generated by wgsl fragment generator. DO NOT EDIT.
export const PassthruVertexSource = `// Auto-generated by wgsl fragment generator. DO NOT EDIT.
attribute position: vec3<f32>;
attribute uv: vec2<f32>;
varying vUV: vec2<f32>;
var src: texture_2d<f32>;
var srcSampler: sampler;

#define CUSTOM_VERTEX_DEFINITIONS
@vertex
fn main(input : VertexInputs) -> FragmentInputs {
#define CUSTOM_VERTEX_MAIN_BEGIN
  vertexOutputs.position = vec4<f32>(vertexInputs.position, 1.0);
  vertexOutputs.vUV = vertexInputs.uv;
#define CUSTOM_VERTEX_MAIN_END
}

`;
export const PassthruFragmentSource = `// Auto-generated by wgsl fragment generator. DO NOT EDIT.
varying vUV: vec2<f32>;
var src: texture_2d<f32>;
var srcSampler: sampler;

// Source fragment function
fn passthru(uv: vec2<f32>, src: texture_2d<f32>, srcSampler: sampler) -> vec4<f32> {
  return textureSample(src, srcSampler, uv);
}

#define CUSTOM_FRAGMENT_DEFINITIONS
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
#define CUSTOM_FRAGMENT_MAIN_BEGIN
  let uv_local = fragmentInputs.vUV;
  let color = passthru(uv_local, src, srcSampler);
  fragmentOutputs.color = color;
#define CUSTOM_FRAGMENT_MAIN_END
}

`;

export type PassthruUniforms = Record<string, never>;
export function setPassthruUniforms(_material: BABYLON.ShaderMaterial, _uniforms: Partial<PassthruUniforms>): void {}

export type PassthruTextureName = 'src';
export interface PassthruMaterialHandles {
  material: BABYLON.ShaderMaterial;
  setTexture(name: PassthruTextureName, texture: BABYLON.BaseTexture): void;
  setTextureSampler(name: PassthruTextureName, sampler: BABYLON.TextureSampler): void;
  setUniforms(uniforms: Partial<PassthruUniforms>): void;
}

export interface PassthruMaterialOptions {
  name?: string;
}

export function createPassthruMaterial(scene: BABYLON.Scene, options: PassthruMaterialOptions = {}): PassthruMaterialHandles {
  const name = options.name ?? 'PassthruMaterial';
  // Register shaders in the WGSL store to enable preprocessor
  const vertexShaderName = `${name}VertexShader`;
  const fragmentShaderName = `${name}FragmentShader`;
  
  BABYLON.ShaderStore.ShadersStoreWGSL[vertexShaderName] = PassthruVertexSource;
  BABYLON.ShaderStore.ShadersStoreWGSL[fragmentShaderName] = PassthruFragmentSource;
  
  const material = new BABYLON.ShaderMaterial(name, scene, {
    vertex: name,
    fragment: name,
  }, {
    attributes: ['position', 'uv'],
    uniforms: [],
    samplers: ['src'],
    samplerObjects: ['srcSampler'],
    shaderLanguage: BABYLON.ShaderLanguage.WGSL,
  });

  const samplerLookup = { 'src': 'srcSampler' } as const;

  const handles: PassthruMaterialHandles = {
    material,
    setTexture: (name, texture) => material.setTexture(name, texture),
    setTextureSampler: (name, sampler) => material.setTextureSampler(samplerLookup[name], sampler),
    setUniforms: () => {},
  };

  return handles;
}

export class PassthruEffect extends CustomShaderEffect<PassthruUniforms> {
  effectName = 'Passthru'

  constructor(engine: BABYLON.WebGPUEngine, inputs: ShaderInputs, width = 1280, height = 720, sampleMode: 'nearest' | 'linear' = 'linear') {
    super(engine, inputs, {
      factory: (sceneRef, options) => createPassthruMaterial(sceneRef, options),
      textureInputKeys: ['src'],
      width,
      height,
      materialName: 'PassthruMaterial',
      sampleMode,
    })
  }
}

export class FeedbackNode extends ShaderEffect {
  output: BABYLON.RenderTargetTexture
  private readonly passthrough: PassthruEffect
  private readonly sampleMode: 'nearest' | 'linear'
  private firstRender = true
  private feedbackSrc?: ShaderEffect

  constructor(
    engine: BABYLON.WebGPUEngine,
    startState: ShaderEffect,
    width = startState.width,
    height = startState.height,
    sampleMode: 'nearest' | 'linear' = 'linear',
  ) {
    super()
    this.width = width
    this.height = height
    this.inputs = { initialState: startState }
    this.sampleMode = sampleMode
    this.passthrough = new PassthruEffect(engine, { src: startState.output }, width, height, sampleMode)
    this.output = this.passthrough.output
  }

  setFeedbackSrc(effect: ShaderEffect): void {
    this.feedbackSrc = effect
    // DON'T add to inputs - that would create a cycle in renderAll traversal
    // The feedback connection is handled by swapping texture sources after first render
  }

  setSrcs(inputs: { initialState: ShaderEffect }): void {
    this.inputs = inputs
    this.passthrough.setSrcs({ src: inputs.initialState.output })
    this.firstRender = true
  }

  setUniforms(_uniforms: ShaderUniforms): void {}

  updateUniforms(): void {}

  render(engine: BABYLON.Engine): void {
    this.passthrough.render(engine)
    if (this.firstRender) {
      this.firstRender = false
      if (this.feedbackSrc) {
        this.passthrough.setSrcs({ src: this.feedbackSrc.output })
      }
    }
  }

  dispose(): void {
    this.passthrough.dispose()
  }
}
