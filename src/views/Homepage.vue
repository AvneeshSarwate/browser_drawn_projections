<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { sketchNames } from '@/router';

</script>

<template>
  <div class="intro">
    <div>
      We are <a href="http://www.avneeshsarwate.com/">Avneesh Sarwate</a> and <a href="https://www.acrosspolyethylene.com/">Sumanth Srinivasan</a>
    </div>

    <br>

    <div>
      We are building tools for creating art in the browser. The source code and early experiments are here
      <a href="https://github.com/avneeshsarwate/browser_drawn_projections">here</a>
    </div>

    <br>

    <div>
      If you want to read about the motivation and design of the library, you can read about it <a href="https://docs.google.com/presentation/d/1SzhiWNNl4-cxMOKpqOuUeGhP_3eecu0_Rg3aw3Hg2Kg">here</a>
    </div>
    
    <br>

    <div>
      Below is a set of demos for the creative coding library being developed. They may be incomplete or buggy, but hopefully interesting nonetheless. And they will improve over time.
      For the time being, they are best viewed on a desktop/laptop in the Chrome browser.
    </div>
    
    <br>
  </div>
  <div class="sketchlist">
    <div>Sketches:</div>
      <div id="sketchList">
        <router-link v-for="sketchName in sketchNames" :key="sketchName" :to="`/${sketchName}`">
          <div> {{ sketchName }} </div>
        </router-link>
    </div>
  </div>
</template>

<style scoped>
#sketchList {
  display: flex;
  flex-direction: column;
  margin-left: 10px;
}

.intro {
  width:80%;
  margin:24px;
}

.sketchlist {
  margin:24px;
}
</style>