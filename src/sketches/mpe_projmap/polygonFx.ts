import * as BABYLON from 'babylonjs'
import { bboxOfPoints, getFxMeta } from './textRegionUtils'
import type { PolygonRenderData } from '@/canvas/canvasState'
import type { FxChainMeta } from './appState'
import { PassthruEffect } from '@/rendering/shaderFXBabylon'
import { WobbleEffect } from '@/rendering/postFX/wobble.frag.generated'
import { HorizontalBlurEffect } from '@/rendering/postFX/horizontalBlur.frag.generated'
import { VerticalBlurEffect } from '@/rendering/postFX/verticalBlur.frag.generated'
import { AlphaThresholdEffect } from '@/rendering/postFX/alphaThreshold.frag.generated'
import type { ShaderEffect } from '@/rendering/shaderFXBabylon'
import type { RenderState } from './textRegionUtils'
import { getTextStyle, getTextAnim } from './textRegionUtils'
import type p5 from 'p5'
import { LetterParticlesRenderer } from './letterParticles'

export type PolygonFxSyncOptions = {
  engine: BABYLON.WebGPUEngine
  p5Canvas: HTMLCanvasElement
  dpr: number
  renderStates: Map<string, RenderState>
  mainP5: p5
}

type ChainBundle = {
  end: ShaderEffect
  wobble: WobbleEffect
  hBlur: HorizontalBlurEffect
  vBlur: VerticalBlurEffect
  width: number
  height: number
  fxKey: string
  owned: ShaderEffect[]
  graphics: p5.Graphics
  bboxPx: { minX: number; minY: number; w: number; h: number }
  bboxLogical: { minX: number; minY: number; w: number; h: number }
  poly: PolygonRenderData[number]
}

type MeshBundle = {
  mesh: BABYLON.Mesh
  material: BABYLON.StandardMaterial
}

type LetterParticlesBundle = {
  renderer: LetterParticlesRenderer
  width: number
  height: number
  graphics: p5.Graphics
  bboxPx: { minX: number; minY: number; w: number; h: number }
  bboxLogical: { minX: number; minY: number; w: number; h: number }
  poly: PolygonRenderData[number]
  fx: FxChainMeta
}

const chains = new Map<string, ChainBundle>()
const meshes = new Map<string, MeshBundle>()
const letterParticlesRenderers = new Map<string, LetterParticlesBundle>()
let overlayScene: BABYLON.Scene | undefined

