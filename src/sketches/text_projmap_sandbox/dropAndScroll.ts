import type p5 from 'p5'
import type { PolygonRenderData } from '@/canvas/canvasState'
import { launch, type CancelablePromisePoxy, type TimeContext } from '@/channels/channels'
import {
  type Point,
  type RenderState,
  type PreparedPolygon,
  type PolygonSyncPayload,
  FRAME_WAIT,
  clamp,
  generateSpots,
  makeSignature,
  chooseText,
  isPointInsidePolygon,
  getTextAnim,
  getTextStyle
} from './textRegionUtils'

const DROP_SPEED = 80
const LOG_ENABLED = false

export class DropAndScrollManager {
  private renderStates = new Map<string, RenderState>()
  private loops = new Map<string, CancelablePromisePoxy<void>>()
  private signatures = new Map<string, string>()
  private getP5: () => p5 | undefined
  private noPrepLogged = new Set<string>()
  private noP5Logged = new Set<string>()

  constructor(getP5Instance: () => p5 | undefined) {
    this.getP5 = getP5Instance
  }

  public dispose() {
    Array.from(this.loops.values()).forEach((loop) => loop.cancel())
    this.loops.clear()
    this.renderStates.clear()
    this.signatures.clear()
    this.noPrepLogged.clear()
    this.noP5Logged.clear()
  }

  public getRenderStates() {
    return this.renderStates
  }

  public syncPolygons(payload: PolygonRenderData | PolygonSyncPayload) {
    const { current, added = [], deleted = [], changed = [] } = Array.isArray(payload)
      ? { current: payload, added: [], deleted: [], changed: [] }
      : payload

    if (LOG_ENABLED) {
      console.log('[dropAndScroll] syncing polygons', {
        total: current.length,
        added: added.length,
        deleted: deleted.length,
        changed: changed.length
      })
    }

    const currentIds = new Set(current.map((poly) => poly.id))
    const deletedIds = new Set(deleted.map((poly) => poly.id))

    Array.from(this.loops.keys()).forEach((id) => {
      if (!currentIds.has(id) || deletedIds.has(id)) {
        if (LOG_ENABLED) console.log(`[dropAndScroll] removing loop ${id} (deleted or missing)`)
        this.teardown(id)
      }
    })

    const refreshPolygon = (poly: PolygonRenderData[number], forceRestart = false) => {
      const anim = getTextAnim(poly.metadata)
      const id = poly.id

      if (anim?.fillAnim !== 'dropAndScroll') {
        if (LOG_ENABLED && this.loops.has(id))
          console.log(`[dropAndScroll] removing loop ${id} (fillAnim not set)`)
        this.teardown(id)
        return
      }

      const signature = makeSignature(poly.points as Point[], poly.metadata)
      const prevSig = this.signatures.get(id)
      if (!forceRestart && prevSig === signature && this.loops.has(id)) return

      this.teardown(id)
      this.launchLoop(id, poly, signature)
    }

    added.forEach((poly) => refreshPolygon(poly, true))
    changed.forEach((poly) => refreshPolygon(poly, true))
    current.forEach((poly) => refreshPolygon(poly, false))
  }

  private teardown(id: string) {
    this.loops.get(id)?.cancel()
    this.loops.delete(id)
    this.renderStates.delete(id)
    this.signatures.delete(id)
  }

