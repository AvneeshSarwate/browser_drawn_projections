import p5 from 'p5'
import { Entity, EntityList } from '@/stores/undoCommands'


import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, type Ref } from 'vue'


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

type UIState = {
  noteWait: Ref<number>
  noteWaitUseLfo: Ref<boolean>
  velocity: Ref<number>
  velocityUseLfo: Ref<boolean>
  shuffleSeed: Ref<number>
  shuffleSeedUseLfo: Ref<boolean>
}

const uiInitState: UIState = {
  noteWait: ref(0.3),
  noteWaitUseLfo: ref(true),
  velocity: ref(100),
  velocityUseLfo: ref(true),
  shuffleSeed: ref(2),
  shuffleSeedUseLfo: ref(true),
}

export type TemplateAppState = {
  circles: EntityList<PulseCircle>
  p5Instance: p5 | undefined
  UIState: UIState,
  threeRenderer: THREE.WebGLRenderer | undefined
  codeStack: (() => void)[]
  codeStackIndex: number
  drawFunctions: ((p5: p5) => void)[]
  oneTimeDrawFuncs: ((p5: p5) => void)[]
  drawFuncMap: Map<string, (p5: p5) => void>
  shaderDrawFunc: (() => void) | undefined
  stats?: { begin: () => void, end: () => void }
  paused: boolean
  drawing: boolean
}

export const appState: TemplateAppState = {
  circles: new EntityList(PulseCircle),
  p5Instance: undefined,
  threeRenderer: undefined,
  UIState: uiInitState,
  codeStack: [],
  codeStackIndex: 0,
  drawFunctions: [],
  oneTimeDrawFuncs: [],
  drawFuncMap: new Map<string, (p5: p5) => void>(),
  shaderDrawFunc: undefined,
  stats: undefined,
  paused: false,
  drawing: false,
} 

export const appStateName = 'generativeMusic_0'

//todo api - add caching/rehydrating of appState from local storage

export const globalStore = defineStore(appStateName, () => {
  const appStateRef = ref(appState)

  //@ts-ignore
  window.appState = appStateRef

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
} 