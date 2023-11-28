import { ref } from 'vue'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { appState as three5ExampleState } from '@/sketches/three5Example/appState';
import { appState as clickAVMelodyLauncherState } from '@/sketches/clickAVMelodyLauncher/appState';
import { appState as pianoRollMelodyLauncherState } from '@/sketches/pianoRollMelodyLauncher/appState';
import { appState as pianoRollLivecodingState } from '@/sketches/pianoRollLivecoding/appState';

//todo hotreload - save to localStorage to enable refresh when needed

export type sketchNames =
  'notInSet' |
  'three5Example' |
  'clickAVMelodyLauncher' |
  'pianoRollMelodyLauncher' |
  'pianoRollLivecoding'

//todo sketch gallery - pull sketchStates map in App.vue based on menu selection
//   coordinating hot reload doesn't matter for external gallery
export const sketchStates: Record<sketchNames, any> = {
  three5Example: ref(three5ExampleState),
  clickAVMelodyLauncher: ref(clickAVMelodyLauncherState),
  pianoRollMelodyLauncher: ref(pianoRollMelodyLauncherState),
  pianoRollLivecoding: ref(pianoRollLivecodingState),
  notInSet: "notInSet"
}

//todo sketch gallery - have this be a route instead of a query param? vue router?
export function getUrlSketch(): sketchNames {
  const urlParams = new URLSearchParams(window.location.search);
  const urlSketch = urlParams.get('sketchName') ?? 'notInSet';
  return (urlSketch in sketchStates ? urlSketch : 'notInSet') as sketchNames;
}

export const globalStore = defineStore('appState', () => {
  const appStateRef = sketchStates[getUrlSketch()]

  //@ts-ignore
  window.appState = appStateRef

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
}