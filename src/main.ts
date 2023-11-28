import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)
app.use(router)

console.log("version 0")

app.mount('#app')