const ensureOverlayScene = (engine: BABYLON.WebGPUEngine) => {
  if (overlayScene) return overlayScene
  overlayScene = new BABYLON.Scene(engine)
  overlayScene.autoClear = false
  overlayScene.clearColor = new BABYLON.Color4(0, 0, 0, 0)
  // Keep color buffer intact (autoClear=false) but reset depth/stencil each frame to avoid stale masking
  overlayScene.autoClearDepthAndStencil = true
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

const makeKeys = (bbox: { minX: number; minY: number; w: number; h: number }, fx: FxChainMeta) => ({
  sizeKey: `${bbox.w.toFixed(1)}x${bbox.h.toFixed(1)}`,
  fxKey: JSON.stringify({ ...fx }),
})

const createChain = (
  engine: BABYLON.WebGPUEngine,
  p5Canvas: HTMLCanvasElement,
  graphics: p5.Graphics,
  bboxPx: { minX: number; minY: number; w: number; h: number },
  bboxLogical: { minX: number; minY: number; w: number; h: number },
  poly: PolygonRenderData[number],
  fx: FxChainMeta,
): ChainBundle | null => {
  const w = Math.max(1, Math.round(bboxPx.w))
  const h = Math.max(1, Math.round(bboxPx.h))
  if (w < 1 || h < 1) return null

  const srcPass = new PassthruEffect(engine, { src: graphics.elt as HTMLCanvasElement }, w, h)
  const wobble = new WobbleEffect(engine, { src: srcPass }, w, h)
  const hBlur = new HorizontalBlurEffect(engine, { src: wobble }, w, h)
  const vBlur = new VerticalBlurEffect(engine, { src: hBlur }, w, h)
  const alphaThresh = new AlphaThresholdEffect(engine, { src: vBlur }, w, h)

  wobble.setUniforms({
    xStrength: fx.wobbleX,
    yStrength: fx.wobbleY,
    time: () => performance.now() / 1000,
  })

  hBlur.setUniforms({ pixels: fx.blurX, resolution: w })
  vBlur.setUniforms({ pixels: fx.blurY, resolution: h })
  alphaThresh.setUniforms({ threshold: 0 })

  const { fxKey } = makeKeys({ minX: bboxPx.minX, minY: bboxPx.minY, w, h }, fx)
  return {
    end: alphaThresh,
    wobble,
    hBlur,
    vBlur,
    width: w,
    height: h,
    fxKey,
    owned: [alphaThresh, vBlur, hBlur, wobble, srcPass],
    graphics,
    bboxPx,
    bboxLogical,
    poly,
  }
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
  bundle.material.diffuseTexture.hasAlpha = true
  bundle.material.emissiveTexture = null //chain.end.output
  bundle.material.opacityTexture = null
  bundle.mesh.renderingGroupId = 1
}

const disposeEntry = (id: string) => {
  const chain = chains.get(id)
  if (chain) {
    // Dispose only the per-polygon nodes, not shared sources
    chain.owned.forEach((fx) => fx.dispose())
    chain.graphics.remove()
    chains.delete(id)
  }
  const mesh = meshes.get(id)
  if (mesh) {
    mesh.mesh.dispose(false, true)
    mesh.material.dispose(false, true)
    meshes.delete(id)
  }
  const lpBundle = letterParticlesRenderers.get(id)
  if (lpBundle) {
    lpBundle.renderer.dispose()
    lpBundle.graphics.remove()
    letterParticlesRenderers.delete(id)
  }
}

const redrawGraphics = (g: p5.Graphics, poly: PolygonRenderData[number], bboxLogical: { minX: number; minY: number }, renderState?: RenderState) => {
  const p = g as unknown as p5
  g.clear()

  const textStyle = getTextStyle(poly.metadata)
  const textColor = textStyle.textColor
  const to255 = (c: number) => (c <= 1 ? c * 255 : c)
  const color = {
    r: to255(textColor.r),
    g: to255(textColor.g),
    b: to255(textColor.b),
    a: 255
  }
  const textSize = textStyle.textSize
  const fontFamily = textStyle.fontFamily
  const fontStyle = textStyle.fontStyle
  const textAnim = getTextAnim(poly.metadata)
  const fillAnim = textAnim.fillAnim
  const isDropAndScroll = fillAnim === 'dropAndScroll'
  const isMatterExplode = fillAnim === 'matterExplode'

  g.push()
  g.translate(-bboxLogical.minX, -bboxLogical.minY)

  if (isDropAndScroll || isMatterExplode) {
    g.noStroke()
    g.fill(color.r, color.g, color.b, color.a)
    g.textFont(fontFamily)
    g.textSize(textSize)
    if (fontStyle === 'NORMAL') g.textStyle(p.NORMAL)
    else if (fontStyle === 'ITALIC') g.textStyle(p.ITALIC)
    else if (fontStyle === 'BOLD') g.textStyle(p.BOLD)
    else if (fontStyle === 'BOLDITALIC') g.textStyle(p.BOLDITALIC)

    if (renderState && renderState.letters.length > 0 && renderState.text.length > 0) {
      renderState.letters.forEach(({ pos, idx }) => {
        const char = renderState.text[(idx + renderState.textOffset) % renderState.text.length]
        g.text(char, pos.x, pos.y)
      })
    } else {
      g.push()
      g.noFill()
      g.stroke(color.r, color.g, color.b, color.a)
      g.beginShape()
      poly.points.forEach((point) => {
        g.vertex(point.x, point.y)
      })
      g.endShape(p.CLOSE)
      g.pop()
    }
  } else {
    g.fill(color.r, color.g, color.b, color.a)
    g.noStroke()
    g.beginShape()
    poly.points.forEach((point) => {
      g.vertex(point.x, point.y)
    })
    g.endShape()
  }

  g.pop()
}

export const syncChainsAndMeshes = (
  payload: { current: PolygonRenderData; added?: PolygonRenderData; deleted?: PolygonRenderData; changed?: PolygonRenderData },
  opts: PolygonFxSyncOptions,
) => {
  const { engine, p5Canvas, dpr, renderStates } = opts
  ensureOverlayScene(engine)

  const currentIds = new Set(payload.current.map((p) => p.id))
  const deletedIds = new Set(payload.deleted?.map((p) => p.id) ?? [])

  // Remove deleted or missing from both chains and letterParticles
  Array.from(chains.keys()).forEach((id) => {
    if (!currentIds.has(id) || deletedIds.has(id)) {
      disposeEntry(id)
    }
  })
  Array.from(letterParticlesRenderers.keys()).forEach((id) => {
    if (!currentIds.has(id) || deletedIds.has(id)) {
      disposeEntry(id)
    }
  })

  const processPoly = (poly: PolygonRenderData[number]) => {
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
    const bboxLogical = {
      minX,
      minY,
      w: maxX - minX,
      h: maxY - minY,
    }
    const canvasLogical = { width: p5Canvas.width / dpr, height: p5Canvas.height / dpr }
    const targetWidth = Math.max(1, Math.round(bboxPx.w))
    const targetHeight = Math.max(1, Math.round(bboxPx.h))

    // Branch based on chain type
    if (fx.chain === 'letterParticles') {
      // Handle letterParticles mode
      const prevLP = letterParticlesRenderers.get(poly.id)
      const needsRecreate = !prevLP || prevLP.width !== targetWidth || prevLP.height !== targetHeight

      if (needsRecreate) {
        disposeEntry(poly.id)
        const scene = ensureOverlayScene(engine)
        const graphics = opts.mainP5.createGraphics(Math.max(1, Math.round(bboxLogical.w)), Math.max(1, Math.round(bboxLogical.h))) as p5.Graphics
        graphics.pixelDensity(dpr)

        // Calculate maxParticles based on bbox size and scale
        const maxParticles = Math.min(
          Math.round(targetWidth * targetHeight * fx.maxParticlesScale),
          100000 // Hard cap to prevent memory issues
        )

        const renderer = new LetterParticlesRenderer({
          engine,
          scene,
          maxParticles,
          canvasWidth: canvasW,
          canvasHeight: canvasH,
        })

        // Initialize asynchronously - store pending initialization
        renderer.initialize().then(() => {
          const bundle = letterParticlesRenderers.get(poly.id)
          if (bundle) {
            // Initial draw and texture update
            const rs = renderStates.get(poly.id)
            redrawGraphics(bundle.graphics, bundle.poly, bundle.bboxLogical, rs)
            bundle.renderer.updateTexture(bundle.graphics.elt as HTMLCanvasElement)
          }
        })

        const rs = renderStates.get(poly.id)
        redrawGraphics(graphics, poly, bboxLogical, rs)

        letterParticlesRenderers.set(poly.id, {
          renderer,
          width: targetWidth,
          height: targetHeight,
          graphics,
          bboxPx,
          bboxLogical,
          poly,
          fx,
        })
      } else if (prevLP) {
        // Update existing letterParticles renderer
        prevLP.bboxLogical = bboxLogical
        prevLP.bboxPx = bboxPx
        prevLP.poly = poly
        prevLP.fx = fx
        const rs = renderStates.get(poly.id)
        redrawGraphics(prevLP.graphics, poly, bboxLogical, rs)
      }
    } else {
      // Handle basicBlur mode (existing behavior)
      const { fxKey } = makeKeys({ minX: bboxPx.minX, minY: bboxPx.minY, w: bboxPx.w, h: bboxPx.h }, fx)
      const prev = chains.get(poly.id)
      const needsRecreate = !prev || prev.width !== targetWidth || prev.height !== targetHeight

      if (needsRecreate) {
        disposeEntry(poly.id)
        const graphics = opts.mainP5.createGraphics(Math.max(1, Math.round(bboxLogical.w)), Math.max(1, Math.round(bboxLogical.h))) as p5.Graphics
        graphics.pixelDensity(dpr)
        const chain = createChain(engine, p5Canvas, graphics, bboxPx, bboxLogical, poly, fx)
        if (!chain) {
          graphics.remove()
          return
        }
        const rs = renderStates.get(poly.id)
        redrawGraphics(graphics, poly, bboxLogical, rs)
        chain.bboxLogical = bboxLogical
        chain.bboxPx = bboxPx
        chain.poly = poly
        chain.fxKey = fxKey
        chains.set(poly.id, chain)
        createOrUpdateMesh(poly.id, engine, chain, bboxLogical, canvasLogical)
      } else if (prev) {
        // Reuse existing chain when only position/metadata changed
        const fxChanged = prev.fxKey !== fxKey
        if (fxChanged) {
          prev.wobble.setUniforms({
            xStrength: fx.wobbleX,
            yStrength: fx.wobbleY,
            time: () => performance.now() / 1000,
          })
          prev.hBlur.setUniforms({ pixels: fx.blurX, resolution: prev.width })
          prev.vBlur.setUniforms({ pixels: fx.blurY, resolution: prev.height })
          prev.fxKey = fxKey
        }

        prev.bboxLogical = bboxLogical
        prev.bboxPx = bboxPx
        prev.poly = poly
        const rs = renderStates.get(poly.id)
        redrawGraphics(prev.graphics, poly, bboxLogical, rs)
        createOrUpdateMesh(poly.id, engine, prev, bboxLogical, canvasLogical)
      }
    }
  }

  (payload.added ?? []).forEach((poly) => processPoly(poly));
    
  (payload.changed ?? []).forEach((poly) => processPoly(poly));
  
  payload.current.forEach((poly) => processPoly(poly))
}

export const renderPolygonFx = (engine: BABYLON.Engine, renderStates: Map<string, RenderState>, frameId?: string) => {
  // Redraw all graphics with current render states each frame
  chains.forEach((chain, id) => {
    const rs = renderStates.get(id)
    redrawGraphics(chain.graphics, chain.poly, chain.bboxLogical, rs)
  })

  // Render shader chains
  chains.forEach((chain) => {
    chain.end.renderAll(engine, frameId)
  })

  // Update and dispatch letterParticles renderers (synchronous - GPU commands are queued)
  letterParticlesRenderers.forEach((bundle, id) => {
    // Skip if renderer not yet initialized
    if (!bundle.renderer.initialized) return

    const rs = renderStates.get(id)
    redrawGraphics(bundle.graphics, bundle.poly, bundle.bboxLogical, rs)
    bundle.renderer.updateTexture(bundle.graphics.elt as HTMLCanvasElement)
    bundle.renderer.dispatch(bundle.bboxPx, bundle.fx)
  })

  if (overlayScene) {
    overlayScene.render()
  }
}

export const disposePolygonFx = () => {
  Array.from(chains.keys()).forEach((id) => disposeEntry(id))
  Array.from(letterParticlesRenderers.keys()).forEach((id) => disposeEntry(id))
  overlayScene?.dispose()
  overlayScene = undefined
  meshes.clear()
}
