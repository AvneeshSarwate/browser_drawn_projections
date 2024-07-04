<template>
  <div id="tldrawContainer" ref="reactRoot"></div>
  <div id="canvasContainer">
    <canvas id="p5Canvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
    <canvas id="threeCanvas" width="1280" height="720" abitrary-prop="somethi"></canvas>
  </div>
  <div id="description">
    <p>Press D to enter draw mode</p>
    <p>Press S to add a circle</p>
    <p>Press F to animate the circle arrangement</p>
  </div>
  <div id="debugInfo"></div>
</template>

<script setup lang="ts">

import { onMounted, onBeforeUnmount, ref, inject } from 'vue';
import { createRoot, type Root } from 'react-dom/client';
// import { MyTldrawWrapper, TestComponent, SimpleComponent } from './tldrawWrapper';
import { MyTldrawWrapper } from './tldrawWrapperPlain';
import { type Editor } from 'tldraw';
import { appStateName, type TldrawTestAppState } from './appState';

const reactRoot = ref<HTMLElement | null>(null);
let root: Root | null = null;

const appState = inject<TldrawTestAppState>(appStateName)!!

const handleEditorReady = (editor: Editor) => {
  // Use the editor instance in your Vue app
  console.log('Editor is ready:', editor);
  appState.tldrawEditor = editor
  // You can store it in a reactive property or use it directly
};

onMounted(() => {
  console.log('reactRoot.value', reactRoot.value);
  if (reactRoot.value) {
    root = createRoot(reactRoot.value);
    // const tldrawInstance = <MyTldrawWrapper onEditorReady={handleEditorReady} />;
    root.render(MyTldrawWrapper({ onEditorReady: handleEditorReady }));
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

#threeCanvas {
  border: 1px solid black;
  /* position: absolute;
  top: 0;
  left: 0; */
  /* visibility: visible; */
  display: none;
}


#tldrawContainer {
  border: 1px solid black;
  width: 1280px;
  height: 720px;
  visibility: visible;
}
</style>