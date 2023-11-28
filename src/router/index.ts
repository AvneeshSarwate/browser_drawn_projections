import { createRouter, createWebHistory } from 'vue-router'
import DefaultApp from '../App.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: DefaultApp
    },
    {
      path: '/template',
      name: 'template',
      component: () => import('../sketches/template/SketchWrapper.vue')
    },
    {
      path: '/devTest',
      name: 'devTest',
      component: () => import('../sketches/devTest/SketchWrapper.vue')
    },
    {
      path: '/tonePianoSequencer',
      name: 'tonePianoSequencer',
      component: () => import('../sketches/tonePianoSequencer/SketchWrapper.vue')
    },
    {
      path: '/three5Example',
      name: 'three5Example',
      component: () => import('../sketches/three5Example/SketchWrapper.vue')
    },
    {
      path: '/clickAVMelodyLauncher',
      name: 'clickAVMelodyLauncher',
      component: () => import('../sketches/clickAVMelodyLauncher/SketchWrapper.vue')
    },
    {
      path: '/pianoRollMelodyLauncher',
      name: 'pianoRollMelodyLauncher',
      component: () => import('../sketches/pianoRollMelodyLauncher/SketchWrapper.vue')
    },
    {
      path: '/pianoRollLivecoding',
      name: 'pianoRollLivecoding',
      component: () => import('../sketches/pianoRollLivecoding/SketchWrapper.vue')
    },
    {
      path: '/multiPianoRollComposing',
      name: 'multiPianoRollComposing',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../sketches/multiPianoRollComposing/SketchWrapper.vue')
    }
  ]
})

export default router
