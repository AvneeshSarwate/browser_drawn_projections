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
  <div id="debugInfo"></div>
  <div id="pianoEnvelopeHolder">
    <div id="pianoRollHolder"></div>
    <div id="envelopeEditorContainer">
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