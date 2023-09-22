import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)

app.mount('#app')


//alternative way to trigger rendering on state change
// store.$subscribe((mutation, state) => {
//   console.log('subscribe store')
//   render(state.appStateRef as AppState)
// })


//todo - why does canvas not render on first load?

// render(appState)

// setTimeout(() => {
//   window.requestAnimationFrame(() => render(appState))
// }, 100)
