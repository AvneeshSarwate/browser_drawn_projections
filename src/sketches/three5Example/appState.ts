import p5 from 'p5'
import { Entity, EntityList } from '@/stores/undoCommands'


//@ts-ignore
import Stats from 'stats.js/src/Stats'
import { Ramp } from '@/channels/channels'
import { defineStore, acceptHMRUpdate } from 'pinia';
import { ref } from 'vue';




const stats = new Stats();
stats.showPanel( 1 ); // 0: fps, 1: ms, 2: mb, 3+: custom
document.body.appendChild( stats.dom );

export type Three5ExAppState = {
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

export const appState: Three5ExAppState = {
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