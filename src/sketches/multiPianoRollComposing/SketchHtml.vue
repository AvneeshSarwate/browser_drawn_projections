<template>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <div id="monacoHolder"></div>
  <br>
  <details class="pianoFolder">
    <summary>piano roll 0</summary>
    <div id="phold0" class="pianoRollHolder"></div> <br>
  </details>
  <details class="pianoFolder">
    <summary>piano roll 1</summary>
    <div id="phold1" class="pianoRollHolder"></div> <br>
  </details>
  <details class="pianoFolder">
    <summary>piano roll 2</summary>
    <div id="phold2" class="pianoRollHolder"></div> <br>
  </details>
  <details class="pianoFolder">
    <summary>piano roll 3</summary>
    <div id="phold3" class="pianoRollHolder"></div> <br>
  </details>
  <ul id="pianoRollInstructions">
    <li>
        Note: this is currently only working with laptop trackpads - normal mouse behavior will be weird (to be fixed
        soon)
    </li>
    <li>
        Double click on an empty cell to add a note.
    </li>
    <li>
        Press the 1/2/3/4 keys to add notes of different lengths where your mouse is
    </li>
    <li>
        Click and drag a note to move it.
    </li>
    <li>
        Click and drag the circles at the ends of a note to resize it.
    </li>
    <li>
        Hold down Ctrl and move your mouse to scroll.
    </li>
    <li>
        Hold down Alt and move your mouse to zoom.
    </li>
    <li>
        Click and drag to highlight a selection. You can then drag/resize groups of notes. You can also hold down shift
        and click to add notes to a group selection.
    </li>
    <li>
        Hit backspace/delete to delete notes.
    </li>
    <li>
        Hit Cmd-z/Cmd+Shift+z to undo/redo note editing actions.
    </li>
    <li>
        Press the arrow keys to move selected notes.
    </li>
    <li>
        Use Cmd-c/Cmd-v to copy/paste note selections. Selections will be pasted at the vertical cursor position.
    </li>
  </ul>
  <div id="debugInfo"></div>
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