/**
 * Letter Particles FX - GPU-accelerated particle cloud effect
 *
 * Renders visible pixels of a polygon's p5 graphics as an instanced particle cloud
 * that can lerp between the source image layout and procedural target layouts.
 */

import * as BABYLON from 'babylonjs'
import type { FxChainMeta } from './appState'

// Import generated shader helpers
import * as compactionShader from './letterParticles.compute.wgsl.generated'
import * as placementShader from './letterTargets.compute.wgsl.generated'

export type TargetLayout = 'ring' | 'spiral' | 'noise' | 'grid'

const TARGET_LAYOUT_MAP: Record<TargetLayout, number> = {
  ring: 0,
  spiral: 1,
  noise: 2,
  grid: 3,
}

export interface LetterParticlesConfig {
  engine: BABYLON.WebGPUEngine
  scene: BABYLON.Scene
  maxParticles: number
  canvasWidth: number
  canvasHeight: number
}

export interface LetterParticlesBbox {
  minX: number
  minY: number
  w: number
  h: number
}

export class LetterParticlesRenderer {
  private engine: BABYLON.WebGPUEngine
  private scene: BABYLON.Scene
  private maxParticles: number
  private canvasWidth: number
  private canvasHeight: number

  // Buffers
  private particlesBuffer!: BABYLON.StorageBuffer
  private counterBuffer!: BABYLON.StorageBuffer
  private instanceMatricesBuffer!: BABYLON.StorageBuffer
  private instanceColorsBuffer!: BABYLON.StorageBuffer

  // Uniform states
  private compactionSettingsState!: compactionShader.SettingsUniformState
  private placementSettingsState!: placementShader.SettingsUniformState

  // Compute shaders
  private compactionShaderState!: compactionShader.ShaderState
  private placementShaderState!: placementShader.ShaderState

  // Input texture (from p5.Graphics) - using RawTexture for compute shader compatibility
  private inputTexture!: BABYLON.RawTexture
  private textureData!: Uint8Array
  private tempCanvas!: HTMLCanvasElement
  private tempCtx!: CanvasRenderingContext2D

  // Instanced mesh
  private mesh!: BABYLON.Mesh
  private material!: BABYLON.StandardMaterial

  // Current texture dimensions
  private texWidth: number = 0
  private texHeight: number = 0

  // Initialization state
  private _initialized: boolean = false
  private _pendingTextureDispose: BABYLON.RawTexture | null = null

  constructor(config: LetterParticlesConfig) {
    this.engine = config.engine
    this.scene = config.scene
    this.maxParticles = config.maxParticles
    this.canvasWidth = config.canvasWidth
    this.canvasHeight = config.canvasHeight
  }

  async initialize(): Promise<void> {
    this.createBuffers()
    this.createMesh()
    await this.createComputeShaders()
    this.setupVertexBuffers()
    this._initialized = true
  }

  get initialized(): boolean {
    return this._initialized
  }

  private createBuffers(): void {
    const PARTICLE_SIZE = 32 // 2 floats uv + 2 floats pad + 4 floats color = 8 floats = 32 bytes

    // Particles buffer (output of compaction, input to placement)
    this.particlesBuffer = new BABYLON.StorageBuffer(
      this.engine,
      PARTICLE_SIZE * this.maxParticles,
      BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE | BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE
    )

    // Counter buffer (atomic u32)
    this.counterBuffer = new BABYLON.StorageBuffer(
      this.engine,
      4, // Single u32
      BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE |
        BABYLON.Constants.BUFFER_CREATIONFLAG_READ
    )

    // Instance matrices buffer (4 x vec4 per instance = 64 bytes)
    this.instanceMatricesBuffer = new BABYLON.StorageBuffer(
      this.engine,
      64 * this.maxParticles,
      BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
        BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE
    )

    // Instance colors buffer (vec4 per instance = 16 bytes)
    this.instanceColorsBuffer = new BABYLON.StorageBuffer(
      this.engine,
      16 * this.maxParticles,
      BABYLON.Constants.BUFFER_CREATIONFLAG_VERTEX |
        BABYLON.Constants.BUFFER_CREATIONFLAG_STORAGE |
        BABYLON.Constants.BUFFER_CREATIONFLAG_WRITE
    )

    // Create uniform buffer states
    this.compactionSettingsState = compactionShader.createUniformBuffer_settings(this.engine, {
      alphaThreshold: 0.01,
      maxParticles: this.maxParticles,
      texWidth: 1,
      texHeight: 1,
    })

    this.placementSettingsState = placementShader.createUniformBuffer_settings(this.engine, {
      lerpT: 0,
      bboxOriginX: 0,
      bboxOriginY: 0,
      bboxWidth: 1,
      bboxHeight: 1,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      targetRadius: 0.3,
      circleRadius: 0.01,
      maxParticles: this.maxParticles,
      liveCount: 0,
      targetLayout: 0,
      seed: 0,
      bboxCenterNdcX: 0,
      bboxCenterNdcY: 0,
      padding: 0,
    })
  }

