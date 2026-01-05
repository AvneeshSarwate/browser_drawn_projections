import * as BABYLON from 'babylonjs'

export interface UniformDescriptor {
  name: string
  kind: 'f32' | 'i32' | 'u32' | 'bool' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f'
  bindingName: string
  default?: unknown
  isArray?: boolean
  arraySize?: number
  ui?: {
    min?: number
    max?: number
    step?: number
  }
}

export interface UniformRuntime {
  isDynamic: boolean
  current?: number
  min?: number
  max?: number
}

export type ShaderSource =
  | BABYLON.BaseTexture
  | BABYLON.RenderTargetTexture
  | HTMLCanvasElement
  | OffscreenCanvas
  | ShaderEffect
export type ShaderInputs = Record<string, ShaderSource>
export type RenderPrecision = 'unsigned_int' | 'half_float'

export type Dynamic<T> = T | (() => T)
export type ShaderUniform = unknown
export type ShaderUniforms = {
  [key: string]: Dynamic<ShaderUniform>
}

let shaderEffectIdCounter = 0
function generateShaderEffectId(): string {
  const cryptoRef = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    try {
      return cryptoRef.randomUUID()
    } catch {
      // fall back to counter-based id
    }
  }
  shaderEffectIdCounter += 1
  return `shaderEffect-${shaderEffectIdCounter}`
}

function extract<T>(value: Dynamic<T>): T {
  return value instanceof Function ? value() : value
}

function resolveTexture(_engine: BABYLON.Engine, _scene: BABYLON.Scene, source: ShaderSource): BABYLON.BaseTexture | HTMLCanvasElement | OffscreenCanvas {
  if (source instanceof ShaderEffect) {
    return source.output
  }
  if (source instanceof BABYLON.BaseTexture || source instanceof BABYLON.RenderTargetTexture) {
    return source
  }
  return source
}

function resolveRenderTextureType(engine: BABYLON.Engine, precision: RenderPrecision | undefined): number {
  if (precision === 'half_float') {
    const caps = engine.getCaps()
    if (caps.textureHalfFloatRender) {
      return BABYLON.Engine.TEXTURETYPE_HALF_FLOAT
    }
    if (caps.textureFloatRender) {
      return BABYLON.Engine.TEXTURETYPE_FLOAT
    }
    return BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE
  }
  if (precision === 'unsigned_int') {
    return BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE
  }
  return BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE
}

interface CanvasTextureEntry {
  texture: BABYLON.DynamicTexture
  ctx: BABYLON.ICanvasRenderingContext
  width: number
  height: number
}

const CANVAS_PAINT_VERTEX_SOURCE = `// Auto-generated style passthrough for CanvasPaint
#version 300 es
precision highp float;

in vec3 position;
in vec2 uv;
out vec2 vUV;

void main() {
  gl_Position = vec4(position, 1.0);
  vUV = uv;
}
`

const CANVAS_PAINT_FRAGMENT_SOURCE = `// Auto-generated style passthrough for CanvasPaint
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform sampler2D src;

vec4 canvasPaintSample(vec2 uv, sampler2D source) {
  return texture(source, uv);
}

void main() {
  vec4 color = canvasPaintSample(vUV, src);
  outColor = color;
}
`

function createCanvasPaintMaterial(scene: BABYLON.Scene, name = 'CanvasPaintMaterial'): BABYLON.ShaderMaterial {
  const vertexShaderName = `${name}VertexShader`
  const fragmentShaderName = `${name}FragmentShader`

  BABYLON.ShaderStore.ShadersStore[vertexShaderName] = CANVAS_PAINT_VERTEX_SOURCE
  BABYLON.ShaderStore.ShadersStore[fragmentShaderName] = CANVAS_PAINT_FRAGMENT_SOURCE

  return new BABYLON.ShaderMaterial(name, scene, {
    vertex: name,
    fragment: name,
  }, {
    attributes: ['position', 'uv'],
    uniforms: [],
    samplers: ['src'],
    shaderLanguage: BABYLON.ShaderLanguage.GLSL,
  })
}

type ShaderInputShape<I> = { [K in keyof I]: ShaderSource }

export type TextureInputKey<I extends ShaderInputShape<I>> = keyof I & string

