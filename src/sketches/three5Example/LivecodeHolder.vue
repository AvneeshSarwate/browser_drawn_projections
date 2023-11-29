<script setup lang="ts">
import { appStateName, type Three5ExAppState } from './appState';
import { inject, onMounted, onUnmounted } from 'vue';
import { clearListeners, singleKeydownEvent } from '@/io/keyboardAndMouse';
import { sinN, now, steps } from '@/channels/channels';
import { Three5 } from '@/rendering/three5';
import { LineStyle } from '@/rendering/three5Style';
import * as THREE from 'three';
import { FPS } from '@/rendering/fps';


const fps = new FPS()

const appState = inject<Three5ExAppState>(appStateName)!!

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

let three5i: Three5 | undefined = undefined


onMounted(() => {
  try {

    three5i = new Three5(1280, 720)

    const code = () => {
      clearDrawFuncs()
      

      const wave = (t: number) => sinN(now() / 20 + t * 4) * 400 + 200
        const sinColor = (t: number) => [sinN(now() / 10 + t * 4), sinN(now() / 10 + t * 3), 0]

        const lineStyle = new LineStyle()
        
        appState.drawFunctions.push(() => {
          let n = 100
          const sinX = steps(0, 1, n).map(wave)
          three5i!!.useStroke = false
          for (let i = 0; i < n; i++) {
            const c1 = new THREE.Color(...sinColor(i / n))
            const c2 = new THREE.Color(...sinColor((i + 1) / n))

            if (i % 2 == 0) {
              const mat2 = three5i!!.createGradientMaterial(c1, c2, 0, 10, 0)
              three5i!!.setMaterial(mat2)
            } else {
              lineStyle.uniforms.time = now() + i / n * Math.PI
              three5i!!.setStyle(lineStyle)
            }
           
            three5i!!.circle(i/n * 1280, sinX[i], 40)
          }
        })

        for (let c = 0; c < 5; c++) {
          let n = 100
          appState.drawFunctions.push(() => {
            // return
            const sinX = steps(0, 1, n).map(wave)
            const pts = steps(0, n, n).map(n => Math.round(n)).map(i => new THREE.Vector2(i/n * 1280, sinX[i] - c * 10 + 100))

            three5i!!.curve(pts)
          })
        }

        appState.drawFunctions.push(_ => three5i!!.render(appState.threeRenderer!!))


        appState.drawFunctions.push(() => {
          fps.frame()
        })
      
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    code() 
  } catch (e) {
    console.warn(e)
  }
})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  clearListeners()
  three5i?.dispose()
  fps.remove()
})

</script>

<template>
  <div></div>
</template>

<style scoped></style>