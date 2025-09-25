import * as BABYLON from 'babylonjs'

export type ShaderSource = BABYLON.BaseTexture | BABYLON.RenderTargetTexture | ShaderEffect
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

function resolveTexture(source: ShaderSource): BABYLON.BaseTexture {
  if (source instanceof ShaderEffect) {
    return source.output
  }
  return source
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
  setTexture(texture: BABYLON.BaseTexture): void
  setTextureSampler(sampler: BABYLON.TextureSampler): void
  setUniforms(uniforms: Partial<U>): void
}

export type ShaderMaterialFactory<U> = (scene: BABYLON.Scene, options?: { name?: string }) => MaterialHandles<U>

export interface CustomShaderEffectOptions<U> {
  factory: ShaderMaterialFactory<U>
  textureInputKey: string
  width?: number
  height?: number
  sampler?: BABYLON.TextureSampler
  materialName?: string
}

export class CustomShaderEffect<U extends object> extends ShaderEffect {
  readonly scene: BABYLON.Scene
  readonly output: BABYLON.RenderTargetTexture
  protected readonly quad: BABYLON.Mesh
  protected readonly camera: BABYLON.FreeCamera
  protected readonly handles: MaterialHandles<U>
  protected readonly textureKey: string
  protected sampler?: BABYLON.TextureSampler

  get material(): BABYLON.ShaderMaterial {
    return this.handles.material
  }

  constructor(scene: BABYLON.Scene, inputs: ShaderInputs, options: CustomShaderEffectOptions<U>) {
    super()
    const width = options.width ?? this.width
    const height = options.height ?? this.height

    this.scene = scene
    this.inputs = inputs
    this.textureKey = options.textureInputKey
    this.width = width
    this.height = height

    const materialName = options.materialName ?? 'ShaderFXMaterial'
    this.handles = options.factory(scene, { name: materialName })
    this.handles.material.backFaceCulling = false

    this.quad = BABYLON.MeshBuilder.CreatePlane('shaderFXQuad', { size: 2 }, scene)
    this.quad.isVisible = false
    this.quad.material = this.handles.material
    this.quad.alwaysSelectAsActiveMesh = true

    const layerMask = 0x40000000
    this.quad.layerMask = layerMask

    this.camera = new BABYLON.FreeCamera('shaderFXCamera', new BABYLON.Vector3(0, 0, -1), scene)
    this.camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA
    this.camera.orthoLeft = -1
    this.camera.orthoRight = 1
    this.camera.orthoTop = 1
    this.camera.orthoBottom = -1
    this.camera.layerMask = layerMask
    this.camera.minZ = 0
    this.camera.maxZ = 1
    this.camera.setEnabled(false)

    this.output = new BABYLON.RenderTargetTexture(
      'shaderFXOutput',
      { width, height },
      scene,
      false,
      true,
      BABYLON.Engine.TEXTURETYPE_UNSIGNED_INT,
      false,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
      false,
    )
    this.output.activeCamera = this.camera
    this.output.ignoreCameraViewport = true
    this.output.clearColor = new BABYLON.Color4(0, 0, 0, 0)
    this.output.renderList = [this.quad]

    if (options.sampler) {
      this.setTextureSampler(options.sampler)
    }

    this._applySources()
  }

  setTextureSampler(sampler: BABYLON.TextureSampler): void {
    this.sampler = sampler
    this.handles.setTextureSampler(sampler)
  }

  setSrcs(fx: ShaderInputs): void {
    this.inputs = fx
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
  }

  protected _applySources(): void {
    const source = this.inputs[this.textureKey]
    if (!source) {
      return
    }
    const texture = resolveTexture(source)
    this.handles.setTexture(texture)
    if (this.sampler) {
      this.handles.setTextureSampler(this.sampler)
    }
  }
}

export class Passthru<U extends Record<string, unknown>> extends CustomShaderEffect<U> {
  constructor(scene: BABYLON.Scene, inputs: ShaderInputs, options: CustomShaderEffectOptions<U>) {
    super(scene, inputs, options)
  }
}
