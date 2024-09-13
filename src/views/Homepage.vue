<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { sketchNames } from '@/router';

</script>

<template>
  <div class="homepage-wrapper">
    <div class="intro">
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
      <!-- <div>Sketches:</div> -->
      <div>
        Here is a set of demos for the WIP coding library. They may be incomplete or buggy, but hopefully interesting nonetheless. And they will improve over time.
        For the time being, they are best viewed on a desktop/laptop in the Chrome browser.
      </div>
      <div id="sketchList">
        <router-link v-for="sketchName in sketchNames" :key="sketchName" :to="`/${sketchName}`">
          <div> {{ sketchName }} </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.homepage-wrapper {
  display: flex;
  flex-direction: row;
  width: 100%;
  padding: 0 10% 0 10%;
  background-color: #fad6f8;
  color: #333;
  overflow: auto;
}

.intro {
  display: block;
  width:50%;
  margin:24px;
  font-size: 16px;
}

.intro > div > a, #sketchList > a {
  color: #333;
  text-decoration:underline;
  text-underline-offset: 8px;
  text-decoration-thickness: 1px; 
  text-decoration-color: #aaa;
}

.intro > div > a:hover, #sketchList > a:hover {
  color: #333;
  text-decoration:underline;
  text-underline-offset: 8px;
  text-decoration-thickness: 1px;
  text-decoration-color: #333; 
}

.sketchlist {
  margin:24px;
  width: 50%;
}

#sketchList {
  display: flex;
  flex-direction: column;
  margin-left: 10px;
  margin-top: 10px;
}

</style>