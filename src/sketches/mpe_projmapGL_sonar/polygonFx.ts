import * as BABYLON from 'babylonjs'
import { bboxOfPoints, getFxMeta } from './textRegionUtils'
import type { PolygonRenderData } from '@/canvas/canvasState'
import type { FxChainMeta } from './appState'
import { PassthruEffect } from '@/rendering/babylonGL/shaderFXBabylon_GL'
import { TransformEffect } from '@/rendering/babylonGL/postFX/transform.frag.gl.generated'
import { WobbleEffect } from '@/rendering/babylonGL/postFX/wobble.frag.gl.generated'
import { HorizontalBlurEffect } from '@/rendering/babylonGL/postFX/horizontalBlur.frag.gl.generated'
import { VerticalBlurEffect } from '@/rendering/babylonGL/postFX/verticalBlur.frag.gl.generated'
import { PixelateEffect } from '@/rendering/babylonGL/postFX/pixelate.frag.gl.generated'
import { AlphaThresholdEffect } from '@/rendering/babylonGL/postFX/alphaThreshold.frag.gl.generated'
import { PolygonMaskEffect } from '@/rendering/babylonGL/postFX/polygonMask.frag.gl.generated'
import type { ShaderEffect } from '@/rendering/babylonGL/shaderFXBabylon_GL'
import type { RenderState } from './textRegionUtils'
import { getTextStyle, getTextAnim } from './textRegionUtils'
import type p5 from 'p5'
import { pitchToColor, releaseColor } from './mpeColor'
import { normalizePointForShader, shouldFlipPolygonY } from '@/rendering/coordinateConfig'
import { computeGeometry, getArcPathFn, generateStrokePoints, type ArcType, type NoteDrawStyle } from './arcPaths'