export type PassTextureSourceSpec<I extends ShaderInputShape<I>> =
  | { binding: string; source: { kind: 'input'; key: TextureInputKey<I> } }
  | { binding: string; source: { kind: 'pass'; passIndex: number } }

type RuntimePassTextureSource<I extends ShaderInputShape<I>> =
  | { binding: string; kind: 'input'; key: TextureInputKey<I> }
  | { binding: string; kind: 'pass'; passIndex: number }

export abstract class ShaderEffect<I extends ShaderInputShape<I> = ShaderInputs> {
  readonly id: string
  abstract setSrcs(fx: Partial<I>): void
  abstract render(engine: BABYLON.Engine, frameId?: string): void
  abstract setUniforms(uniforms: ShaderUniforms): void
  abstract updateUniforms(): void
  abstract output: BABYLON.RenderTargetTexture
  public debugId = 'unset'
  effectName = 'unset'
  width = 1280
  height = 720
  inputs: Partial<I> = {}
  uniforms: ShaderUniforms = {}
  lastRenderedFrameId?: string

  protected constructor() {
    this.id = generateShaderEffectId()
  }

  abstract dispose(): void

  disposeAll(): void {
    this.dispose()
    for (const input of Object.values(this.inputs)) {
      if (input instanceof ShaderEffect) {
        input.disposeAll()
      }
    }
  }

  protected buildOrderedEffects(): ShaderEffect[] {
    const ordered: ShaderEffect[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (effect: ShaderEffect): void => {
      if (visited.has(effect.id)) {
        return
      }
      if (visiting.has(effect.id)) {
        throw new Error(`Cycle detected in shader graph at ${effect.effectName}`)
      }
      visiting.add(effect.id)
      for (const input of Object.values(effect.inputs)) {
        if (input instanceof ShaderEffect) {
          visit(input)
        }
      }
      visiting.delete(effect.id)
      visited.add(effect.id)
      ordered.push(effect)
    }

    visit(this)
    return ordered
  }

  public getOrderedEffects(): ShaderEffect[] {
    return this.buildOrderedEffects()
  }

  public getGraph(): ShaderGraph {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []
    const visited = new Set<string>()

    const visit = (effect: ShaderEffect): void => {
      if (visited.has(effect.id)) {
        return
      }
      visited.add(effect.id)

      nodes.push({
        id: effect.id,
        name: effect.effectName,
        ref: effect,
      })

      for (const input of Object.values(effect.inputs)) {
        if (input instanceof ShaderEffect) {
          edges.push({
            from: input.id,
            to: effect.id,
          })
          visit(input)
        }
      }
    }

    visit(this)
    return { nodes, edges }
  }

  renderAll(engine: BABYLON.Engine, frameId?: string): void {
    const ordered = this.getOrderedEffects()
    for (const effect of ordered) {
      if (frameId && effect.lastRenderedFrameId === frameId) {
        effect.updateUniforms()
        continue
      }
      effect.render(engine, frameId)
      effect.lastRenderedFrameId = frameId
    }
  }
}

export interface GraphNode {
  id: string
  name: string
  ref: ShaderEffect
}

export interface GraphEdge {
  from: string
  to: string
}

export interface ShaderGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface MaterialHandles<U, TName extends string = string> {
  material: BABYLON.ShaderMaterial
  setTexture(name: TName, texture: BABYLON.BaseTexture): void
  setTextureSampler(name: TName, sampler: BABYLON.TextureSampler): void
  setUniforms(uniforms: Partial<U>): void
}

export type ShaderMaterialFactory<U, TName extends string = string> = (scene: BABYLON.Scene, options?: { name?: string; passIndex?: number }) => MaterialHandles<U, TName>

export interface CustomShaderEffectOptions<U, I extends ShaderInputShape<I> = ShaderInputs> {
  factory: ShaderMaterialFactory<U, string>
  textureInputKeys: Array<TextureInputKey<I>>
  textureBindingKeys?: string[]
  passTextureSources?: readonly (readonly PassTextureSourceSpec<I>[])[ ]
  passCount?: number
  primaryTextureKey?: keyof I & string
  width?: number
  height?: number
  sampler?: BABYLON.TextureSampler
  materialName?: string
  sampleMode?: 'nearest' | 'linear'
  precision?: RenderPrecision
  uniformMeta?: UniformDescriptor[]
}

export class CustomShaderEffect<U extends object, I extends ShaderInputShape<I> = ShaderInputs> extends ShaderEffect<I> {
  readonly engine: BABYLON.Engine
  readonly scene: BABYLON.Scene
  readonly output: BABYLON.RenderTargetTexture
  protected readonly quad: BABYLON.Mesh
  protected readonly camera: BABYLON.FreeCamera
  protected readonly passHandles: Array<MaterialHandles<U, string>>
  protected readonly textureBindingNames: string[]
  protected readonly inputTextureKeys: Array<TextureInputKey<I>>
  protected readonly passCount: number
  protected readonly primaryTextureKey: keyof I & string
  protected readonly defaultSampler: BABYLON.TextureSampler
  protected sampler?: BABYLON.TextureSampler
  protected readonly canvasTextures: Record<string, CanvasTextureEntry | undefined> = {}
  protected readonly samplingMode: number
  protected readonly textureType: number
  protected readonly passTextureSources: RuntimePassTextureSource<I>[][]
  protected readonly passTargets: Array<BABYLON.RenderTargetTexture | undefined>
  public readonly uniformMeta: UniformDescriptor[]
  private readonly uniformMetaLookup: Map<string, UniformDescriptor>
  private readonly uniformRuntime: Record<string, UniformRuntime> = {}

