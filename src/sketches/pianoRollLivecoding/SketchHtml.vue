<template>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <ul>
    <li>
      click anywhere to start a loop. Press the "c" key to clear all loops. Press the "u" key to clear the last loop
    </li>
    <li>
      The notes in the piano roll determine the notes in the launched loop, and the x coordinate of your click controls the loop speed, and the y coordinate the loop volume
    </li>
    <li>
      instructions for manipulating the piano roll are below the piano roll
    </li>
    <li>
      When a note is played, the code in the editor is executed as a callback - if you change the code, the next loop you trigger will use the new code
    </li>
  </ul>
  <div id="monacoHolder"></div>
  <br>
  <div id="pianoRollHolder"></div>
  <div>
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

/* #pianoRollInstructions {
  display: none;
} */

#monacoHolder {
  width: 640px;
  height: 360px;
}
</style>