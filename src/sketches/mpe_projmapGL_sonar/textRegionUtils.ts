import type p5 from 'p5'
import { quotes } from './quotes'
import { textAnimSchema, textStyleSchema, fxChainSchema, type TextAnimFlat, type TextStyle, type FxChainMeta } from './appState'

export type Point = { x: number; y: number }

export type MPEVoiceRenderData = {
  noteNum: number
  pressure: number
  timbre: number
  bend: number
} | null

/**
 * Arc animation data for melodyMap rendering
 */
export type ArcRenderData = {
  id: string
  startPoint: Point
  endPoint: Point
  startTime: number
  duration: number
  pitch: number
  velocity: number
  melodyRootBlend: number
}

export type RenderState = {
  letters: { pos: Point; idx: number }[]
  textOffset: number
  text: string
  // MPE-specific render data (optional)
  mpeVoice?: MPEVoiceRenderData
  mpeFillProgress?: number
  // MelodyMap-specific render data (optional)
  melodyMapArcs?: ArcRenderData[]
}

export type PreparedPolygon = {
  spots: Point[][]
  flatSpots: Point[]
  openSpots: number
  bbox: { minX: number; maxX: number; minY: number; maxY: number }
  letterHeight: number
  letterWidth: number
  polygon: Point[]
}

export type PolygonSyncPayload = {
  current: PolygonRenderData
  added?: PolygonRenderData
  deleted?: PolygonRenderData
  changed?: PolygonRenderData
}

import type { PolygonRenderData } from '@/canvas/canvasState'

export const FONT_FAMILY = 'Courier New'
export const FONT_SIZE = 14
export const COURIER_RATIO = 0.42
export const FRAME_WAIT = 0.016
export type GenerateSpotsOptions = {
  minCharsDrop?: number
  textSize?: number
  fontFamily?: string
  fontStyle?: 'NORMAL' | 'ITALIC' | 'BOLD' | 'BOLDITALIC'
}

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

export const bboxOfPoints = (points: Point[]) =>
  points.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x),
      maxX: Math.max(acc.maxX, p.x),
      minY: Math.min(acc.minY, p.y),
      maxY: Math.max(acc.maxY, p.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  )

export const segmentIntersection = (ray1: [Point, Point], ray2: [Point, Point]) => {
  const [p1, p2] = ray1
  const [p3, p4] = ray2
  const eps = 1e-7

  const between = (a: number, b: number, c: number) => a - eps <= b && b <= c + eps

  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x)
  if (denom === 0) return false

  const x =
    ((p1.x * p2.y - p1.y * p2.x) * (p3.x - p4.x) - (p1.x - p2.x) * (p3.x * p4.y - p3.y * p4.x)) /
    denom
  const y =
    ((p1.x * p2.y - p1.y * p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x * p4.y - p3.y * p4.x)) /
    denom

  if (Number.isNaN(x) || Number.isNaN(y)) return false

  if (p1.x >= p2.x ? !between(p2.x, x, p1.x) : !between(p1.x, x, p2.x)) return false
  if (p1.y >= p2.y ? !between(p2.y, y, p1.y) : !between(p1.y, y, p2.y)) return false
  if (p3.x >= p4.x ? !between(p4.x, x, p3.x) : !between(p3.x, x, p4.x)) return false
  if (p3.y >= p4.y ? !between(p4.y, y, p3.y) : !between(p3.y, y, p4.y)) return false

  return { x, y }
}

export const isPointInsidePolygon = (
  point: Point,
  polygon: Point[],
  bbox: { minX: number; maxX: number; minY: number; maxY: number }
) => {
  const ray: [Point, Point] = [point, { x: point.x, y: bbox.minY - 10 }]
  let numIntersections = 0
  const numPoints = polygon.length
  for (let i = 0; i < numPoints; i++) {
    const seg: [Point, Point] = [polygon[i], polygon[(i + 1) % numPoints]]
    if (segmentIntersection(ray, seg)) numIntersections++
  }
  return numIntersections % 2 === 1
}