  get material(): BABYLON.ShaderMaterial {
    return this.passHandles[0].material
  }

  getPassOutput(passIndex: number): BABYLON.RenderTargetTexture | undefined {
    return this.passTargets[passIndex]
  }

  public getUniformsMeta(): UniformDescriptor[] {
    return this.uniformMeta
  }

  public getUniformRuntime(): Record<string, UniformRuntime> {
    return this.uniformRuntime
  }

  public getFloatUniformNames(): string[] {
    return this.uniformMeta.filter((descriptor) => descriptor.kind === 'f32').map((descriptor) => descriptor.name)
  }

  private findUniformDescriptor(name: string): UniformDescriptor | undefined {
    return this.uniformMetaLookup.get(name)
  }

  private ensureUniformRuntime(name: string): UniformRuntime {
    const existing = this.uniformRuntime[name]
    if (existing) {
      return existing
    }
    const descriptor = this.findUniformDescriptor(name)
    const runtime: UniformRuntime = {
      isDynamic: false,
    }
    if (descriptor) {
      if (descriptor.ui) {
        if (descriptor.ui.min !== undefined) {
          runtime.min = descriptor.ui.min
        }
        if (descriptor.ui.max !== undefined) {
          runtime.max = descriptor.ui.max
        }
      }
      if (typeof descriptor.default === 'number') {
        runtime.current = descriptor.default
        if (runtime.min === undefined) {
          runtime.min = descriptor.default
        }
        if (runtime.max === undefined) {
          runtime.max = descriptor.default
        }
      }
    }
    this.uniformRuntime[name] = runtime
    return runtime
  }

  private updateRuntimeFromSetValue(name: string, value: Dynamic<ShaderUniform>): void {
    const descriptor = this.findUniformDescriptor(name)
    if (!descriptor || descriptor.kind !== 'f32') {
      return
    }
    if (typeof value === 'function') {
      const runtime = this.ensureUniformRuntime(name)
      runtime.isDynamic = true
      return
    }
    if (typeof value === 'number') {
      const runtime = this.ensureUniformRuntime(name)
      runtime.isDynamic = false
      runtime.current = value
      if (runtime.min === undefined || value < runtime.min) {
        runtime.min = value
      }
      if (runtime.max === undefined || value > runtime.max) {
        runtime.max = value
      }
    }
  }

  private updateRuntimeFromResolvedValue(name: string, value: unknown): void {
    const descriptor = this.findUniformDescriptor(name)
    if (!descriptor || descriptor.kind !== 'f32' || typeof value !== 'number') {
      return
    }
    const runtime = this.ensureUniformRuntime(name)
    runtime.current = value
    const source = this.uniforms[name]
    runtime.isDynamic = typeof source === 'function'
    if (runtime.min === undefined || value < runtime.min) {
      runtime.min = value
    }
    if (runtime.max === undefined || value > runtime.max) {
      runtime.max = value
    }
  }

