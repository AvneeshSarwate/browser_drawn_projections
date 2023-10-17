import { ref } from 'vue'
import { defineStore, acceptHMRUpdate } from 'pinia'
import { appState } from '@/sketches/template/appState';



const selectedState = appState;

export const globalStore = defineStore('appState', () => {
  const appStateRef = ref(selectedState)

  //@ts-ignore
  window.appState = selectedState

  return { appStateRef }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(globalStore, import.meta.hot))
}