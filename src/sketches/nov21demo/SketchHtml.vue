<template>
  <br><br>
  <div id="description">
    <p>Example of a sketch with a custom TLDraw shape going through a shader post-processing pipeline with p5.js and three.js</p>
    <p>Tldraw instance on top.</p>
    <p>P5 sketch rendering the custom shape with some extra fun in the middle</p>
    <p>Shader post-processing with three.js on the bottom</p>
  </div>
  <div id="topPageControls"></div>
  <button @click="popupCanvas">Popup canvas</button>
  <h3>Tldraw instance</h3>
  <div id="tldrawContainer" ref="reactRoot"></div>
  <div id="selectedShapeIds">
    Selected shape ids: {{ selectedShapeIds }}
  </div>
  <div id="selectedShapeMetadata">
    <AutoUI :object-to-edit="selectedShapeMetadata" :post-edit-callback="updateSelectedShapeMetadata" />
  </div>
  <button @click="downloadSnapshot">Download snapshot</button>
  <div id="canvasContainer">
    <!-- <h3>P5 sketch rendering freehand tldraw shapes</h3> -->
    <!-- <br> -->
    <canvas id="p5Canvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
    <!-- <br> -->
    
    <div id="threeCanvasMarker" ></div>
    <h3>p5 js layer canvas</h3>
    <canvas id="debugCanvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
    <h3>three.js canvas</h3>
    <canvas id="threeCanvas" :width="resRef.width" :height="resRef.height" abitrary-prop="somethi"></canvas>
  </div>
  <div id="debugInfo"></div>
</template>

<script setup lang="ts">

import { onMounted, onBeforeUnmount, ref, inject, shallowRef, toRaw, reactive } from 'vue';
import { createRoot, type Root } from 'react-dom/client';
// import { MyTldrawWrapper, TestComponent, SimpleComponent } from './tldrawWrapper';
import { MyTldrawWrapper } from './tldrawWrapperPlain';
import { type Editor, type TLEditorSnapshot, type TLShape, type TLShapeId } from 'tldraw';
import { appStateName, type TldrawTestAppState, resolution } from './appState';
import { shapes } from './threeShapes';
import type { TreeRoot } from '@/stores/undoCommands';
import AutoUI from '@/components/AutoUI.vue';

const reactRoot = ref<HTMLElement | null>(null);
let root: Root | null = null;

const appState = inject<TldrawTestAppState>(appStateName)!!
let snapshotLoaded = false

const resRef = ref(resolution)

const threeCanvasMarker = ref<HTMLDivElement | null>(null)
let popupWindow: Window | null = null
const popupCanvas = () => {
  console.log("popup canvas")
  if(popupWindow && !popupWindow.closed) return
  popupWindow = window.open("", "popupWindow", `width=${resolution.width},height=${resolution.height}`)
  popupWindow.document.body.style.backgroundColor = "black"
  appState.threeRenderer.domElement.style.width = '100%'
  appState.threeRenderer.domElement.style.height = '100%'


  const fullscreenButton = popupWindow.document.createElement('button');
  fullscreenButton.innerText = 'Fullscreen';
  fullscreenButton.onclick = () => {
    const canvas = popupWindow.document.getElementById('threeCanvas');
    if (canvas) {
      canvas.requestFullscreen();
      fullscreenButton.style.display = 'none'
    }
  };
  popupWindow.document.body.appendChild(fullscreenButton);

  popupWindow.document.body.appendChild(appState.threeRenderer.domElement)

  //todo sketch - not working
  popupWindow.addEventListener("onbeforeunload", () => {
    threeCanvasMarker.value?.appendChild(appState.threeRenderer.domElement)
  })
}
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
    editor.loadSnapshot(shapes as Partial<TLEditorSnapshot>)
    
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
const defaultShapeMetadata = {
  prop1: "hello",
  prop2: 123,
}
const selectedShapeMetadata = reactive(defaultShapeMetadata)



const updateSelectedShapeMetadata = (metadata: TreeRoot) => {

  const metaCopy = structuredClone(toRaw(metadata))
  console.log("storage update", metadata, metadata.value, metaCopy)

  const shapeId = selectedShapeIds.value[0] as TLShapeId

  //@ts-ignore
  const editor: Editor = window.tldrawEditor
  if(editor && selectedShapeIds.value.length > 0) {
    editor.updateShapes([{
      id: shapeId,
      meta: metaCopy,
      type: "multiSegmentLine",
    }])
  }

  console.log('storage post set shape', editor.getShape(shapeId).meta)
}

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
      if(selectedShapeIds.value.length > 0) {
        //@ts-ignore
        const editor: Editor = window.tldrawEditor
        const shape = editor.getShape(selectedShapeIds.value[0] as TLShapeId)
        const origShapeMeta = shape.meta 
        const shapeMetadata = origShapeMeta ?? {}
        const shapeMetadataClone = structuredClone({...defaultShapeMetadata, ...shapeMetadata})
        console.log('storage shapeMetadataClone', selectedShapeIds.value[0], origShapeMeta, defaultShapeMetadata, shapeMetadataClone)
        // selectedShapeMetadata.value = shapeMetadataClone
        Object.assign(selectedShapeMetadata, shapeMetadataClone)
        console.log('storage post selected shape metadata', selectedShapeMetadata)

        /* todo meta auto ui
        - initial shape being selected is still wrong
        - when selecting a shape with no metadata after setting the metadata of another shape,
          the new shape shows old shape's metadata instead of the default metadata
          
        */
      }
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
  display: none;
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