  constructor(engine: BABYLON.Engine, inputs: I, options: CustomShaderEffectOptions<U, I>) {
    super()
    this.engine = engine
    this.uniformMeta = options.uniformMeta ? [...options.uniformMeta] : []
    this.uniformMetaLookup = new Map(this.uniformMeta.map((descriptor) => [descriptor.name, descriptor]))
    for (const descriptor of this.uniformMeta) {
      if (descriptor.kind === 'f32') {
        this.ensureUniformRuntime(descriptor.name)
      }
    }
    const width = options.width ?? this.width
    const height = options.height ?? this.height
    const sampleMode = options.sampleMode ?? 'linear'
    const samplingConstant = sampleMode === 'nearest' ? BABYLON.Texture.NEAREST_SAMPLINGMODE : BABYLON.Texture.BILINEAR_SAMPLINGMODE
    this.samplingMode = samplingConstant

    const textureInputKeys = [...options.textureInputKeys]
    if (textureInputKeys.length === 0) {
      throw new Error('CustomShaderEffect requires at least one textureInputKey')
    }
    this.inputTextureKeys = textureInputKeys

    const textureBindingKeys = options.textureBindingKeys ? [...options.textureBindingKeys] : [...textureInputKeys]
    if (textureBindingKeys.length === 0) {
      throw new Error('CustomShaderEffect requires at least one texture binding key')
    }
    this.textureBindingNames = textureBindingKeys

    this.scene = new BABYLON.Scene(engine)
    this.scene.autoClear = false
    this.scene.autoClearDepthAndStencil = false

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
    const passCount = Math.max(1, options.passCount ?? 1)
    this.passCount = passCount
    const primaryTextureKey = options.primaryTextureKey ?? textureInputKeys[0]
    if (!primaryTextureKey) {
      throw new Error('CustomShaderEffect requires a primaryTextureKey to manage multi-pass routing')
    }
    if (!textureInputKeys.includes(primaryTextureKey)) {
      throw new Error(`Primary texture key ${primaryTextureKey} must be one of the textureInputKeys`)
    }
    this.primaryTextureKey = primaryTextureKey

    this.passHandles = []
    for (let i = 0; i < passCount; i++) {
      const passName = passCount === 1 ? materialName : `${materialName}_pass${i}`
      const handles = options.factory(this.scene, { name: passName, passIndex: i })
      handles.material.backFaceCulling = false
      this.passHandles.push(handles)
    }

    this.passTextureSources = this.initializePassTextureSources(options.passTextureSources, passCount)
    this.passTargets = new Array(Math.max(0, passCount - 1)).fill(undefined)

    this.quad = BABYLON.MeshBuilder.CreatePlane('shaderFXQuad', { size: 2 }, this.scene)
    this.quad.isVisible = false
    this.quad.material = this.passHandles[0].material
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

    const textureType = resolveRenderTextureType(engine, options.precision)
    this.textureType = textureType

    this.output = new BABYLON.RenderTargetTexture(
      'shaderFXOutput',
      { width, height },
      this.scene,
      false,
      true,
      textureType,
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
    if (options.sampler) {
      this.sampler = options.sampler
    }
    this.applyDefaultSamplers()

    this.applyInitialSources()
  }

  setTextureSampler(sampler: BABYLON.TextureSampler): void {
    this.sampler = sampler
    for (const binding of this.textureBindingNames) {
      this.applySampler(binding, sampler)
    }
  }

  protected applySampler(binding: string, sampler: BABYLON.TextureSampler): void {
    for (let passIndex = 0; passIndex < this.passCount; passIndex++) {
      this.applySamplerForPass(passIndex, binding, sampler)
    }
  }

  protected applySamplerForPass(passIndex: number, binding: string, sampler: BABYLON.TextureSampler): void {
    this.passHandles[passIndex].setTextureSampler(binding, sampler)
  }

  protected applyDefaultSamplers(): void {
    const sampler = this.sampler ?? this.defaultSampler
    for (const binding of this.textureBindingNames) {
      this.applySampler(binding, sampler)
    }
  }

  protected initializePassTextureSources(
    sources: readonly (readonly PassTextureSourceSpec<I>[])[] | undefined,
    passCount: number,
  ): RuntimePassTextureSource<I>[][] {
    if (sources && sources.length > 0) {
      return this.normalizePassTextureSources(sources, passCount)
    }
    return this.buildDefaultPassTextureSources(passCount)
  }

  protected normalizePassTextureSources(
    sources: readonly (readonly PassTextureSourceSpec<I>[])[],
    passCount: number,
  ): RuntimePassTextureSource<I>[][] {
    const normalized: RuntimePassTextureSource<I>[][] = []
    for (let passIndex = 0; passIndex < passCount; passIndex++) {
      const entries = sources[passIndex] ?? []
      const normalizedEntries: RuntimePassTextureSource<I>[] = []
      for (const entry of entries) {
        if (entry.source.kind === 'input') {
          const key = entry.source.key
          if (!this.inputTextureKeys.includes(key)) {
            throw new Error(`Invalid texture input key ${key} referenced by pass ${passIndex}.`)
          }
          normalizedEntries.push({ binding: entry.binding, kind: 'input', key })
        } else {
          const dependency = entry.source.passIndex
          if (dependency < 0 || dependency >= passIndex) {
            throw new Error(`Pass ${passIndex} can only depend on earlier passes. Received dependency on pass${dependency}.`)
          }
          normalizedEntries.push({ binding: entry.binding, kind: 'pass', passIndex: dependency })
        }
      }
      const seenBindings = new Set(normalizedEntries.map((entry) => entry.binding))
      for (const binding of this.textureBindingNames) {
        if (seenBindings.has(binding)) {
          continue
        }
        const candidateKey = binding as TextureInputKey<I>
        if (this.inputTextureKeys.includes(candidateKey)) {
          normalizedEntries.push({ binding, kind: 'input', key: candidateKey })
        }
      }
      normalized.push(normalizedEntries)
    }
    return normalized
  }

  protected buildDefaultPassTextureSources(passCount: number): RuntimePassTextureSource<I>[][] {
    const sources: RuntimePassTextureSource<I>[][] = []
    for (let passIndex = 0; passIndex < passCount; passIndex++) {
      const entries: RuntimePassTextureSource<I>[] = []
      for (const binding of this.textureBindingNames) {
        if (binding === this.primaryTextureKey && passIndex > 0) {
          entries.push({ binding, kind: 'pass', passIndex: passIndex - 1 })
          continue
        }
        const candidateKey = binding as TextureInputKey<I>
        if (this.inputTextureKeys.includes(candidateKey)) {
          entries.push({ binding, kind: 'input', key: candidateKey })
        }
      }
      sources.push(entries)
    }
    return sources
  }

  setSrcs(fx: Partial<I>): void {
    this.inputs = { ...this.inputs, ...fx }
    this.applyInitialSources()
  }

  protected applyInitialSources(): void {
    const resolved = this.resolveInputTextures()
    this.applySourcesToAllPasses(resolved)
  }

  setUniforms(uniforms: ShaderUniforms): void {
    for (const key in uniforms) {
      const value = uniforms[key]
      this.uniforms[key] = value
      this.updateRuntimeFromSetValue(key, value)
    }
  }

  updateUniforms(): void {
    const resolvedUniforms: Record<string, unknown> = {}
    for (const key in this.uniforms) {
      const resolved = extract(this.uniforms[key])
      resolvedUniforms[key] = resolved
      this.updateRuntimeFromResolvedValue(key, resolved)
    }
    const partial = resolvedUniforms as Partial<U>
    for (const handles of this.passHandles) {
      handles.setUniforms(partial)
    }
  }

  protected resolveInputTextures(): Partial<Record<TextureInputKey<I>, BABYLON.BaseTexture>> {
    const resolved: Partial<Record<TextureInputKey<I>, BABYLON.BaseTexture>> = {}
    for (const key of this.inputTextureKeys) {
      const source = this.inputs[key]
      if (!source) {
        continue
      }
      const texture = this.resolveSourceTexture(key, source)
      if (texture) {
        resolved[key] = texture
      }
    }
    return resolved
  }

  protected resolveSourceTexture(key: TextureInputKey<I>, source: ShaderSource): BABYLON.BaseTexture | undefined {
    const resolved = resolveTexture(this.engine, this.scene, source)
    if (resolved instanceof BABYLON.BaseTexture) {
      return resolved
    }
    if (resolved instanceof BABYLON.RenderTargetTexture) {
      return resolved
    }

    const imageSource = resolved as HTMLCanvasElement | OffscreenCanvas
    const width = imageSource.width as number
    const height = imageSource.height as number

    let entry = this.canvasTextures[key]
    if (!entry || entry.width !== width || entry.height !== height) {
      entry?.texture.dispose()
      const dynamicTexture = new BABYLON.DynamicTexture(
        `shaderFXCanvas_${String(key)}`,
        { width, height },
        this.scene,
        false,
        this.samplingMode,
      )
      dynamicTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE
      dynamicTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE
      dynamicTexture.updateSamplingMode(this.samplingMode)
      const ctx = dynamicTexture.getContext()
      entry = { texture: dynamicTexture, ctx, width, height }
      this.canvasTextures[key] = entry
    }

    const ctx = entry.ctx
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(imageSource, 0, 0, width, height)
    entry.texture.update(false)
    entry.width = width
    entry.height = height
    return entry.texture
  }

  protected applySourcesForPass(
    passIndex: number,
    resolvedTextures: Partial<Record<TextureInputKey<I>, BABYLON.BaseTexture>>,
    passOutputs: Array<BABYLON.RenderTargetTexture | undefined> = [],
    calledFromInputSet: boolean = false,
  ): void {
    const handles = this.passHandles[passIndex]
    const sampler = this.sampler ?? this.defaultSampler
    const bindings = this.passTextureSources[passIndex] ?? []
    if (!calledFromInputSet) {
      void 0
    }
    for (const binding of bindings) {
      let texture: BABYLON.BaseTexture | undefined
      if (binding.kind === 'input') {
        texture = resolvedTextures[binding.key]
      } else {
        const dependencyTexture = passOutputs[binding.passIndex]
        if (dependencyTexture) {
          texture = dependencyTexture
        }
      }
      if (!texture) {
        continue
      }
      handles.setTexture(binding.binding, texture)
      this.applySamplerForPass(passIndex, binding.binding, sampler)
    }
  }

  protected applySourcesToAllPasses(resolvedTextures: Partial<Record<TextureInputKey<I>, BABYLON.BaseTexture>>): void {
    const passOutputs: Array<BABYLON.RenderTargetTexture | undefined> = []
    for (let passIndex = 0; passIndex < this.passCount; passIndex++) {
      this.applySourcesForPass(passIndex, resolvedTextures, passOutputs, true)
    }
  }

  protected ensurePassTarget(passIndex: number): BABYLON.RenderTargetTexture {
    const target = this.passTargets[passIndex]
    if (target) {
      return target
    }
    const createdTarget = new BABYLON.RenderTargetTexture(
      `shaderFXPass${passIndex}`,
      { width: this.width, height: this.height },
      this.scene,
      false,
      true,
      this.textureType,
      false,
      this.samplingMode,
      false,
    )
    createdTarget.activeCamera = this.camera
    createdTarget.ignoreCameraViewport = true
    createdTarget.clearColor = new BABYLON.Color4(0, 0, 0, 0)
    createdTarget.renderList = [this.quad]
    this.passTargets[passIndex] = createdTarget
    return createdTarget
  }

  render(_engine: BABYLON.Engine): void {
    const resolvedInputs = this.resolveInputTextures()
    this.updateUniforms()

    const passOutputs: Array<BABYLON.RenderTargetTexture | undefined> = []

    for (let passIndex = 0; passIndex < this.passCount; passIndex++) {
      const isFinalPass = passIndex === this.passCount - 1
      const target = isFinalPass ? this.output : this.ensurePassTarget(passIndex)

      this.applySourcesForPass(passIndex, resolvedInputs, passOutputs)

      this.quad.material = this.passHandles[passIndex].material
      this.quad.isVisible = true
      try {
        target.render(false)
      } finally {
        this.quad.isVisible = false
      }

      passOutputs[passIndex] = target
    }
  }

  dispose(): void {
    this.output.dispose()
    this.passTargets.forEach((target) => {
      target?.dispose()
    })
    this.quad.dispose(false, false)
    this.camera.dispose()
    this.passHandles.forEach((handles) => {
      handles.material.dispose(true, false)
    })
    Object.values(this.canvasTextures).forEach((entry) => {
      entry?.texture.dispose()
    })
    this.scene.dispose()
  }
}

export interface CanvasPaintInputs {
  src: ShaderSource
}

export class CanvasPaint extends CustomShaderEffect<Record<string, never>, CanvasPaintInputs> {
  effectName = 'CanvasPaint'
  private targetCanvas?: HTMLCanvasElement

