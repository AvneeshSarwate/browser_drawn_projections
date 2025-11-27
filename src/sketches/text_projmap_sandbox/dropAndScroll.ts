import type p5 from 'p5'
import type { PolygonRenderData } from '@/canvas/canvasState'
import { launch, type CancelablePromisePoxy, type TimeContext } from '@/channels/channels'
import { quotes } from './quotes'

type Point = { x: number, y: number }

type RenderState = {
  letters: { pos: Point, idx: number }[]
  textOffset: number
  text: string
}

type PreparedPolygon = {
  spots: Point[][]
  flatSpots: Point[]
  openSpots: number
  bbox: { minX: number, maxX: number, minY: number, maxY: number }
  letterHeight: number
  polygon: Point[]
}

const FONT_FAMILY = 'Courier New'
const FONT_SIZE = 14
const COURIER_RATIO = 0.42
const FRAME_WAIT = 0.016
const DROP_SPEED = 80
const LOG_ENABLED = false

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

const bboxOfPoints = (points: Point[]) => points.reduce((acc, p) => ({
  minX: Math.min(acc.minX, p.x),
  maxX: Math.max(acc.maxX, p.x),
  minY: Math.min(acc.minY, p.y),
  maxY: Math.max(acc.maxY, p.y)
}), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })

// Raycast test modeled after the original maskMaker code
const segmentIntersection = (ray1: [Point, Point], ray2: [Point, Point]) => {
  const [p1, p2] = ray1
  const [p3, p4] = ray2
  const eps = 1e-7

  const between = (a: number, b: number, c: number) => a - eps <= b && b <= c + eps

  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x)
  if (denom === 0) return false

  const x = ((p1.x * p2.y - p1.y * p2.x) * (p3.x - p4.x) - (p1.x - p2.x) * (p3.x * p4.y - p3.y * p4.x)) / denom
  const y = ((p1.x * p2.y - p1.y * p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x * p4.y - p3.y * p4.x)) / denom

  if (Number.isNaN(x) || Number.isNaN(y)) return false

  if (p1.x >= p2.x ? !between(p2.x, x, p1.x) : !between(p1.x, x, p2.x)) return false
  if (p1.y >= p2.y ? !between(p2.y, y, p1.y) : !between(p1.y, y, p2.y)) return false
  if (p3.x >= p4.x ? !between(p4.x, x, p3.x) : !between(p3.x, x, p4.x)) return false
  if (p3.y >= p4.y ? !between(p4.y, y, p3.y) : !between(p3.y, y, p4.y)) return false

  return { x, y }
}

const isPointInsidePolygon = (point: Point, polygon: Point[], bbox: { minX: number, maxX: number, minY: number, maxY: number }) => {
  const ray: [Point, Point] = [point, { x: point.x, y: bbox.minY - 10 }]
  let numIntersections = 0
  const numPoints = polygon.length
  for (let i = 0; i < numPoints; i++) {
    const seg: [Point, Point] = [polygon[i], polygon[(i + 1) % numPoints]]
    if (segmentIntersection(ray, seg)) numIntersections++
  }
  return numIntersections % 2 === 1
}

const generateSpots = (polygonPoints: Point[], p: p5): PreparedPolygon | null => {
  if (!polygonPoints.length) return null
  const bbox = bboxOfPoints(polygonPoints)

  p.push()
  p.textFont(FONT_FAMILY)
  p.textSize(FONT_SIZE)
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
  const openSpots = Math.max(firstRowLen, lastRowLen)

  return { spots, flatSpots, openSpots, bbox, letterHeight, polygon: polygonPoints }
}

const makeSignature = (points: Point[], meta: any) => {
  const anim = meta?.textAnim ?? meta ?? {}
  const metaSig = JSON.stringify({ fillAnim: anim.fillAnim, textInd: anim.textInd })
  const ptsSig = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('|')
  return `${ptsSig}::${metaSig}`
}

const chooseText = (textInd: unknown) => {
  const idx = Number.isFinite(Number(textInd)) ? clamp(Math.floor(Number(textInd)), 0, quotes.length - 1) : 0
  return quotes[idx] ?? quotes[0] ?? ''
}

export class DropAndScrollManager {
  private renderStates = new Map<number, RenderState>()
  private loops = new Map<number, CancelablePromisePoxy<void>>()
  private signatures = new Map<number, string>()
  private getP5: () => p5 | undefined
  private noPrepLogged = new Set<number>()
  private noP5Logged = new Set<number>()

  constructor(getP5Instance: () => p5 | undefined) {
    this.getP5 = getP5Instance
  }

  public dispose() {
    Array.from(this.loops.values()).forEach(loop => loop.cancel())
    this.loops.clear()
    this.renderStates.clear()
    this.signatures.clear()
  }

  public getRenderStates() {
    return this.renderStates
  }

  public syncPolygons(polygons: PolygonRenderData) {
    if (LOG_ENABLED) console.log('[dropAndScroll] syncing polygons', polygons.length)
    const keep = new Set<number>()
    polygons.forEach((poly, idx) => {
      const anim = poly.metadata?.textAnim ?? poly.metadata
      if (anim?.fillAnim !== 'dropAndScroll') {
        if (LOG_ENABLED && this.loops.has(idx)) console.log(`[dropAndScroll] removing loop ${idx} (fillAnim not set)`)
        this.teardown(idx)
        return
      }
      keep.add(idx)
      const sig = makeSignature(poly.points as Point[], poly.metadata)
      const prevSig = this.signatures.get(idx)
      if (prevSig === sig && this.loops.has(idx)) return
      this.teardown(idx)
      this.launchLoop(idx, poly, sig)
    })

    Array.from(this.loops.keys()).forEach(idx => {
      if (!keep.has(idx)) {
        if (LOG_ENABLED) console.log(`[dropAndScroll] removing loop ${idx} (polygon missing)`)
        this.teardown(idx)
      }
    })
  }