  private createMesh(): void {
    // Create a simple disc mesh for particle rendering
    this.mesh = BABYLON.MeshBuilder.CreateDisc(
      'letterParticleDisc',
      { radius: 1, tessellation: 12 },
      this.scene
    )

    // Create material - vertex colors are automatically used when present
    this.material = new BABYLON.StandardMaterial('letterParticleMat', this.scene)
    this.material.disableLighting = true
    this.material.backFaceCulling = false
    this.material.diffuseColor = new BABYLON.Color3(1, 1, 1)
    this.material.emissiveColor = new BABYLON.Color3(1, 1, 1)
    this.material.alphaMode = BABYLON.Engine.ALPHA_COMBINE
    this.material.disableDepthWrite = true
    this.mesh.material = this.material

    // Set up thin instancing
    this.mesh.thinInstanceSetBuffer('matrix', null, 16)
    this.mesh.thinInstanceCount = this.maxParticles
    this.mesh.forcedInstanceCount = this.maxParticles
    this.mesh.manualUpdateOfWorldMatrixInstancedBuffer = true
    this.mesh.renderingGroupId = 1
  }

  private async createComputeShaders(): Promise<void> {
    // Create temp canvas for reading pixel data
    this.tempCanvas = document.createElement('canvas')
    this.tempCanvas.width = 1
    this.tempCanvas.height = 1
    this.tempCtx = this.tempCanvas.getContext('2d', { willReadFrequently: true })!

    // Create a placeholder texture (will be replaced when updateTexture is called)
    this.textureData = new Uint8Array(4) // 1x1 RGBA
    this.inputTexture = new BABYLON.RawTexture(
      this.textureData,
      1, // width
      1, // height
      BABYLON.Constants.TEXTUREFORMAT_RGBA,
      this.scene,
      false, // no mipmaps
      false, // not invertY
      BABYLON.Texture.NEAREST_NEAREST // nearest sampling for exact texel reads
    )

    // Create compaction shader
    this.compactionShaderState = compactionShader.createShader(this.engine, {
      inputTex: this.inputTexture,
      particles: this.particlesBuffer,
      counter: this.counterBuffer,
      settings: this.compactionSettingsState,
    })

    // Create placement shader
    this.placementShaderState = placementShader.createShader(this.engine, {
      particles: this.particlesBuffer,
      settings: this.placementSettingsState,
      instanceMatrices: this.instanceMatricesBuffer,
      instanceColors: this.instanceColorsBuffer,
    })

    // Wait for shaders to be ready
    while (!this.compactionShaderState.shader.isReady() || !this.placementShaderState.shader.isReady()) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  private setupVertexBuffers(): void {
    const strideFloats = 16 // 4 vec4 = 16 floats per instance
    const vsize = 4

    // Create vertex buffers for world matrix (world0-world3)
    const world0 = new BABYLON.VertexBuffer(
      this.engine,
      this.instanceMatricesBuffer.getBuffer(),
      'world0',
      false,
      false,
      strideFloats,
      true,
      0,
      vsize
    )
    const world1 = new BABYLON.VertexBuffer(
      this.engine,
      this.instanceMatricesBuffer.getBuffer(),
      'world1',
      false,
      false,
      strideFloats,
      true,
      4,
      vsize
    )
    const world2 = new BABYLON.VertexBuffer(
      this.engine,
      this.instanceMatricesBuffer.getBuffer(),
      'world2',
      false,
      false,
      strideFloats,
      true,
      8,
      vsize
    )
    const world3 = new BABYLON.VertexBuffer(
      this.engine,
      this.instanceMatricesBuffer.getBuffer(),
      'world3',
      false,
      false,
      strideFloats,
      true,
      12,
      vsize
    )

    this.mesh.setVerticesBuffer(world0)
    this.mesh.setVerticesBuffer(world1)
    this.mesh.setVerticesBuffer(world2)
    this.mesh.setVerticesBuffer(world3)

    // Create vertex buffer for instance colors
    const colorBuffer = new BABYLON.VertexBuffer(
      this.engine,
      this.instanceColorsBuffer.getBuffer(),
      BABYLON.VertexBuffer.ColorKind,
      false,
      false,
      4, // stride: 4 floats per color
      true, // instanced
      0,
      4 // size: 4 floats (rgba)
    )
    this.mesh.setVerticesBuffer(colorBuffer)
  }

  /**
   * Update the input texture from a canvas element (p5.Graphics.elt)
   */
  updateTexture(canvas: HTMLCanvasElement): void {
    if (!this._initialized) return

    const width = canvas.width
    const height = canvas.height

    // Recreate texture if dimensions changed
    if (width !== this.texWidth || height !== this.texHeight) {
      // Defer disposal of old texture to avoid "destroyed texture" errors
      if (this.inputTexture) {
        this._pendingTextureDispose = this.inputTexture
      }

      // Resize temp canvas and allocate new texture data
      this.tempCanvas.width = width
      this.tempCanvas.height = height
      this.textureData = new Uint8Array(width * height * 4)

      this.inputTexture = new BABYLON.RawTexture(
        this.textureData,
        width,
        height,
        BABYLON.Constants.TEXTUREFORMAT_RGBA,
        this.scene,
        false, // no mipmaps
        false, // not invertY
        BABYLON.Texture.NEAREST_NEAREST
      )
      this.texWidth = width
      this.texHeight = height

      // Update compaction shader binding
      compactionShader.updateBindings(this.compactionShaderState, {
        inputTex: this.inputTexture,
      })
    }

    // Copy canvas content to temp canvas, then read pixel data
    this.tempCtx.clearRect(0, 0, width, height)
    this.tempCtx.drawImage(canvas, 0, 0)
    const imageData = this.tempCtx.getImageData(0, 0, width, height)
    this.textureData.set(imageData.data)

    // Debug: count non-transparent pixels (log occasionally)
    if (Math.random() < 0.01) {
      let nonTransparent = 0
      for (let i = 3; i < this.textureData.length; i += 4) {
        if (this.textureData[i] > 0) nonTransparent++
      }
      console.log(`[letterParticles] texture ${width}x${height}, non-transparent pixels: ${nonTransparent}`)
    }

    // Upload to GPU
    this.inputTexture.update(this.textureData)
  }

  /**
   * Dispatch compute shaders and update instance data.
   * This is a synchronous operation that queues GPU commands - the actual
   * GPU work happens asynchronously but we don't await it to avoid
   * blocking the render loop.
   */
  dispatch(
    bbox: LetterParticlesBbox,
    fx: FxChainMeta
  ): void {
    if (!this._initialized) {
      console.log('[letterParticles] dispatch skipped: not initialized')
      return
    }
    if (this.texWidth === 0 || this.texHeight === 0) {
      console.log('[letterParticles] dispatch skipped: texWidth/Height is 0')
      return
    }

    // Debug logging (remove after debugging)
    if (Math.random() < 0.01) { // Log ~1% of frames
      console.log('[letterParticles] dispatch:', {
        texSize: `${this.texWidth}x${this.texHeight}`,
        maxParticles: this.maxParticles,
        bbox,
        circleRadius: fx.circleRadius,
        lerpT: fx.lerpT,
      })
    }

    // Dispose any pending texture from previous frame (safe now that GPU has processed it)
    if (this._pendingTextureDispose) {
      this._pendingTextureDispose.dispose()
      this._pendingTextureDispose = null
    }

    // Reset counter (manual reset as per plan TODO - move atomics stuff to generateShaderTypes.ts)
    this.counterBuffer.update(new Uint32Array([0]))

    // Update compaction settings
    compactionShader.updateUniformBuffer_settings(this.compactionSettingsState, {
      alphaThreshold: fx.alphaThreshold,
      maxParticles: this.maxParticles,
      texWidth: this.texWidth,
      texHeight: this.texHeight,
    })

    // Dispatch compaction shader (fire and forget - GPU commands are queued)
    const xGroups = Math.ceil(this.texWidth / 8)
    const yGroups = Math.ceil(this.texHeight / 8)
    this.compactionShaderState.shader.dispatchWhenReady(xGroups, yGroups, 1)

    // Calculate bbox center in NDC
    const centerX = bbox.minX + bbox.w / 2
    const centerY = bbox.minY + bbox.h / 2
    const bboxCenterNdcX = (centerX / this.canvasWidth) * 2 - 1
    const bboxCenterNdcY = 1 - (centerY / this.canvasHeight) * 2

    // Update placement settings
    // Note: We use maxParticles for liveCount since we can't synchronously read the counter.
    // The placement shader will handle inactive particles by moving them offscreen.
    placementShader.updateUniformBuffer_settings(this.placementSettingsState, {
      lerpT: fx.lerpT,
      bboxOriginX: bbox.minX,
      bboxOriginY: bbox.minY,
      bboxWidth: bbox.w,
      bboxHeight: bbox.h,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      targetRadius: fx.targetRadius,
      circleRadius: fx.circleRadius,
      maxParticles: this.maxParticles,
      liveCount: this.maxParticles, // Use maxParticles; shader culls inactive
      targetLayout: TARGET_LAYOUT_MAP[fx.targetLayout],
      seed: fx.seed,
      bboxCenterNdcX,
      bboxCenterNdcY,
      padding: 0,
    })

    // Dispatch placement shader (fire and forget)
    const placementGroups = Math.ceil(this.maxParticles / 64)
    this.placementShaderState.shader.dispatchWhenReady(placementGroups, 1, 1)
  }

  /**
   * Set mesh visibility
   */
  setEnabled(enabled: boolean): void {
    this.mesh.setEnabled(enabled)
  }

  /**
   * Get the mesh for external manipulation if needed
   */
  getMesh(): BABYLON.Mesh {
    return this.mesh
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this._initialized = false
    this.mesh?.dispose(false, true)
    this.material?.dispose(false, true)
    this.inputTexture?.dispose()
    this._pendingTextureDispose?.dispose()
    this._pendingTextureDispose = null
    this.particlesBuffer?.dispose()
    this.counterBuffer?.dispose()
    this.instanceMatricesBuffer?.dispose()
    this.instanceColorsBuffer?.dispose()
    this.compactionSettingsState?.buffer?.dispose()
    this.placementSettingsState?.buffer?.dispose()
  }
}
