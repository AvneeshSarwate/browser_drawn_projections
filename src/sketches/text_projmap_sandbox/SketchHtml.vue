<script setup lang="ts">
import { ref } from 'vue';
import { resolution } from './appState'
import PopoutWindow from '@/components/PopoutWindow.vue'

const resRef = ref(resolution)

const dpr = window.devicePixelRatio || 1
const popped = ref(false)
</script>

<template>
  <div class="canvas-page">
    <PopoutWindow v-model="popped" title="Canvas" :width="resRef.width" :height="resRef.height">
      <div id="canvasContainer" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}">
        <canvas id="p5Canvas" :width="resRef.width * dpr" :height="resRef.height * dpr" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}" abitrary-prop="somethi"></canvas>
        <canvas id="threeCanvas" :width="resRef.width * dpr" :height="resRef.height * dpr" :style="{width: resRef.width + 'px', height: resRef.height + 'px'}" abitrary-prop="somethi"></canvas>
      </div>
    </PopoutWindow>
    <div id="description">
      <ul>
        <li>Below (the canvas below these instructions) is a simple vector drawing canvas. It supports drawing polygons, freehand lines, and circles</li>
        <li>There are 4 tools - freehand, polygon, circle, and select. The first 3 let you draw shapes of the corresponding type. The last one lets you select and move/rotate/scale individual shapes</li>
        <li>This demo app lets you draw polygons in the canvas below, and for each polygon, the app will automatically render an animated text layout area in the top canvas (above these instructions). Freehand lines and circles don't get rendered to the top.</li>
        <li>For each shape, you can select it to see it's metadata - there are menus that let you control the text styling and animation parameters for each shape</li>
        <li>To draw polygons, select the polygon tool, and then click on the canvas to add points. Press the end shape button (or escape key) to end the polygon - it will autoclose (or press cancel shape to delete the in progress polygon)</li>
        <li>To drag polygons around or stretch and rotate them, use the select tool - click on them an a transform handle will appear for rotation/stretch</li>
        <li>To edit the actual shape of the polygon, use the polygon tool and make sure you've selected Edit Shape. You can drag individual points around, or click to add new points where the green highlight shows they will be added</li>
      </ul>
    </div>
    <div id="debugInfo"></div>
  </div>
</template>


<style scoped>
.canvas-page {
  /* min-height: 100vh; */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
}

#canvasContainer {
  position: relative;
  background-color: black;
  display: inline-block;
}

#canvasContainer canvas {
  display: block;
  position: absolute;
  top: 0;
  left: 0;
}

#p5Canvas {
  border: 1px solid black;
  z-index: 0;
  visibility: hidden;
}

#threeCanvas {
  border: 1px solid black;
  z-index: 1;
  visibility: visible;
}

#description {
  max-width: 850px;
  font-size: 14px;
  line-height: 1.3;
  color: #333;
}

#description ul {
  margin: 0;
  padding-left: 20px;
  text-align: left;
}

#description li {
  margin: 0 0 6px 0;
}

#description li:last-child {
  margin-bottom: 0;
}
</style>
