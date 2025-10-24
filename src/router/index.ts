import { createRouter, createWebHistory } from 'vue-router'
import Homepage from '../views/Homepage.vue'


export const sketchNames = [
  'template',
  'devTest',
  'tonePianoSequencer',
  'three5Example',
  'clickAVMelodyLauncher',
  'clickAVMelodyLauncherBabylon',
  'pianoRollMelodyLauncher',
  'pianoRollLivecoding',
  'multiPianoRollComposing',
  'abletonClipComposing',
  'shaderInstanceTest',
  'colorHelperTest',
  'generativePaths0',
  'generativeMusic_0',
  'generativeMusic_1',
  'generativeMusic_2',
  'musicAgentsTest',
  'refined_fundamentals',
  'runners_modifiers_0',
  'segmentedMotion_0',
  'squareTrails',
  'tldraw_test',
  'mpeDesignerTest',
  'voronoiTest',
  'oblique',
  'envelopeEditorTest',
  'p5sketch_0',
  'three5voronoi',
  'three5voronoiWebGPU',
  'synth_playground',
  'tldraw_sketch0',
  'fmSynthBasics',
  'nov21demo',
  'ishitaGestures',
  'scTimeTest',
  'faustSynthTest',
  'mutek_playground',
  'sonar_sketch',
  'draw_to_piano_roll',
  'polygonFill',
  'handwriting_animator',
  'fluidReactionSim',
  'vuePianoRoll',
  'fluidSimChat',
  'pianoRollChatbot'
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
