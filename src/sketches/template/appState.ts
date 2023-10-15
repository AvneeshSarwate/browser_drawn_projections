import p5 from 'p5'
import { Entity, EntityList } from '@/stores/undoCommands'


//@ts-ignore
import Stats from 'stats.js/src/Stats'


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

class PulseCircle extends Entity {
  name: string
  x: number
  y: number
  rad: number
  color: {
    r: number
    g: number
    b: number
  }

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

  //todo template - set up debug draw mode/style

  setStyle(p: p5) {
    const {r, g, b} = this.color
    p.stroke(r*255, g*255, b*255)
    p.fill(r*255, g*255, b*255)
    p.strokeWeight(15)
  }

  draw(p: p5) {
    p.push()
    this.setStyle(p)
    p.circle(this.x, this.y, this.rad)
    p.pop()
  }
}

const stats = new Stats();
stats.showPanel( 1 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );

export type PulseCircleAppState = {
  circles: EntityList<PulseCircle>
  p5Instance: p5 | undefined
  threeRenderer: THREE.WebGLRenderer | undefined
  codeStack: (() => void)[]
  codeStackIndex: number
  drawFunctions: ((p5: p5) => void)[]
  stats: { begin: () => void, end: () => void }
  paused: boolean
}

export const appState: PulseCircleAppState = {
  circles: new EntityList(PulseCircle),
  p5Instance: undefined,
  threeRenderer: undefined,
  codeStack: [],
  codeStackIndex: 0,
  drawFunctions: [],
  stats: stats,
  paused: false
} 