  constructor(
    engine: BABYLON.Engine,
    inputs: CanvasPaintInputs,
    width = 1280,
    height = 720,
    sampleMode: 'nearest' | 'linear' = 'linear',
    precision: RenderPrecision = 'half_float',
    targetCanvas?: HTMLCanvasElement,
  ) {
    super(engine, inputs, {
      factory: (sceneRef, options) => {
        const material = createCanvasPaintMaterial(sceneRef, options?.name ?? 'CanvasPaintMaterial')
        const textureState: Record<string, BABYLON.BaseTexture | null> = {}
        return {
          material,
          setTexture: (name, texture) => {
            material.setTexture(name, texture)
            textureState[name] = texture
          },
          setTextureSampler: (name, sampler) => {
            const texture = textureState[name] ?? null
            if (!texture) return
            const wrapU = sampler.wrapU
            if (wrapU !== null && wrapU !== undefined) {
              texture.wrapU = wrapU
            }
            const wrapV = sampler.wrapV
            if (wrapV !== null && wrapV !== undefined) {
              texture.wrapV = wrapV
            }
            const wrapR = sampler.wrapR
            if (wrapR !== null && wrapR !== undefined) {
              texture.wrapR = wrapR
            }
            texture.updateSamplingMode(sampler.samplingMode)
          },
          setUniforms: () => { },
        }
      },
      textureInputKeys: ['src'],
      width,
      height,
      materialName: 'CanvasPaintMaterial',
      sampleMode,
      precision,
    })
    this.targetCanvas = targetCanvas
  }

