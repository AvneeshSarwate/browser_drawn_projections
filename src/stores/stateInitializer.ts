import { ref } from 'vue'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { appState as templateAppState} from '@/sketches/template/appState';
import { appState as devAppState } from '@/sketches/devTest/developmentAppState';

//todo hotreload - save to localStorage to enable refresh when needed

const selectedState = templateAppState;

export const globalStore = defineStore('appState', () => {
  const appStateRef = ref(selectedState)

  //@ts-ignore
  window.appState = selectedState

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
}