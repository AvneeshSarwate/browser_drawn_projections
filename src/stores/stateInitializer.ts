import { ref } from 'vue'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { appState as templateAppState} from '@/sketches/template/appState';
import { appState as devAppState } from '@/sketches/devTest/developmentAppState';

//todo hotreload - save to localStorage to enable refresh when needed

export type sketchNames =
  'template' |
  'devTest'

//todo sketch gallery - pull sketchStates map in App.vue based on menu selection
//   coordinating hot reload doesn't matter for external gallery
export const sketchStates: Record<sketchNames, any> = {
  template: ref(templateAppState),
  devTest: ref(devAppState)
}

//todo sketch gallery - have this be a route instead of a query param? vue router?
export function getUrlSketch(): sketchNames {
  const urlParams = new URLSearchParams(window.location.search);
  const urlSketch = urlParams.get('sketchName') ?? 'template';
  return (urlSketch in sketchStates ? urlSketch : 'template') as sketchNames;
}

const selectedState = templateAppState;

export const globalStore = defineStore('appState', () => {
  const appStateRef = sketchStates[getUrlSketch()]

  //@ts-ignore
  window.appState = selectedState

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
}