  override render(engine: BABYLON.Engine, _frameId?: string): void {
    const resolved = this.resolveInputTextures()
    this.applySourcesForPass(0, resolved)
    this.updateUniforms()

    const activeView = (engine as any).activeView
    if (activeView) {
      if (this.targetCanvas && activeView.target !== this.targetCanvas) {
        return
      }
    } else {
      engine.restoreDefaultFramebuffer()
    }

    this.quad.material = this.passHandles[0].material
    this.quad.isVisible = true
    try {
      this.scene.render(false)
    } finally {
      this.quad.isVisible = false
    }
  }
}

// Auto-generated by glsl fragment generator. DO NOT EDIT.
export const PassthruVertexSource = `// Auto-generated by glsl fragment generator. DO NOT EDIT.
#version 300 es
precision highp float;

in vec3 position;
in vec2 uv;
out vec2 vUV;

void main() {
  gl_Position = vec4(position, 1.0);
  vUV = uv;
}
`
export const PassthruFragmentSource = `// Auto-generated by glsl fragment generator. DO NOT EDIT.
#version 300 es
precision highp float;

in vec2 vUV;
out vec4 outColor;

uniform sampler2D src;

vec4 passthru(vec2 uv, sampler2D src) {
  return texture(src, uv);
}

void main() {
  vec4 color = passthru(vUV, src);
  outColor = color;
}
`

export type PassthruUniforms = Record<string, never>
export function setPassthruUniforms(_material: BABYLON.ShaderMaterial, _uniforms: Partial<PassthruUniforms>): void { }

export type PassthruTextureName = 'src'
export interface PassthruInputs {
  src: ShaderSource
}
export interface PassthruMaterialHandles {
  material: BABYLON.ShaderMaterial
  setTexture(name: PassthruTextureName, texture: BABYLON.BaseTexture): void
  setTextureSampler(name: PassthruTextureName, sampler: BABYLON.TextureSampler): void
  setUniforms(uniforms: Partial<PassthruUniforms>): void
}

export interface PassthruMaterialOptions {
  name?: string
}

export function createPassthruMaterial(scene: BABYLON.Scene, options: PassthruMaterialOptions = {}): PassthruMaterialHandles {
  const name = options.name ?? 'PassthruMaterial'
  const vertexShaderName = `${name}VertexShader`
  const fragmentShaderName = `${name}FragmentShader`

  BABYLON.ShaderStore.ShadersStore[vertexShaderName] = PassthruVertexSource
  BABYLON.ShaderStore.ShadersStore[fragmentShaderName] = PassthruFragmentSource

  const material = new BABYLON.ShaderMaterial(name, scene, {
    vertex: name,
    fragment: name,
  }, {
    attributes: ['position', 'uv'],
    uniforms: [],
    samplers: ['src'],
    shaderLanguage: BABYLON.ShaderLanguage.GLSL,
  })
  const textureState: Record<string, BABYLON.BaseTexture | null> = {}

  const handles: PassthruMaterialHandles = {
    material,
    setTexture: (textureName, texture) => {
      material.setTexture(textureName, texture)
      textureState[textureName] = texture
    },
    setTextureSampler: (textureName, sampler) => {
      const texture = textureState[textureName] ?? null
      if (!texture) return
      const wrapU = sampler.wrapU
      if (wrapU !== null && wrapU !== undefined) {
        texture.wrapU = wrapU
      }
      const wrapV = sampler.wrapV
      if (wrapV !== null && wrapV !== undefined) {
        texture.wrapV = wrapV
      }
      const wrapR = sampler.wrapR
      if (wrapR !== null && wrapR !== undefined) {
        texture.wrapR = wrapR
      }
      texture.updateSamplingMode(sampler.samplingMode)
    },
    setUniforms: () => { },
  }

  return handles
}

export class PassthruEffect extends CustomShaderEffect<PassthruUniforms, PassthruInputs> {
  effectName = 'Passthru'

