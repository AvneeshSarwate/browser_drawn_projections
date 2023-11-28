import p5 from 'p5'
import * as Tone from 'tone'
import { Entity, EntityList } from '@/stores/undoCommands'


//@ts-ignore
import Stats from 'stats.js/src/Stats'
import { Ramp } from '@/channels/channels'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'


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
        p.circle(this.x, this.y, 10 + this.rad * (1-this.event.val()))
        p.pop()
      } else {
        p.push()
        this.setStyle(p)
        p.circle(this.x, this.y, 10)
        p.pop()
      }
    }
  }

  trigger() {
    this.event?.cancel()
    this.event = new Ramp(0.6)
    this.event.onFinish = () => {
      this.event = undefined
    }
    this.event.trigger()
  }
}

const stats = new Stats();
stats.showPanel( 1 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );

export const sampler = new Tone.Sampler({
  "A0": "A0.[mp3|ogg]",
  "C1": "C1.[mp3|ogg]",
  "D#1": "Ds1.[mp3|ogg]",
  "F#1": "Fs1.[mp3|ogg]",
  "A1": "A1.[mp3|ogg]",
  "C2": "C2.[mp3|ogg]",
  "D#2": "Ds2.[mp3|ogg]",
  "F#2": "Fs2.[mp3|ogg]",
  "A2": "A2.[mp3|ogg]",
  "C3": "C3.[mp3|ogg]",
  "D#3": "Ds3.[mp3|ogg]",
  "F#3": "Fs3.[mp3|ogg]",
  "A3": "A3.[mp3|ogg]",
  "C4": "C4.[mp3|ogg]",
  "D#4": "Ds4.[mp3|ogg]",
  "F#4": "Fs4.[mp3|ogg]",
  "A4": "A4.[mp3|ogg]",
  "C5": "C5.[mp3|ogg]",
  "D#5": "Ds5.[mp3|ogg]",
  "F#5": "Fs5.[mp3|ogg]",
  "A5": "A5.[mp3|ogg]",
  "C6": "C6.[mp3|ogg]",
  "D#6": "Ds6.[mp3|ogg]",
  "F#6": "Fs6.[mp3|ogg]",
  "A6": "A6.[mp3|ogg]",
  "C7": "C7.[mp3|ogg]",
  "D#7": "Ds7.[mp3|ogg]",
  "F#7": "Fs7.[mp3|ogg]",
  "A7": "A7.[mp3|ogg]",
  "C8": "C8.[mp3|ogg]"
}, {
  "release": 1,
  "baseUrl": "salamander/"
}).toDestination();


export type ToneSeqAppState = {
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

export const appState: ToneSeqAppState = {
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

export const globalStore = defineStore('appState', () => {
  const appStateRef = ref(appState)

  //@ts-ignore
  window.appState = appStateRef

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
} 