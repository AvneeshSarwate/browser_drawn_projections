<template>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <div>
    click anywhere to start a loop. Press the "c" key to clear all loops. Press the "u" key to clear the last loop
  </div>
  <div>
    The y controls the pitch, and the x coordinate controls the loop speed
  </div>
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
</style>