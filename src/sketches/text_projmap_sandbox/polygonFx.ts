import * as BABYLON from 'babylonjs'
import { bboxOfPoints, getFxMeta } from './textRegionUtils'
import type { PolygonRenderData } from '@/canvas/canvasState'
import type { FxChainMeta } from './appState'
import { InputCropEffect } from '@/rendering/postFX/inputCrop.frag.generated'
import { WobbleEffect } from '@/rendering/postFX/wobble.frag.generated'
import { HorizontalBlurEffect } from '@/rendering/postFX/horizontalBlur.frag.generated'
import { VerticalBlurEffect } from '@/rendering/postFX/verticalBlur.frag.generated'
import type { ShaderEffect } from '@/rendering/shaderFXBabylon'

export type PolygonFxSyncOptions = {
  engine: BABYLON.WebGPUEngine
  p5Canvas: HTMLCanvasElement
  src: ShaderEffect
  dpr: number
}

type ChainBundle = {
  end: ShaderEffect
  width: number
  height: number
  bboxKey: string
  fxKey: string
}

type MeshBundle = {
  mesh: BABYLON.Mesh
  material: BABYLON.StandardMaterial
}

const chains = new Map<string, ChainBundle>()
const meshes = new Map<string, MeshBundle>()
let overlayScene: BABYLON.Scene | undefined

const ensureOverlayScene = (engine: BABYLON.WebGPUEngine) => {
  if (overlayScene) return overlayScene
  overlayScene = new BABYLON.Scene(engine)
  overlayScene.autoClear = false
  overlayScene.clearColor = new BABYLON.Color4(0, 0, 0, 0)
  overlayScene.autoClearDepthAndStencil = false
  overlayScene.skipFrustumClipping = true

  const cam = new BABYLON.FreeCamera('polyFxCam', new BABYLON.Vector3(0, 0, -1), overlayScene)
  cam.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA
  cam.orthoLeft = -1
  cam.orthoRight = 1
  cam.orthoTop = 1
  cam.orthoBottom = -1
  cam.minZ = 0
  cam.maxZ = 1
  cam.setEnabled(true)
  overlayScene.activeCamera = cam
  return overlayScene
}

const makeKeys = (bbox: { w: number; h: number }, fx: FxChainMeta) => ({
  bboxKey: `${bbox.w.toFixed(1)}x${bbox.h.toFixed(1)}`,
  fxKey: JSON.stringify({ ...fx }),
})

const createChain = (
  engine: BABYLON.WebGPUEngine,
  p5Canvas: HTMLCanvasElement,
  srcEffect: ShaderEffect,
  bboxPx: { minX: number; minY: number; w: number; h: number },
  fx: FxChainMeta,
): ChainBundle | null => {
  const w = Math.max(1, Math.round(bboxPx.w))
  const h = Math.max(1, Math.round(bboxPx.h))
  if (w < 1 || h < 1) return null

  const crop = new InputCropEffect(engine, { src: srcEffect }, w, h)
  const wobble = new WobbleEffect(engine, { src: crop }, w, h)
  const hBlur = new HorizontalBlurEffect(engine, { src: wobble }, w, h)
  const vBlur = new VerticalBlurEffect(engine, { src: hBlur }, w, h)

  crop.setUniforms({
    origin: [bboxPx.minX / p5Canvas.width, bboxPx.minY / p5Canvas.height],
    size: [bboxPx.w / p5Canvas.width, bboxPx.h / p5Canvas.height],
  })

  wobble.setUniforms({
    xStrength: fx.wobbleX,
    yStrength: fx.wobbleY,
    time: () => performance.now() / 1000,
  })

  hBlur.setUniforms({ pixels: fx.blurX, resolution: w })
  vBlur.setUniforms({ pixels: fx.blurY, resolution: h })

  const { bboxKey, fxKey } = makeKeys({ w, h }, fx)
  return { end: vBlur, width: w, height: h, bboxKey, fxKey }
}