export const generateSpots = (
  polygonPoints: Point[],
  p: p5,
  options: GenerateSpotsOptions = {}
): PreparedPolygon | null => {
  if (!polygonPoints.length) return null
  const { minCharsDrop, textSize, fontFamily, fontStyle } = options
  const fontSize = textSize ?? FONT_SIZE
  const font = fontFamily ?? FONT_FAMILY
  const style = fontStyle ?? 'NORMAL'
  const bbox = bboxOfPoints(polygonPoints)

  p.push()
  p.textFont(font)
  p.textSize(fontSize)
  // Apply font style before measuring to get accurate dimensions
  if (style === 'ITALIC') p.textStyle(p.ITALIC)
  else if (style === 'BOLD') p.textStyle(p.BOLD)
  else if (style === 'BOLDITALIC') p.textStyle(p.BOLDITALIC)
  else p.textStyle(p.NORMAL)

  const letterWidth = p.textWidth('a')
  const letterHeight = letterWidth / COURIER_RATIO
  p.pop()

  const spots: Point[][] = []
  for (let y = bbox.minY; y <= bbox.maxY; y += letterHeight) {
    const row: Point[] = []
    for (let x = bbox.minX; x <= bbox.maxX; x += letterWidth) {
      const pt = { x, y }
      if (isPointInsidePolygon(pt, polygonPoints, bbox)) row.push(pt)
    }
    if (row.length > 0) spots.push(row)
  }

  const flatSpots = spots.flat()
  if (!flatSpots.length) return null

  const firstRowLen = spots[0]?.length ?? 0
  const lastRowLen = spots[spots.length - 1]?.length ?? 0
  let openSpots = Math.max(firstRowLen, lastRowLen)

  if (minCharsDrop !== undefined && minCharsDrop > 0 && firstRowLen < minCharsDrop) {
    let cumulative = 0
    for (let i = 0; i < spots.length; i++) {
      cumulative += spots[i].length
      if (cumulative >= minCharsDrop) {
        openSpots = cumulative
        break
      }
    }
    if (cumulative < minCharsDrop) {
      openSpots = cumulative
    }
  }

  return { spots, flatSpots, openSpots, bbox, letterHeight, letterWidth, polygon: polygonPoints }
}

export const getTextAnim = (meta: unknown): TextAnimFlat => {
  const raw = (meta as any)?.textAnim ?? meta
  const result = textAnimSchema.safeParse(raw)
  return result.success ? (result.data as TextAnimFlat) : (textAnimSchema.parse({}) as TextAnimFlat)
}

export const getTextStyle = (meta: unknown): TextStyle => {
  const raw = (meta as any)?.textStyle ?? meta
  const result = textStyleSchema.safeParse(raw)
  return result.success ? result.data : textStyleSchema.parse({})
}

export const getFxMeta = (meta: unknown): FxChainMeta => {
  const raw = (meta as any)?.fx ?? meta
  const parsed = fxChainSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  return fxChainSchema.parse({})
}

export const makeSignature = (points: Point[], meta: unknown) => {
  const anim = getTextAnim(meta)
  const style = getTextStyle(meta)
  const metaSig = JSON.stringify({
    fillAnim: anim.fillAnim,
    textInd: anim.textInd,
    textSize: style.textSize,
    textColor: style.textColor,
    fontFamily: style.fontFamily,
    fontStyle: style.fontStyle
  })
  const ptsSig = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|')
  return `${ptsSig}::${metaSig}`
}

export const chooseText = (textInd: unknown) => {
  // Primary path: if a non-empty string is provided, use it directly (supports new schema)
  if (typeof textInd === 'string' && textInd.trim().length > 0) {
    return textInd
  }

  // Backward compatibility: accept numeric indices (including numeric strings)
  const num = Number(textInd)
  const idx = Number.isFinite(num) ? clamp(Math.floor(num), 0, quotes.length - 1) : 0
  return quotes[idx] ?? quotes[0] ?? ''
}

export const randRange = (min: number, max: number) => min + Math.random() * (max - min)