  private launchLoop(id: string, poly: PolygonRenderData[number], signature: string) {
    const anim = getTextAnim(poly.metadata)
    const text = chooseText(anim?.textInd)
    const minCharsDrop = anim?.minCharsDrop
    if (LOG_ENABLED)
      console.log(`[dropAndScroll] launching loop ${id}`, {
        textInd: anim?.textInd,
        textLen: text.length,
        minCharsDrop
      })

    const loop = launch(async (ctx) => {
      while (!ctx.isCanceled) {
        const p = this.getP5()
        if (!p) {
          if (!this.noP5Logged.has(id) && LOG_ENABLED) {
            console.warn(`[dropAndScroll] p5 instance not ready for poly ${id}`)
            this.noP5Logged.add(id)
          }
          await ctx.waitSec(FRAME_WAIT)
          continue
        }
        this.noP5Logged.delete(id)

        const textStyle = getTextStyle(poly.metadata)
        const prep = generateSpots(poly.points as Point[], p, {
          minCharsDrop,
          textSize: textStyle.textSize,
          fontFamily: textStyle.fontFamily,
          fontStyle: textStyle.fontStyle
        })
        if (!prep) {
          if (!this.noPrepLogged.has(id) && LOG_ENABLED) {
            console.warn(
              `[dropAndScroll] no grid spots for poly ${id} (maybe too small or self-intersecting)`
            )
            this.noPrepLogged.add(id)
          }
          this.renderStates.set(id, { letters: [], textOffset: 0, text })
          await ctx.waitSec(0.25)
          continue
        }
        if (this.noPrepLogged.has(id) && LOG_ENABLED) {
          console.log(`[dropAndScroll] grid ready for poly ${id}`, {
            spots: prep.flatSpots.length,
            rows: prep.spots.length,
            openSpots: prep.openSpots
          })
          this.noPrepLogged.delete(id)
        }

        let textOffset = 0
        while (!ctx.isCanceled) {
          textOffset = await this.runCycle(id, prep, text, textOffset, ctx)
        }
      }
    })

    this.loops.set(id, loop)
    this.signatures.set(id, signature)
  }

  private async runCycle(
    id: string,
    prep: PreparedPolygon,
    text: string,
    prevTextOffset: number,
    ctx: TimeContext
  ) {
    const totalSpots = prep.flatSpots.length
    if (totalSpots === 0) {
      this.renderStates.set(id, { letters: [], textOffset: prevTextOffset, text })
      await ctx.waitSec(0.05)
      return prevTextOffset
    }

    const openSpots = clamp(prep.openSpots, 0, totalSpots)
    const textLen = Math.max(totalSpots - openSpots, 0)
    const startTime = ctx.time
    if (LOG_ENABLED)
      console.log(`[dropAndScroll] cycle start poly ${id}`, {
        totalSpots,
        openSpots,
        textLen,
        textChars: text.length
      })

    type Dropping = { start: Point; delay: number; idx: number }
    let dropping: Dropping[] = prep.flatSpots
      .slice(0, openSpots)
      .map((start, i) => ({ start, delay: Math.random(), idx: i }))
    const stationary = prep.flatSpots.slice(openSpots).map((pos, i) => ({ pos, idx: i + openSpots }))
    const bbox = prep.bbox

    while (dropping.length > 0 && !ctx.isCanceled) {
      const nowTime = ctx.time - startTime
      const active: { pos: Point; idx: number }[] = []
      const stillDropping: Dropping[] = []
      dropping.forEach((d) => {
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
      this.renderStates.set(id, { letters: [...active, ...stationary], textOffset: prevTextOffset, text })
      await ctx.waitSec(FRAME_WAIT)
    }

    let textOffset = prevTextOffset
    textOffset = text.length === 0 ? 0 : (textOffset + openSpots) % text.length

    for (let startInd = openSpots - 1; startInd >= 0 && !ctx.isCanceled; startInd--) {
      const windowSpots = prep.flatSpots.slice(startInd, startInd + textLen)
      const letters = windowSpots.map((pos, i) => ({ pos, idx: i }))
      this.renderStates.set(id, { letters, textOffset, text })
      await ctx.waitSec(FRAME_WAIT)
    }

    const otherLetters = prep.spots
      .slice(0, -1)
      .flat()
      .map((pos, i) => ({ pos, idx: i }))
    const lastLine = prep.spots.slice(-1)[0] ?? []
    let typed = [...otherLetters]
    for (let i = 0; i < lastLine.length && !ctx.isCanceled; i++) {
      typed = [...typed, { pos: lastLine[i], idx: otherLetters.length + i }]
      this.renderStates.set(id, { letters: typed, textOffset, text })
      await ctx.waitSec(FRAME_WAIT)
    }

    return textOffset
  }
}
