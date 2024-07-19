<template>
  <br><br>
  <div id="description">
    <p>Tldraw-p5 "custom renderer" proof of concept (adapted from tldraw custom renderer example on the docs site)</p>
    <p>Tldraw instance on top.</p>
    <p>P5 sketch rendering freehand tldraw shapes in the middle</p>
    <p>Shader post-processing with three.js on the bottom</p>
  </div>
  <h3>Tldraw instance</h3>
  <div id="tldrawContainer" ref="reactRoot"></div>
  
  <div id="canvasContainer">
    <p><h3>P5 sketch rendering freehand tldraw shapes</h3></p>
    <br>
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <br>
    <p><h3>Shader post-processing with three.js</h3></p>
    <br>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <div id="debugInfo"></div>
</template>

<script setup lang="ts">

import { onMounted, onBeforeUnmount, ref, inject } from 'vue';
import { createRoot, type Root } from 'react-dom/client';
// import { MyTldrawWrapper, TestComponent, SimpleComponent } from './tldrawWrapper';
import { MyTldrawWrapper } from './tldrawWrapperPlain';
import { type Editor, type TLEditorSnapshot } from 'tldraw';
import { appStateName, type TldrawTestAppState } from './appState';
import { snapshot1 } from './snapshot1';
import { snapshot2 } from './snapshot2';

const reactRoot = ref<HTMLElement | null>(null);
let root: Root | null = null;

const appState = inject<TldrawTestAppState>(appStateName)!!
let snapshotLoaded = false

//todo sketch - this can be handled with react hooks instead of a flag (see link below)
//can also replace the CustomRenderer component with this
//alternatively, could use the custom renderer component to display element names next to the elements
//something like this - https://tldraw.dev/examples/editor-api/store-events
const handleEditorReady = (editor: Editor) => {
  if(!snapshotLoaded) {
    console.log('Editor is ready:', editor);
    appState.tldrawEditor = editor

    //@ts-ignore
    editor.loadSnapshot(snapshot2 as Partial<TLEditorSnapshot>)
    
    // editor.getSnapshot()
    snapshotLoaded = true
  }
  // You can store it in a reactive property or use it directly
};

onMounted(() => {
  console.log('reactRoot.value', reactRoot.value);
  if (reactRoot.value) {
    root = createRoot(reactRoot.value);
    // const tldrawInstance = <MyTldrawWrapper onEditorReady={handleEditorReady} />;
    root.render(MyTldrawWrapper({ onEditorReady: handleEditorReady }));
    reactRoot.value.onmouseup = () => {
      console.log("mouse up")
      appState.tldrawInteractionCount++
    }
  }
});

onBeforeUnmount(() => {
  if (root) {
    root.unmount();
  }
});

</script>


<style scoped>
#canvasContainer {
  background-color: black;
}

#p5Canvas {
  border: 1px solid black;
  /* position: absolute; */
  /* top: 0;
  left: 0;
  z-index: -1; */
  /* visibility: hidden; */
}

h3 {
  background-color: white;
}

#threeCanvas {
  border: 1px solid black;
  /* position: absolute;
  top: 0;
  left: 0; */
  /* visibility: visible; */
  /* display: none; */
}


#tldrawContainer {
  border: 1px solid black;
  width: 1280px;
  height: 720px;
  visibility: visible;
}
</style>