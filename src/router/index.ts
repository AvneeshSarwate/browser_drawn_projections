import { createRouter, createWebHistory } from 'vue-router'
import Homepage from '../views/Homepage.vue'


export const sketchNames = [
  'template',
  'devTest',
  'tonePianoSequencer',
  'three5Example',
  'clickAVMelodyLauncher',
  'pianoRollMelodyLauncher',
  'pianoRollLivecoding',
  'multiPianoRollComposing',
  'abletonClipComposing'
]

const sketchRoutes = sketchNames.map(name => {
  return {
    path: `/${name}`,
    name: name,
    // route level code-splitting
    // this generates a separate chunk (About.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(`../sketches/${name}/SketchWrapper.vue`)
  }
})

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Homepage
    },
    ...sketchRoutes
  ]
})

export default router
