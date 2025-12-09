import type p5 from 'p5'
import type { PolygonRenderData } from '@/canvas/canvasState'
import { launchBrowser, type CancelablePromiseProxy, type TimeContext } from '@/channels/offline_time_context'
import {
  type Point,
  type RenderState,
  type PreparedPolygon,
  type PolygonSyncPayload,
  FRAME_WAIT,
  generateSpots,
  makeSignature,
  chooseText,
  getTextAnim,
  getTextStyle
} from './textRegionUtils'
import Matter from 'matter-js'

const { Engine, Bodies, Body, Composite } = Matter

const EXPLOSION_FORCE = 10
const PHYSICS_DURATION = 2.0
const LERP_DURATION = 1.0
const LERP_SPEED = 0.15
const WALL_THICKNESS = 4
const LETTER_RADIUS = 3
const LOG_ENABLED = false

const WALL_CATEGORY = 0x0001
const LETTER_CATEGORY = 0x0002

export class MatterExplodeManager {
  private renderStates = new Map<string, RenderState>()
  private loops = new Map<string, CancelablePromiseProxy<void>>()
  private signatures = new Map<string, string>()
  private engines = new Map<string, Matter.Engine>()
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
    this.engines.clear()
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
      console.log('[matterExplode] syncing polygons', {
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
        if (LOG_ENABLED) console.log(`[matterExplode] removing loop ${id} (deleted or missing)`)
        this.teardown(id)
      }
    })

    const refreshPolygon = (poly: PolygonRenderData[number], forceRestart = false) => {
      const anim = getTextAnim(poly.metadata)
      const id = poly.id

      if (anim.fillAnim !== 'matterExplode') {
        if (LOG_ENABLED && this.loops.has(id))
          console.log(`[matterExplode] removing loop ${id} (fillAnim not set)`)
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
    this.engines.delete(id)
  }

  private createWallsFromPolygon(polygon: Point[], engine: Matter.Engine) {
    const walls: Matter.Body[] = []
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i]
      const p2 = polygon[(i + 1) % polygon.length]
      const midX = (p1.x + p2.x) / 2
      const midY = (p1.y + p2.y) / 2
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)

      const wall = Bodies.rectangle(midX, midY, length, WALL_THICKNESS, {
        isStatic: true,
        angle,
        collisionFilter: { category: WALL_CATEGORY, mask: LETTER_CATEGORY },
        restitution: 0.6,
        friction: 0.1
      })
      walls.push(wall)
    }
    Composite.add(engine.world, walls)
    return walls
  }

  private createLetterBodies(spots: Point[], engine: Matter.Engine) {
    const bodies = spots.map((spot) => {
      const body = Bodies.circle(spot.x, spot.y, LETTER_RADIUS, {
        collisionFilter: { category: LETTER_CATEGORY, mask: WALL_CATEGORY },
        restitution: 0.4,
        friction: 0.05,
        frictionAir: 0.01
      })
      return body
    })
    Composite.add(engine.world, bodies)
    return bodies
  }

  private launchLoop(id: string, poly: PolygonRenderData[number], signature: string) {
    const anim = getTextAnim(poly.metadata)
    const text = chooseText(anim.textInd)
    if (LOG_ENABLED)
      console.log(`[matterExplode] launching loop ${id}`, {
        textInd: anim.textInd,
        textLen: text.length
      })

    const loop = launchBrowser(async (ctx) => {
      while (!ctx.isCanceled) {
        const p = this.getP5()
        if (!p) {
          if (!this.noP5Logged.has(id) && LOG_ENABLED) {
            console.warn(`[matterExplode] p5 instance not ready for poly ${id}`)
            this.noP5Logged.add(id)
          }
          await ctx.waitSec(FRAME_WAIT)
          continue
        }
        this.noP5Logged.delete(id)

        const textStyle = getTextStyle(poly.metadata)
        const prep = generateSpots(poly.points as Point[], p, {
          textSize: textStyle.textSize,
          fontFamily: textStyle.fontFamily,
          fontStyle: textStyle.fontStyle
        })
        if (!prep) {
          if (!this.noPrepLogged.has(id) && LOG_ENABLED) {
            console.warn(
              `[matterExplode] no grid spots for poly ${id} (maybe too small or self-intersecting)`
            )
            this.noPrepLogged.add(id)
          }
          this.renderStates.set(id, { letters: [], textOffset: 0, text })
          await ctx.waitSec(0.25)
          continue
        }
        if (this.noPrepLogged.has(id) && LOG_ENABLED) {
          console.log(`[matterExplode] grid ready for poly ${id}`, {
            spots: prep.flatSpots.length,
            rows: prep.spots.length
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

    const engine = Engine.create({
      gravity: { x: 0, y: 1, scale: 0.001 }
    })
    this.engines.set(id, engine)

    const initialPositions = prep.flatSpots.map((p) => ({ x: p.x, y: p.y }))

    this.createWallsFromPolygon(prep.polygon, engine)
    const letterBodies = this.createLetterBodies(prep.flatSpots, engine)

    if (LOG_ENABLED)
      console.log(`[matterExplode] cycle start poly ${id}`, {
        totalSpots,
        bodies: letterBodies.length
      })

    this.updateRenderState(id, letterBodies, prevTextOffset, text)
    await ctx.waitSec(FRAME_WAIT)

    letterBodies.forEach((body) => {
      const vx = (Math.random() - 0.5) * EXPLOSION_FORCE * 2
      const vy = -Math.random() * EXPLOSION_FORCE * 0.3
      Body.setVelocity(body, { x: vx, y: vy })
    })

    const physicsStartTime = ctx.time
    while (!ctx.isCanceled && ctx.time - physicsStartTime < PHYSICS_DURATION) {
      Engine.update(engine, 16.666)
      this.updateRenderState(id, letterBodies, prevTextOffset, text)
      await ctx.waitSec(FRAME_WAIT)
    }

    const lerpStartTime = ctx.time
    while (!ctx.isCanceled && ctx.time - lerpStartTime < LERP_DURATION) {
      letterBodies.forEach((body, i) => {
        const target = initialPositions[i]
        const current = body.position
        const newPos = {
          x: current.x + (target.x - current.x) * LERP_SPEED,
          y: current.y + (target.y - current.y) * LERP_SPEED
        }
        Body.setPosition(body, newPos)
        Body.setVelocity(body, { x: 0, y: 0 })
      })
      this.updateRenderState(id, letterBodies, prevTextOffset, text)
      await ctx.waitSec(FRAME_WAIT)
    }

    letterBodies.forEach((body, i) => {
      Body.setPosition(body, initialPositions[i])
      Body.setVelocity(body, { x: 0, y: 0 })
    })
    this.updateRenderState(id, letterBodies, prevTextOffset, text)

    Composite.clear(engine.world, false)
    Engine.clear(engine)
    this.engines.delete(id)

    const textOffset = text.length === 0 ? 0 : (prevTextOffset + totalSpots) % text.length
    return textOffset
  }

  private updateRenderState(
    id: string,
    bodies: Matter.Body[],
    textOffset: number,
    text: string
  ) {
    const letters = bodies.map((body, idx) => ({
      pos: { x: body.position.x, y: body.position.y },
      idx
    }))
    this.renderStates.set(id, { letters, textOffset, text })
  }
}