const createOrUpdateMesh = (
  id: string,
  engine: BABYLON.WebGPUEngine,
  chain: ChainBundle,
  bboxPx: { minX: number; minY: number; w: number; h: number },
  canvasSize: { width: number; height: number },
) => {
  const scene = ensureOverlayScene(engine)
  const centerX = bboxPx.minX + bboxPx.w / 2
  const centerY = bboxPx.minY + bboxPx.h / 2
  const posX = (centerX / canvasSize.width) * 2 - 1
  const posY = 1 - (centerY / canvasSize.height) * 2
  const scaleX = bboxPx.w / canvasSize.width
  const scaleY = bboxPx.h / canvasSize.height

  let bundle = meshes.get(id)
  if (!bundle) {
    const mesh = BABYLON.MeshBuilder.CreatePlane(`polyFx-${id}`, { size: 2 }, scene)
    const material = new BABYLON.StandardMaterial(`polyFxMat-${id}`, scene)
    material.disableLighting = true
    material.backFaceCulling = false
    material.emissiveColor = new BABYLON.Color3(1, 1, 1)
    material.alphaMode = BABYLON.Engine.ALPHA_COMBINE
    material.disableDepthWrite = true
    material.useAlphaFromDiffuseTexture = true
    material.alpha = 1
    mesh.material = material
    bundle = { mesh, material }
    meshes.set(id, bundle)
  }
  bundle.mesh.position.set(posX, posY, 0)
  bundle.mesh.scaling.set(scaleX, scaleY, 1)
  bundle.material.diffuseTexture = chain.end.output
  bundle.material.emissiveTexture = chain.end.output
  bundle.material.opacityTexture = null
  bundle.mesh.renderingGroupId = 1
}

const disposeEntry = (id: string) => {
  const chain = chains.get(id)
  if (chain) {
    chain.end.disposeAll()
    chains.delete(id)
  }
  const mesh = meshes.get(id)
  if (mesh) {
    mesh.mesh.dispose(false, true)
    mesh.material.dispose(false, true)
    meshes.delete(id)
  }
}

export const syncChainsAndMeshes = (
  payload: { current: PolygonRenderData; added?: PolygonRenderData; deleted?: PolygonRenderData; changed?: PolygonRenderData },
  opts: PolygonFxSyncOptions,
) => {
  const { engine, p5Canvas, dpr, src } = opts
  ensureOverlayScene(engine)

  const currentIds = new Set(payload.current.map((p) => p.id))
  const deletedIds = new Set(payload.deleted?.map((p) => p.id) ?? [])

  // Remove deleted or missing
  Array.from(chains.keys()).forEach((id) => {
    if (!currentIds.has(id) || deletedIds.has(id)) {
      disposeEntry(id)
    }
  })

  const processPoly = (poly: PolygonRenderData[number], forceRecreate: boolean) => {
    const fx = getFxMeta(poly.metadata)
    if (!fx.enabled) {
      disposeEntry(poly.id)
      return
    }
    const bbox = bboxOfPoints(poly.points)
    const pad = fx.pad
    const minX = bbox.minX - pad
    const minY = bbox.minY - pad
    const maxX = bbox.maxX + pad
    const maxY = bbox.maxY + pad
    const canvasW = p5Canvas.width
    const canvasH = p5Canvas.height
    const rawMinX = minX * dpr
    const rawMinY = minY * dpr
    const rawMaxX = maxX * dpr
    const rawMaxY = maxY * dpr
    const clampedMinX = Math.max(0, rawMinX)
    const clampedMinY = Math.max(0, rawMinY)
    const clampedMaxX = Math.min(canvasW, rawMaxX)
    const clampedMaxY = Math.min(canvasH, rawMaxY)
    const bboxPx = {
      minX: clampedMinX,
      minY: clampedMinY,
      w: Math.max(1, clampedMaxX - clampedMinX),
      h: Math.max(1, clampedMaxY - clampedMinY),
    }

    const keys = makeKeys({ w: bboxPx.w, h: bboxPx.h }, fx)
    const prev = chains.get(poly.id)
    const needsRecreate =
      forceRecreate || !prev || prev.bboxKey !== keys.bboxKey || prev.fxKey !== keys.fxKey

    if (needsRecreate) {
      disposeEntry(poly.id)
      const chain = createChain(engine, p5Canvas, src, bboxPx, fx)
      if (!chain) return
      chains.set(poly.id, chain)
      createOrUpdateMesh(poly.id, engine, chain, bboxPx, { width: p5Canvas.width, height: p5Canvas.height })
    } else if (prev) {
      // Only update position if needed
      createOrUpdateMesh(poly.id, engine, prev, bboxPx, { width: p5Canvas.width, height: p5Canvas.height })
    }
  }

  ;(payload.added ?? []).forEach((poly) => processPoly(poly, true))
  ;(payload.changed ?? []).forEach((poly) => processPoly(poly, true))
  payload.current.forEach((poly) => processPoly(poly, false))
}

export const renderPolygonFx = (engine: BABYLON.Engine) => {
  chains.forEach((chain) => {
    chain.end.renderAll(engine)
  })
  if (overlayScene) {
    overlayScene.render()
  }
}

export const disposePolygonFx = () => {
  Array.from(chains.keys()).forEach((id) => disposeEntry(id))
  overlayScene?.dispose()
  overlayScene = undefined
  meshes.clear()
}
