<script setup lang="ts">
import { Region, type AppState } from '@/stores/stores';
import p5 from 'p5';
import { inject, onMounted, onUnmounted } from 'vue';
import * as a from '@/rendering/planeAnimations'
import { groupedAnimation0 } from '@/rendering/modularizedTransforms';


const appState = inject('appState') as AppState  

const reg = (i: number) => appState.regions.list[i] 

const cornerPts = (reg: Region, p5: p5) => {
  reg.points.list.forEach(p => {
    p5.circle(p.x, p.y, 10)
  })
}

const aseq = (animations: a.AnimationSegment[]) => {
  return new a.AnimationSeq(animations)
}

const resetRegions = () => {
  appState.regions.list.forEach(r => r.resetDrawState())
}


onMounted(() => {
  try {
    if (appState.p5Instance && appState.regions.list.length > 0) {


      const code = () => {
        resetRegions()
        reg(0).activate()
        reg(1).activate()
        // reg(0).draw2 = cornerPts



        // const lr = a.lrLine(.52)
        // const rl = a.rlLine(.52)
        // const zi = a.zoomIn(1.52)
        // const zo = a.zoomOut(1.52)
        // //todo - need some api for these so you don't have to specify
        // //the region index twice (once on creation and once on assignment)
        // const dots = new a.PerimiterDots(reg(0), 10).anim(2.52)
        // reg(0).animationSeq = aseq([dots, rl, lr])
        groupedAnimation0(appState, reg(0)) //the function below holds the above code in a diff file

        " " //a way to add "spacing" when reading eval'd code


        console.log("code ran")
      }


      //can access this from browser console as well to rerun code
      appState.codeStack.push(code)
      code()



      // const codeStr = code.toString()
      // const decodeAndRun = () => {
      //   eval(codeStr)()
      //   console.log("decoding code", codeStr)
      // }
      // setTimeout(decodeAndRun, 2000)
    }
  } catch (e) {
    console.log(e)
  }

})

/*
more ideas
- make "blocks" of code undoable?
 - would involve making property assignments automatically undoable, or
   having a cleaner api for assigning undoable properties
   (maybe just setters for props that need undo, with a _ suffix indicating undiability)
- have undo-tree instead of undo stack and then automatic tree walking sequencers
- can call some disableAll() function at the start of your script that turns off all regions 
  so that you can know that your script defines "everything" on the screen
- can have other types of "drawable objects" that you livecode as well, instead of just 
  "plane-animations" (eg, like gesture loops)
- if you can save and recall scripts, they can be like "scenes" - 
  if you really want, can even snapshot a thumbnail and have a scene selector UI


- create a "modal drawing" interface with mouse and keyboard - different keys for different
  drawing modes, and also a way to record loops of drawing and play them back
  - also be able to save and load these loops to file, create transformed instances of them
    - go back to "delta list" format for saving gestures to enable this

- create the equivalent of CHOPs to provide data sources for animations
  - need to think about rethink the API for animation segments
    - abstractions shouldn't be too deep for newcomers to author their own 
    - need to be able to bind more generally to any kind of "drawable object"
      - or at least, need to provide type-safety so you can't bind to the wrong thing
  - figure out how to bind chops to fx parameters
  - figure out how to bind chops to live inputs (mouse, keyboard, midi, etc)
  - create equivalents for event-chop and timer chop

- think about an API for transport controls
  - play, pause, stop, loop, etc
  - also, how to bind to these from chops
  - also, how to bind to these from live inputs (mouse, keyboard, midi, etc)
  - Use tone.js transport?

- incorporate theater.js for timelining things?

- port over Kotlin structured-timing-loops API into typescript
  - use tone.js transport for reference timing
  - implement branch() and wait() functions 

- look into using advanced typescript types to provide more robust way to access
  channel names for things like event chop where you can have arbitrary metadata

- practical steps
  - make animations triggerable
    - do this by having animations run off of an event chop?
      - have animations take an array of phase values instead of a single one, and
        run their animation for each val - makes them auto-instancing  

*/

onUnmounted(() => {

})


</script>

<template>
  <div></div>
</template>

<style scoped></style>