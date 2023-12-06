<template>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
</template>


<style scoped>
#canvasContainer {
  background-color: black;
  display: none;
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

#pianoRollInstructions {
  display: none;
}

.pianoFolder,
.pianoRollHolder {
  margin-left: 20px;
}

#monacoHolder {
  width: 640px;
  height: 360px;
  display: none;
}
</style>