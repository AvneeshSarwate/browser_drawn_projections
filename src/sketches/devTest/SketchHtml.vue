<script setup lang="ts">
const blockRockingUrl = './count_10_av_60fps.mp4';
// import blockRockingUrl from './block_rocking.mp4';
// const blockRockingUrl = new URL(`/block_rocking.mp4`, import.meta.url).href
</script>

<template>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <video id="video" width="640" height="360" controls :src="blockRockingUrl"></video>
  <div id="wavesurferHolder"></div>
  <button id="wavesurferPlay">Play/Pause</button>
  <div id="debugInfo"></div>
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

#video {
  /* display: none; */
}
</style>