  private teardown(idx: number) {
    this.loops.get(idx)?.cancel()
    this.loops.delete(idx)
    this.renderStates.delete(idx)
    this.signatures.delete(idx)
  }

  private launchLoop(idx: number, poly: PolygonRenderData[number], signature: string) {
    const anim = poly.metadata?.textAnim ?? poly.metadata
    const text = chooseText(anim?.textInd)
    if (LOG_ENABLED) console.log(`[dropAndScroll] launching loop ${idx}`, { textInd: anim?.textInd, textLen: text.length })

    const loop = launch(async (ctx) => {
      while (!ctx.isCanceled) {
        const p = this.getP5()
        if (!p) {
          if (!this.noP5Logged.has(idx) && LOG_ENABLED) {
            console.warn(`[dropAndScroll] p5 instance not ready for poly ${idx}`)
            this.noP5Logged.add(idx)
          }
          await ctx.waitSec(FRAME_WAIT)
          continue
        }
        this.noP5Logged.delete(idx)

        const prep = generateSpots(poly.points as Point[], p)
        if (!prep) {
          if (!this.noPrepLogged.has(idx) && LOG_ENABLED) {
            console.warn(`[dropAndScroll] no grid spots for poly ${idx} (maybe too small or self-intersecting)`)
            this.noPrepLogged.add(idx)
          }
          this.renderStates.set(idx, { letters: [], textOffset: 0, text })
          await ctx.waitSec(0.25)
          continue
        }
        if (this.noPrepLogged.has(idx) && LOG_ENABLED) {
          console.log(`[dropAndScroll] grid ready for poly ${idx}`, { spots: prep.flatSpots.length, rows: prep.spots.length, openSpots: prep.openSpots })
          this.noPrepLogged.delete(idx)
        }

        let textOffset = 0
        while (!ctx.isCanceled) {
          textOffset = await this.runCycle(idx, prep, text, textOffset, ctx)
        }
      }
    })

    this.loops.set(idx, loop)
    this.signatures.set(idx, signature)
  }

  private async runCycle(idx: number, prep: PreparedPolygon, text: string, prevTextOffset: number, ctx: TimeContext) {
    const totalSpots = prep.flatSpots.length
    if (totalSpots === 0) {
      this.renderStates.set(idx, { letters: [], textOffset: prevTextOffset, text })
      await ctx.waitSec(0.05)
      return prevTextOffset
    }

    const openSpots = clamp(prep.openSpots, 0, totalSpots)
    const textLen = Math.max(totalSpots - openSpots, 0)
    const startTime = ctx.time
    if (LOG_ENABLED) console.log(`[dropAndScroll] cycle start poly ${idx}`, { totalSpots, openSpots, textLen, textChars: text.length })

    // Stage 1: drop the first openSpots letters
    type Dropping = { start: Point, delay: number, idx: number }
    let dropping: Dropping[] = prep.flatSpots.slice(0, openSpots).map((start, i) => ({ start, delay: Math.random(), idx: i }))
    const stationary = prep.flatSpots.slice(openSpots).map((pos, i) => ({ pos, idx: i + openSpots }))
    const bbox = prep.bbox

    while (dropping.length > 0 && !ctx.isCanceled) {
      const nowTime = ctx.time - startTime
      const active: { pos: Point, idx: number }[] = []
      const stillDropping: Dropping[] = []
      dropping.forEach((d, i) => {
        if (nowTime <= d.delay) {
          active.push({ pos: d.start, idx: d.idx })
          stillDropping.push(d)
          return
        }
        const dropTime = nowTime - d.delay
        const pos = { x: d.start.x, y: d.start.y + dropTime * dropTime * DROP_SPEED }
        if (isPointInsidePolygon(pos, prep.polygon, bbox)) {
          active.push({ pos, idx: d.idx })
          stillDropping.push(d)
        }
      })
      dropping = stillDropping
      this.renderStates.set(idx, { letters: [...active, ...stationary], textOffset: prevTextOffset, text })
      await ctx.waitSec(FRAME_WAIT)
    }

    let textOffset = prevTextOffset
    textOffset = text.length === 0 ? 0 : (textOffset + openSpots) % text.length

    // Stage 2: scroll back the remaining text
    for (let startInd = openSpots - 1; startInd >= 0 && !ctx.isCanceled; startInd--) {
      const windowSpots = prep.flatSpots.slice(startInd, startInd + textLen)
      const letters = windowSpots.map((pos, i) => ({ pos, idx: i }))
      this.renderStates.set(idx, { letters, textOffset, text })
      await ctx.waitSec(FRAME_WAIT)
    }

    // Stage 3: type the last line
    const otherLetters = prep.spots.slice(0, -1).flat().map((pos, i) => ({ pos, idx: i }))
    const lastLine = prep.spots.slice(-1)[0] ?? []
    let typed = [...otherLetters]
    for (let i = 0; i < lastLine.length && !ctx.isCanceled; i++) {
      typed = [...typed, { pos: lastLine[i], idx: otherLetters.length + i }]
      this.renderStates.set(idx, { letters: typed, textOffset, text })
      await ctx.waitSec(FRAME_WAIT)
    }

    return textOffset
  }
}
