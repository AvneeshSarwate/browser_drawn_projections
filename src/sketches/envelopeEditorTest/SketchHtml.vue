<script setup lang="ts">
import { ref } from 'vue';


const toggleEnvelopeEditor = ref(false)
const togglePianoRoll = ref(true)

</script>

<template>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi" tabindex="0"></canvas>
  </div>
  <div id="description">
    <p>Press D to enter draw mode</p>
    <p>Press S to add a circle</p>
    <p>Press F to animate the circle arrangement</p>
  </div>
  <input id="toggleEnvelopeEditor" type="checkbox" v-model="toggleEnvelopeEditor" />
  <label for="toggleEnvelopeEditor">Toggle Envelope Editor</label>
  <input id="togglePianoRoll" type="checkbox" v-model="togglePianoRoll">
  <label for="togglePianoRoll">Toggle Piano Roll</label>
  <div id="debugInfo"></div>
  <div id="pianoEnvelopeHolder">
    <div id="pianoRollHolder" :style="togglePianoRoll ? {visibility: 'visible'} : {visibility: 'hidden'}"></div>
    <div id="envelopeEditorContainer" :style="toggleEnvelopeEditor ? {visibility: 'visible'} : {visibility: 'hidden'}">
      <div id="envelopeEditor" tabindex="1"></div>
    </div>
  </div>
</template>


<style scoped>
#canvasContainer {
  background-color: black;
}

#p5Canvas {
  border: 1px solid black;
  /* position: absolute; */
  top: 0;
  left: 0;
  z-index: -1;
  visibility: hidden;
}

#threeCanvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
  visibility: visible;
}

#pianoEnvelopeHolder {
  position: relative;
}

#envelopeEditorContainer {
  /* display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center; */
  position: absolute;
  top: 0;
  left: 0;
}

#pianoRollHolder {
  position: absolute;
  top: 0;
  left: 0;
}

</style>