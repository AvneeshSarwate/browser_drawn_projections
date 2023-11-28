import p5 from 'p5'
import type { AnimationSeq } from './planeAnimations'
import { Entity, EntityList, UndoableList } from '@/stores/undoCommands'
import { storedData1 } from './exportedShapes'


//@ts-ignore
import Stats from '@/rendering/Stats'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref } from 'vue'


export type DrawMode = 'display' | 'addingPoint' | 'movingPoint'

type RegionSerialized = {
  points: ({ x: number, y: number })[]
  color: {
    r: number
    g: number
    b: number
  },
  id: number
}

export class Region extends Entity {
  public points = new UndoableList<p5.Vector>()
  public color: { r: number, g: number, b: number} //0 to 1
  public type = 'Region'
  public grabPointIdx: number | undefined = undefined
  public drawMode: DrawMode = 'display'
  public animationStartTime = -1
  public animationSeq: AnimationSeq | undefined = undefined
  public visible = true
  public debug = false
  public get isActive() {
    return this.drawMode != 'display'
  }

  constructor(createId = true) {
    super(createId)
    const r = () => Math.random()
    this.color = { r: r(), g: r(), b: r() }
  }

  public serialize() {
    const serialized: RegionSerialized = {
      points: this.points.list.map((p) => ({ x: p.x, y: p.y })),
      color: this.color,
      id: this.id
    }
    return serialized
  }

  public hydrate(serialized: object) {
    const parsed = serialized as RegionSerialized
    this.points.list = parsed.points.map((p) => new p5.Vector(p.x, p.y))
    this.color = parsed.color
    this.id = parsed.id
  }

  drawDebugText(p5Instance: p5) {
    p5Instance.push()
    p5Instance.strokeWeight(2)
    p5Instance.fill(255)
    const center = this.points.list.reduce((acc, v) => acc.add(v), p5Instance.createVector(0, 0)).div(this.points.list.length)
    p5Instance.text(`id: ${this.id}`, center.x, center.y)
    p5Instance.pop()
  }

  drawPoints(p5Instance: p5, pts: p5.Vector[]) {
    p5Instance.beginShape()
    for (let i = 0; i < pts.length; i++) {
      p5Instance.vertex(pts[i].x, pts[i].y)
    }
    p5Instance.endShape(p5Instance.CLOSE)
  }

  setDebugStyle(p5Instance: p5) {
    p5Instance.strokeWeight(5)
    p5Instance.stroke(255, 255, 255)
    p5Instance.fill(0, 0, 0, 0)
    p5Instance.textSize(20)
  }

  drawBaseStyle(p5Instance: p5, pts: p5.Vector[]) {
    p5Instance.push()
    if (this.debug) this.setDebugStyle(p5Instance)
    else this.setStyle(p5Instance)
    this.drawPoints(p5Instance, pts)
    if (this.debug) this.drawDebugText(p5Instance)
    p5Instance.pop()
  }

  display(p5Instance: p5) {
    this.drawBaseStyle(p5Instance, this.points.list)
  }

  drawWhileAddingPoint(p5Instance: p5, point: p5.Vector) {
    const pts = [...this.points.list, point]
    this.drawBaseStyle(p5Instance, pts)
  }

  drawWhileMovingPoint(p5Instance: p5, point: p5.Vector, grabbedPointIdx: number) {
    const pts = this.points.list.map((p, idx) => idx == grabbedPointIdx ? point : p)
    this.drawBaseStyle(p5Instance, pts)
  }

  public setStyle(p5Instance: p5) {
    const {r, g, b} = this.color
    p5Instance.stroke(r*255, g*255, b*255)
    p5Instance.fill(r*255, g*255, b*255)
    p5Instance.strokeWeight(15)
  }

  public resetDrawState() {
    this.drawMode = 'display'
    this.grabPointIdx = undefined
    this.debug = true
    this.visible = false
  }

  public activate() {
    this.visible = true
    this.debug = false
    return this
  }

  public draw(p5inst: p5) {
    const testComment = `info about the function`
    if (!this.visible) return
    // if (this.draw2) this.draw2(this, p5inst)
    if (this.animationSeq && !this.debug) this.animationSeq.draw(p5inst, this, this.animationStartTime, p5inst.millis() / 1000)
    else this.drawDefault(p5inst)
  }

  public draw2: ((reg: Region, p5: p5) => void) | undefined

  public drawDefault(p5Instance: p5) {
    const mousePos = p5Instance.createVector(p5Instance.mouseX, p5Instance.mouseY)
    switch (this.drawMode) {
      case 'display':
        this.display(p5Instance)
        break
      case 'movingPoint':
        if (this.grabPointIdx != undefined) {
          this.drawWhileMovingPoint(p5Instance, mousePos, this.grabPointIdx)
        }
        break
      case 'addingPoint':
        this.drawWhileAddingPoint(p5Instance, mousePos)
        break
    }
  }
}

export function findClosestPointAndRegion(p5Instance: p5, regions: EntityList<Region>): [number, Region] | undefined {
  const mousePos = p5Instance.createVector(p5Instance.mouseX, p5Instance.mouseY)
  let closestPointIdx: number | undefined = undefined
  let closestRegion: Region | undefined = undefined
  let closestDistance = Number.MAX_VALUE
  regions.list.forEach((region) => {
    region.points.list.forEach((point, idx) => {
      const distance = p5Instance.dist(mousePos.x, mousePos.y, point.x, point.y)
      if (distance < closestDistance) {
        closestDistance = distance
        closestPointIdx = idx
        closestRegion = region
      }
    })
  })
  if (closestPointIdx != undefined && closestRegion != undefined) {
    return [closestPointIdx, closestRegion]
  }
}

export const stats = new Stats();
stats.showPanel( 1 ); // 0: fps, 1: ms, 2: mb, 3+: custom

export type DevelopmentAppState = {
  regions: EntityList<Region>
  p5Instance: p5 | undefined
  threeRenderer: THREE.WebGLRenderer | undefined
  codeStack: (() => void)[]
  codeStackIndex: number
  drawFunctions: ((p5: p5) => void)[]
  oneTimeDrawFuncs: ((p5: p5) => void)[]
  drawFuncMap: Map<string, (p5: p5) => void>
  shaderDrawFunc: (() => void) | undefined
  // stats: { begin: () => void, end: () => void, update: () => void }
  paused: boolean
}

export const appState: DevelopmentAppState = {
  regions: new EntityList(Region).deserialize(storedData1),
  p5Instance: undefined,
  threeRenderer: undefined,
  codeStack: [],
  codeStackIndex: 0,
  drawFunctions: [],
  oneTimeDrawFuncs: [],
  drawFuncMap: new Map<string, (p5: p5) => void>(),
  shaderDrawFunc: undefined,
  // stats: stats,
  paused: false
} 

export const globalStore = defineStore('appState', () => {
  const appStateRef = ref(appState)

  //@ts-ignore
  window.appState = appStateRef

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
} 