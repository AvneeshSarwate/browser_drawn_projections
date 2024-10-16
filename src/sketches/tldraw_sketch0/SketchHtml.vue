<template>
  <br><br>
  <div id="description">
    <p>Example of a sketch with a custom TLDraw shape going through a shader post-processing pipeline with p5.js and three.js</p>
    <p>Tldraw instance on top.</p>
    <p>P5 sketch rendering the custom shape with some extra fun in the middle</p>
    <p>Shader post-processing with three.js on the bottom</p>
  </div>
  <h3>Tldraw instance</h3>
  <div id="tldrawContainer" ref="reactRoot"></div>
  <div id="selectedShapeIds">
    Selected shape ids: {{ selectedShapeIds }}
  </div>
  <button @click="downloadSnapshot">Download snapshot</button>
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

import { onMounted, onBeforeUnmount, ref, inject, shallowRef } from 'vue';
import { createRoot, type Root } from 'react-dom/client';
// import { MyTldrawWrapper, TestComponent, SimpleComponent } from './tldrawWrapper';
import { MyTldrawWrapper } from './tldrawWrapperPlain';
import { type Editor, type TLEditorSnapshot } from 'tldraw';
import { appStateName, type TldrawTestAppState } from './appState';
import { snapshot2 } from './snapshots';

const reactRoot = ref<HTMLElement | null>(null);
let root: Root | null = null;

const appState = inject<TldrawTestAppState>(appStateName)!!
let snapshotLoaded = false



//todo sketch - this can be handled with react hooks instead of a flag (see link below)
//can also replace the CustomRenderer component with this
//alternatively, could use the custom renderer component to display element names next to the elements
//something like this - https://tldraw.dev/examples/editor-api/store-events
//Could also use this - https://tldraw.dev/reference/editor/Editor#getSelectedShapeIds to grab the ids of the selected shapes
const handleEditorReady = (editor: Editor) => {
  // return //todo bug - wrapping the editor in ref or shallow ref causes issues with keyboard events
  if(!snapshotLoaded) {
    console.log('Editor is ready:', editor);
    // appState.tldrawEditor = shallowRef({ed: editor})

    //@ts-ignore
    window.tldrawEditor = editor

    //@ts-ignore
    window.editorReadyCallback?.(editor)

    console.log('shape ids', editor.getCurrentPageShapeIds())
  
    //@ts-ignore
    editor.loadSnapshot(snapshot2 as Partial<TLEditorSnapshot>)
    
    // editor.getSnapshot()
    snapshotLoaded = true
  }
  // You can store it in a reactive property or use it directly
};

const downloadSnapshot = () => {
  //@ts-ignore
  const snapshot = window.tldrawEditor?.getSnapshot()
  const snapshotString = JSON.stringify(snapshot)

  //download the string as a file
  const blob = new Blob([snapshotString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `snapshot_${new Date().toISOString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

const selectedShapeIds = ref<string[]>([])

onMounted(() => {
  console.log('reactRoot.value', reactRoot.value);
  if (reactRoot.value) {
    root = createRoot(reactRoot.value);
    // const tldrawInstance = <MyTldrawWrapper onEditorReady={handleEditorReady} />;
    root.render(MyTldrawWrapper({ onEditorReady: handleEditorReady, persistenceKey: appStateName }));
    reactRoot.value.onmouseup = () => {
      // console.log("mouse up")
      appState.tldrawInteractionCount++

      //@ts-ignore
      selectedShapeIds.value = window.tldrawEditor?.getSelectedShapeIds() ?? []
    }
    reactRoot.value.onmouseout = () => {
      appState.tldrawEditor?.value?.ed.blur()
    }
    reactRoot.value.onmousedown = () => {
      // reactRoot.value.focus()
      // appState.tldrawEditor.focus()
      // console.log('focus editor attempt', appState.tldrawEditor.getIsFocused(), reactRoot.value)
    }
    reactRoot.value.onkeydown = (e) => {
      // console.log('react base keydown', e.key)
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