  constructor(
    engine: BABYLON.Engine,
    inputs: PassthruInputs,
    width = 1280,
    height = 720,
    sampleMode: 'nearest' | 'linear' = 'linear',
    precision: RenderPrecision = 'half_float',
  ) {
    super(engine, inputs, {
      factory: (sceneRef, options) => createPassthruMaterial(sceneRef, options),
      textureInputKeys: ['src'],
      width,
      height,
      materialName: 'PassthruMaterial',
      sampleMode,
      precision,
    })
  }
}

interface FeedbackInputs {
  initialState: ShaderEffect
}

export class FeedbackNode extends ShaderEffect<FeedbackInputs> {
  output: BABYLON.RenderTargetTexture
  private readonly passthrough: PassthruEffect
  private readonly sampleMode: 'nearest' | 'linear'
  private firstRender = true
  private feedbackSrc?: ShaderEffect
  effectName = 'FeedbackNode'

  constructor(
    engine: BABYLON.Engine,
    startState: ShaderEffect,
    width = startState.width,
    height = startState.height,
    sampleMode: 'nearest' | 'linear' = 'linear',
    precision: RenderPrecision = 'half_float',
  ) {
    super()
    this.width = width
    this.height = height
    this.inputs = { initialState: startState }
    this.sampleMode = sampleMode
    this.passthrough = new PassthruEffect(engine, { src: startState.output }, width, height, sampleMode, precision)
    this.output = this.passthrough.output
  }

  setFeedbackSrc(effect: ShaderEffect): void {
    this.feedbackSrc = effect
  }

  setSrcs(inputs: Partial<FeedbackInputs>): void {
    if (!inputs.initialState) {
      return
    }
    this.inputs = { initialState: inputs.initialState }
    this.passthrough.setSrcs({ src: inputs.initialState.output })
    this.firstRender = true
  }

  setUniforms(_uniforms: ShaderUniforms): void { }

  updateUniforms(): void { }

  render(engine: BABYLON.Engine, _frameId?: string): void {
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
