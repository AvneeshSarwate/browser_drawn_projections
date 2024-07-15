import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import core from '@theatre/core'
import studio from '@theatre/studio'
import { getProject, types } from '@theatre/core';

//todo - move this initialization into the sketches themselves
// studio.initialize()
// studio.ui.hide()

const app = createApp(App)

const pinia = createPinia()

app.use(pinia)
app.use(router)

console.log("version 0")

app.mount('#app')
