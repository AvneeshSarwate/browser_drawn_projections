import p5 from 'p5'
import { Entity, EntityList } from '@/stores/undoCommands'


//@ts-ignore
import Stats from 'stats.js/src/Stats'
import { Ramp } from '@/channels/channels'


type PulseCircleSerialized = {
  center: ({ x: number, y: number })
  rad: number
  color: {
    r: number
    g: number
    b: number
  },
  id: number
}

export class PulseCircle extends Entity {
  name: string
  x: number
  y: number
  rad: number
  color: {
    r: number
    g: number
    b: number
  }
  debugDraw: boolean = false

  event?: Ramp

  public serialize(): PulseCircleSerialized {
    const serialized: PulseCircleSerialized = {
      center: { x: this.x, y: this.y },
      rad: this.rad,
      color: this.color,
      id: this.id
    }
    return serialized
  }

  public hydrate(serialized: object): void {
    const parsed = serialized as PulseCircleSerialized
    this.x = parsed.center.x
    this.y = parsed.center.y
    this.rad = parsed.rad
    this.color = parsed.color
    this.id = parsed.id
  }

  constructor(x: number, y: number, rad: number, createId = true) {
    super(createId)
    this.x = x
    this.y = y
    this.rad = rad
    const r = () => Math.random()
    this.color = { r: r(), g: r(), b: r() }
    this.name = 'PulseCircle'
  }

  setStyle(p: p5) {
    const {r, g, b} = this.color
    p.stroke(r*255, g*255, b*255)
    p.fill(r*255, g*255, b*255)
    p.strokeWeight(15)
  }

  setDebugStyle(p: p5) {
    p.strokeWeight(1)
    p.stroke(255, 255, 255)
    p.fill(0, 0, 0, 0)
    p.textSize(20)
  }

  draw(p: p5) {
    if (this.debugDraw) {
      p.push()
      this.setDebugStyle(p)
      p.circle(this.x, this.y, this.rad)
      p.text(`id: ${this.id}`, this.x, this.y)
      p.pop()
    } else {
      if (this.event) {
        p.push()
        this.setStyle(p)
        p.circle(this.x, this.y, this.rad * this.event.val())
        p.pop()
      }
    }
  }

  trigger() {
    this.event?.cancel()
    this.event = new Ramp(1)
    this.event.onFinish = () => {
      this.event = undefined
    }
    this.event.trigger()
  }
}

const stats = new Stats();
stats.showPanel( 1 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );

export type ClickAVAppState = {
  circles: EntityList<PulseCircle>
  p5Instance: p5 | undefined
  threeRenderer: THREE.WebGLRenderer | undefined
  codeStack: (() => void)[]
  codeStackIndex: number
  drawFunctions: ((p5: p5) => void)[]
  oneTimeDrawFuncs: ((p5: p5) => void)[]
  drawFuncMap: Map<string, (p5: p5) => void>
  shaderDrawFunc: (() => void) | undefined
  stats: { begin: () => void, end: () => void }
  paused: boolean
  drawing: boolean
}

export const appState: ClickAVAppState = {
  circles: new EntityList(PulseCircle),
  p5Instance: undefined,
  threeRenderer: undefined,
  codeStack: [],
  codeStackIndex: 0,
  drawFunctions: [],
  oneTimeDrawFuncs: [],
  drawFuncMap: new Map<string, (p5: p5) => void>(),
  shaderDrawFunc: undefined,
  stats: stats,
  paused: false,
  drawing: false,
} 