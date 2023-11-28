import { defineStore, acceptHMRUpdate } from 'pinia'

//todo hotreload - save to localStorage to enable refresh when needed

export type sketchNames =
  'notInSet'

//todo sketch gallery - pull sketchStates map in App.vue based on menu selection
//   coordinating hot reload doesn't matter for external gallery
export const sketchStates: Record<sketchNames, any> = {
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