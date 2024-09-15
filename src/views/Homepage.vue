<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { sketchNames } from '@/router';

const specialSketchNames = ["clickAVMelodyLauncher", "tonePianoSequencer", "three5Example"]

const nonSpecialSketches = sketchNames.filter(name => !specialSketchNames.includes(name))

</script>

<template>
  <div class="homepage-wrapper">
    <div class="intro">
      <div class="section-title">Hello</div>
      <div>
        We are <a href="http://www.avneeshsarwate.com/">Avneesh Sarwate</a> and <a href="https://www.acrosspolyethylene.com/">Sumanth Srinivasan</a>
      </div>

      <br>

      <div>
        We are building tools for creating art in the browser. The source code and early experiments are
        <a href="https://github.com/avneeshsarwate/browser_drawn_projections">here</a>
      </div>

      <br>

      <div>
        If you want to read about the motivation and design of the library, you can read about it <a href="https://docs.google.com/presentation/d/1SzhiWNNl4-cxMOKpqOuUeGhP_3eecu0_Rg3aw3Hg2Kg">here</a>
      </div>
      
      <br>

    </div>
    <div class="sketchlist">
      <div class="section-title">Sketches</div>
      <div>
        Here are some sketches for the WIP library. They may be incomplete or buggy, but interesting nonetheless. They will improve over time.
        For now, they are best viewed on a desktop/laptop in Chrome or a Chromium-based browser.
      </div>
      <div class="sub-section-title">Sketches of note</div>
      <div class="sub-section-body">
        <div class="tool-highlight-item">
          <router-link :to="`/clickAVMelodyLauncher`" class="tool-highlight">An interactive melody player</router-link> — A simple example 
          that unifies musical sequencing and timing of visual events, and GPU driven post-processing in the same codebase. One of the core problems
          we are trying to address with our tool is the synchronization of musical and visual events with simple, intuitive tools. <a href="https://github.com/AvneeshSarwate/browser_drawn_projections/blob/main/src/sketches/clickAVMelodyLauncher/LivecodeHolder.vue">Source</a>. 
          This sketch also demonstrates our TouchDesigner-inspired API for shader-based post-processing (<a href="https://github.com/AvneeshSarwate/browser_drawn_projections/blob/main/src/sketches/clickAVMelodyLauncher/LivecodeHolder.vue#L133-L145">usage</a>, 
          <a href="https://github.com/AvneeshSarwate/browser_drawn_projections/blob/main/src/rendering/customFX.ts#L76">implementation entry point</a>).
        </div>
        <div class="tool-highlight-item">
          <router-link :to="`/tonePianoSequencer`" class="tool-highlight">An experimental sequencer</router-link> — Another example that coordinates musical sequencing,
          UI interaction, and animation all with the same codebase. <a href="https://github.com/AvneeshSarwate/browser_drawn_projections/blob/main/src/sketches/tonePianoSequencer/LivecodeHolder.vue">Source</a>
        </div>
        <div class="tool-highlight-item">
          <router-link :to="`/three5Example`" class="tool-highlight">p5.js + three.js</router-link> — Another goal of ours is to simplify the workflow for creating GPU driven
          animations that don't fall into the traditional 3D realm. This example shows our initial attempts at building a p5.js style API
          on top of three.js to enable a "power 2D" workflow  - eg, creating an API for simple 2D geometry drawing that also allows for easily integrating
          custom shaders and materials. The source can be found <a href="https://github.com/AvneeshSarwate/browser_drawn_projections/blob/main/src/rendering/three5.ts">here</a> and usage 
          can be seen <a href="https://github.com/AvneeshSarwate/browser_drawn_projections/blob/main/src/sketches/three5Example/LivecodeHolder.vue">here</a>.
        </div>
      </div>
      <div class="sub-section-title">Other sketches</div>
      <details>
        <summary>
          These sketches are proofs of concept of various engineering and API design challenges (click to expand).
        </summary>
        
        <div id="sketchList">
          <router-link v-for="sketchName in sketchNames" :key="sketchName" :to="`/${sketchName}`">
            <div> {{ sketchName }} </div>
          </router-link>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.homepage-wrapper {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  padding: 5% 10% 10% 10%;
  background-color: #fad6f8;
  color: #333;
  overflow: auto;
}

.section-title {
  color: #222;
  font-weight: bold;
  margin-bottom: 10px;
}

.sub-section-title {
  color: #5f5f5f;
  font-weight: bold;
  margin-bottom: 10px;
  margin-top: 20px;
}

/* .sub-section-body {
  margin-left: 2%;
} */

.intro {
  display: block;
  margin:24px;
  font-size: 16px;
  flex-basis: 0;
  flex-grow: 1;
}

.intro > div > a, #sketchList > a, .sketchlist > div > a, .sub-section-body > div > a {
  color: #333;
  text-decoration:underline;
  text-underline-offset: 8px;
  text-decoration-thickness: 1px; 
  text-decoration-color: #aaa;
}

.intro > div > a:hover, #sketchList > a:hover, .sketchlist > div > a:hover {
  color: #333;
  text-decoration:underline;
  text-underline-offset: 8px;
  text-decoration-thickness: 1px;
  text-decoration-color: #333; 
}

.sketchlist {
  margin:24px;
  flex-basis: 0;
  flex-grow: 1;
}

.tool-highlight-item {
  margin: 2% 0 2% 2%;
}

#sketchList {
  /* display: flex; */
  /* flex-direction: column; */
  display: grid;
  grid-template-columns: repeat(2, 1fr); /* Start with 1 column on mobile */
  gap: 4px; /* Add spacing between the links */
  list-style-type: none; /* Remove bullet points */
  padding: 0;
  margin-left: 10px;
  margin-top: 10px;
}

@media (max-width: 960px) {
  .homepage-wrapper {
    flex-direction: column;
  }

  #sketchList {
    grid-template-columns: repeat(1, 1fr);
  }
}

</style>