export type PolygonFxSyncOptions = {
  engine: BABYLON.Engine
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
  pixelate: PixelateEffect
  mask: PolygonMaskEffect
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

const chains = new Map<string, ChainBundle>()
const meshes = new Map<string, MeshBundle>()
let overlayScene: BABYLON.Scene | undefined

const MPE_PIXELATE_MIN = 1
const MPE_PIXELATE_MAX = 24
const POLYGON_MASK_MAX_POINTS = 64

const getPolygonMaskUniforms = (
  poly: PolygonRenderData[number],
  bboxLogical: { minX: number; minY: number; w: number; h: number },
  engine: BABYLON.Engine,
) => {
  const flipY = shouldFlipPolygonY(engine)
  const points = poly.points.slice(0, POLYGON_MASK_MAX_POINTS).map((point) =>
    normalizePointForShader(point, bboxLogical, flipY)
  )
  return { points, pointCount: points.length }
}

const getMpePixelateSize = (renderState?: RenderState): number => {
  const timbre = renderState?.mpeVoice?.timbre
  if (timbre === undefined || timbre === null) return MPE_PIXELATE_MIN
  const t = Math.min(1, Math.max(0, timbre / 127))
  return MPE_PIXELATE_MIN + (MPE_PIXELATE_MAX - MPE_PIXELATE_MIN) * t
}

const ensureOverlayScene = (engine: BABYLON.Engine) => {
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
  engine: BABYLON.Engine,
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
  const pixelate = new PixelateEffect(engine, { src: vBlur }, w, h, 'nearest')
  const alphaThresh = new AlphaThresholdEffect(engine, { src: pixelate }, w, h)
  const mask = new PolygonMaskEffect(engine, { src: alphaThresh }, w, h)
  // WebGL canvas textures are Y-flipped relative to render output; flip at end of chain
  const flipY = new TransformEffect(engine, { src: mask }, w, h)
  flipY.setUniforms({ rotate: 0, anchor: [0.5, 0.5], translate: [0, 0], scale: [1, -1] })

  wobble.setUniforms({
    xStrength: fx.wobbleX,
    yStrength: fx.wobbleY,
    time: () => performance.now() / 1000,
  })

  hBlur.setUniforms({ pixels: fx.blurX, resolution: w })
  vBlur.setUniforms({ pixels: fx.blurY, resolution: h })
  pixelate.setUniforms({ pixelSize: 1 })
  alphaThresh.setUniforms({ threshold: 0 })

  const { fxKey } = makeKeys({ minX: bboxPx.minX, minY: bboxPx.minY, w, h }, fx)
  return {
    end: flipY,
    wobble,
    hBlur,
    vBlur,
    pixelate,
    mask,
    width: w,
    height: h,
    fxKey,
    owned: [flipY, mask, alphaThresh, pixelate, vBlur, hBlur, wobble, srcPass],
    graphics,
    bboxPx,
    bboxLogical,
    poly,
  }
}

const createOrUpdateMesh = (
  id: string,
  engine: BABYLON.Engine,
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
  const isMPE = fillAnim === 'mpe'
  const isMelodyMap = fillAnim === 'melodyMap'

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
  } else if (isMPE) {
    // MPE mode: draw circles colored by pitch, sized by pressure
    const baseSize = textAnim.circleSize ?? 8

    if (renderState && renderState.letters.length > 0) {
      g.noStroke()

      if (renderState.mpeVoice) {
        // Active note: use pitch-based color and pressure-based size
        const rgb = pitchToColor(renderState.mpeVoice.noteNum, renderState.mpeVoice.bend)
        const pressureScale = 0.5 + (renderState.mpeVoice.pressure / 127) * 5.5  // 0.5 to 1
        g.fill(rgb.r * 255, rgb.g * 255, rgb.b * 255, 255)

        renderState.letters.forEach(({ pos }) => {
          const size = baseSize * pressureScale
          g.circle(pos.x, pos.y, size)
        })
      } else {
        // Released note: fade to white based on fillProgress
        const rgb = releaseColor()
        const alpha = renderState.mpeFillProgress !== undefined ? renderState.mpeFillProgress * 255 : 255
        g.fill(rgb.r * 255, rgb.g * 255, rgb.b * 255, alpha)

        renderState.letters.forEach(({ pos }) => {
          g.circle(pos.x, pos.y, baseSize)
        })
      }
    } else {
      // No active animation, draw polygon outline
      g.noFill()
      g.stroke(color.r, color.g, color.b, color.a * 0.5)
      g.beginShape()
      poly.points.forEach((point) => {
        g.vertex(point.x, point.y)
      })
      g.endShape(p.CLOSE)
    }
  } else if (isMelodyMap) {
    // MelodyMap mode: draw traveling shapes along arcs
    const baseSize = textAnim.circleSize ?? 12
    const arcType = (textAnim.arcType ?? 'linear') as ArcType
    const noteDrawStyle = (textAnim.noteDrawStyle ?? 'circle') as NoteDrawStyle
    const phaserEdge = textAnim.phaserEdge ?? 0.3
    const currentTime = performance.now()

    if (renderState?.melodyMapArcs && renderState.melodyMapArcs.length > 0) {
      // Compute geometry once per polygon per frame
      const geometry = computeGeometry(poly.points as { x: number; y: number }[])
      const pathFn = getArcPathFn(arcType)

      for (const arc of renderState.melodyMapArcs) {
        const elapsed = (currentTime - arc.startTime) / 1000
        const progress = Math.min(1, elapsed / arc.duration)

        // Skip completed arcs
        if (progress >= 1) continue

        // Get color based on pitch
        const rgb = pitchToColor(arc.pitch, 0)

        // Calculate size based on velocity
        const velocityScale = 0.5 + (arc.velocity / 127) * 1.0
        const size = baseSize * velocityScale

        if (noteDrawStyle === 'circle') {
          // Draw single circle at current position
          g.noStroke()
          const pos = pathFn(arc.startPoint, arc.endPoint, progress, geometry)
          g.fill(rgb.r * 255, rgb.g * 255, rgb.b * 255, 255)
          g.circle(pos.x, pos.y, size)
        } else {
          // Draw stroke as a spline of phaser-staggered points
          const strokePoints = generateStrokePoints(
            arc.startPoint,
            arc.endPoint,
            progress,
            geometry,
            pathFn,
            phaserEdge,
            10
          )

          // Draw as a curved stroke using curveVertex
          g.noFill()
          g.stroke(rgb.r * 255, rgb.g * 255, rgb.b * 255, 255)
          g.strokeWeight(size / 3)
          g.beginShape()
          // Add first point as curve anchor
          g.curveVertex(strokePoints[0].x, strokePoints[0].y)
          for (const pt of strokePoints) {
            g.curveVertex(pt.x, pt.y)
          }
          // Add last point as curve anchor
          g.curveVertex(strokePoints[strokePoints.length - 1].x, strokePoints[strokePoints.length - 1].y)
          g.endShape()
          g.strokeWeight(1)
        }
      }
    } else {
      // No active arcs, draw polygon outline with column-based color hint
      const columnColors: Record<string, { r: number; g: number; b: number }> = {
        left: { r: 255, g: 100, b: 100 },
        middle: { r: 100, g: 255, b: 100 },
        right: { r: 100, g: 100, b: 255 }
      }
      const column = textAnim.column ?? 'left'
      const colColor = columnColors[column] ?? columnColors.left

      g.noFill()
      g.stroke(colColor.r, colColor.g, colColor.b, 100)
      g.strokeWeight(2)
      g.beginShape()
      poly.points.forEach((point) => {
        g.vertex(point.x, point.y)
      })
      g.endShape(p.CLOSE)
      g.strokeWeight(1)
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

  // Remove deleted or missing from chains
  Array.from(chains.keys()).forEach((id) => {
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
      chain.mask.setUniforms(getPolygonMaskUniforms(poly, bboxLogical, engine))
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
      prev.mask.setUniforms(getPolygonMaskUniforms(poly, bboxLogical, engine))
      createOrUpdateMesh(poly.id, engine, prev, bboxLogical, canvasLogical)
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
    chain.pixelate.setUniforms({ pixelSize: getMpePixelateSize(rs) })
  })

  // Render shader chains
  chains.forEach((chain) => {
    chain.end.renderAll(engine, frameId)
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
