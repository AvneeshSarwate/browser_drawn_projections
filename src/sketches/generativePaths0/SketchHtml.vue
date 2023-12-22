<template>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <div id="instructions">
    press "d" to enter/leave draw mode <br>
    press space to add a new point <br>
    press "c" to toggle the point-debug view <br>
    press "v" to toggle viewing the lines <br>
    press "s" to select the circle nearest the mouse - if a cirlce is selected, the next adding point will be after the selected point in the path (and then that newly added point will be selected). <br>
    pressing "s" when your mouse is closest to the selected circle will deselect it and return point-addition to the end of the list <br>
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

#instructions {
  margin-left: 10px;
}

#threeCanvas {
  border: 1px solid black;
  position: absolute;
  top: 0;
  left: 0;
  visibility: visible;
}
</style>