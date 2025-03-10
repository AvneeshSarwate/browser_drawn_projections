<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TldrawTestAppState, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, now } from '@/channels/channels';
import { getEllipseShapes, getFreehandShapes, getMultiSegmentLineShapes, getTransformedShapePoints, p5FreehandTldrawRender } from './tldrawWrapperPlain';
import { CompositeShaderEffect, HorizontalBlur, LayerBlend, Transform, VerticalBlur } from '@/rendering/customFX';
import AutoUI from '@/components/AutoUI.vue';
import { lerp, type Editor, type TLPageId } from 'tldraw';
import earcut from 'earcut';
import type { MultiSegmentLineShape } from './multiSegmentLine/multiSegmentLineUtil';

const appState = inject<TldrawTestAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const launchLoop = (block: (ctx: TimeContext) => Promise<any>): CancelablePromisePoxy<any> => {
  const loop = launch(block)
  timeLoops.push(loop)
  return loop
}

const clearDrawFuncs = () => {
  appState.drawFunctions = []
  appState.drawFuncMap = new Map()
}

const drawParams = ref({
  showLines: true,
  showCircles: true, 
  showConnectors: true
})

const rand = (n: number) => sinN(n*123.23)

const randColor = (seed: number) => {
  return {
    r: rand(seed) * 255,
    g: rand(seed + 1) * 255,
    b: rand(seed + 2) * 255,
    a: 1
  }
}

const shapeRenderMap = new Map<string, { drawFunc: (p5: p5) => void, shaderGraphEndNode: ShaderEffect }>()

onMounted(() => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement
    let tldrawCamera = {x: 0, y: 0, z: 1}

    const onShapeCreated = (shapee: MultiSegmentLineShape) => {
      console.log("onShapeCreated", shapee.id)
      const bgCanvas = new OffscreenCanvas(p5Canvas.width, p5Canvas.height)

      //@ts-ignore
      bgCanvas.name = shapee.id

      const p5Passthru = new Passthru({ src: bgCanvas })
      p5Passthru.debugId = `p5Passthru-${shapee.id}`
      const feedback = new FeedbackNode(p5Passthru)
      feedback.debugId = `feedback-${shapee.id}`
      const vertBlur = new VerticalBlur({ src: feedback })
      vertBlur.debugId = `vertBlur-${shapee.id}`
      const horBlur = new HorizontalBlur({ src: vertBlur })
      horBlur.debugId = `horBlur-${shapee.id}`
      const transform = new Transform({ src: horBlur })
      transform.debugId = `transform-${shapee.id}`
      const layerOverlay = new LayerBlend({ src1: p5Passthru, src2: transform })
      layerOverlay.debugId = `layerOverlay-${shapee.id}`
      feedback.setFeedbackSrc(layerOverlay)

      const bgCtx = bgCanvas.getContext('2d')
      // const debugCanvas = document.getElementById('debugCanvas') as HTMLCanvasElement
      // const debugCtx = debugCanvas.getContext('2d')

      const drawFunc = (p5i: p5) => {
        p5i.clear()

        p5i.push()
        p5i.strokeWeight(4)


        const multiSegmentLineMap = getMultiSegmentLineShapes(tldrawEditor)
        const shape = multiSegmentLineMap.get(shapee.id)
        if(!shape){
          console.warn("shape not found", shapee.id)
          return
        }

        const modulatedPoints = shape.points.map((pt, i) => {
          return {
            x: pt.x + Math.sin(now()*(1+rand(i))) * 50,
            y: pt.y + Math.cos(now()*(1+rand(i))) * 50
          }
        })

        const lerpVal = sinN(now()*0.1)
        const lerpedModulatedPoints = shape.points.map((pt, i) => {
          return {
            x: lerp(pt.x, modulatedPoints[i].x, lerpVal),
            y: lerp(pt.y, modulatedPoints[i].y, lerpVal)
          }
        })

        const flatPoints = shape.points.flatMap(pt => [pt.x, pt.y])
        const indices = earcut(flatPoints)
        //draw triangles
        for (let i = 0; i < indices.length; i += 3) {
          const col = randColor(i)
          p5i.push()
          p5i.fill(col.r, col.g, col.b)
          p5i.noStroke()
          const a = indices[i]
          const b = indices[i + 1]
          const c = indices[i + 2]
          p5i.triangle(lerpedModulatedPoints[a].x, lerpedModulatedPoints[a].y, lerpedModulatedPoints[b].x, lerpedModulatedPoints[b].y, lerpedModulatedPoints[c].x, lerpedModulatedPoints[c].y)
          p5i.pop()
        }

        p5i.push()
        p5i.noFill()
        p5i.stroke(255)
        p5i.beginShape()

        if(shape.spline === 'spline'){
          p5i.curveVertex(shape.points[0].x, shape.points[0].y)
          for (const pt of shape.points) {
            p5i.curveVertex(pt.x, pt.y)
          }
          if(shape.closed){
            p5i.curveVertex(shape.points[0].x, shape.points[0].y)
            p5i.curveVertex(shape.points[1].x, shape.points[1].y)
          } else {
            p5i.curveVertex(shape.points[shape.points.length - 1].x, shape.points[shape.points.length - 1].y)
          }
        } else {
          for (const pt of shape.points) {
            p5i.vertex(pt.x, pt.y)
          }
          if(shape.closed){
            p5i.vertex(shape.points[0].x, shape.points[0].y)
          }
        }
        
        p5i.endShape()


        p5i.pop()
        p5i.pop()

        
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height)
        bgCtx.drawImage(p5Canvas, 0, 0, bgCanvas.width, bgCanvas.height)
        
        // debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height)
        // debugCtx.drawImage(bgCanvas, 0, 0, debugCanvas.width, debugCanvas.height)

        // layerOverlay.renderAll(appState.threeRenderer!!)
      }
      
      shapeRenderMap.set(shapee.id, { drawFunc, shaderGraphEndNode: layerOverlay })
    }

    const initalPassthru = new Passthru({ src: p5Canvas })
    const compositeShaderEffect = new CompositeShaderEffect([
      initalPassthru, 
    ], 1)
    initalPassthru.debugId = "initialPassthru"

    const canvasPaint = new CanvasPaint({ src: compositeShaderEffect })
    
    shaderGraphEndNode = canvasPaint

    const resetCompositeShaderEffect = () => {
      const shapeEndNodes = Array.from(shapeRenderMap.values()).map(shape => shape.shaderGraphEndNode)
      compositeShaderEffect.resetInputs(shapeEndNodes)
    }

    //@ts-ignore
    let tldrawEditor: Editor | undefined = undefined


    //@ts-ignore
    window.editorReadyCallback = (editor: Editor) => {
      tldrawEditor = editor

      editor.getPageShapeIds('page:page' as TLPageId).forEach(id => {
        const shape = editor.getShape<MultiSegmentLineShape>(id)
        if(shape.type === 'multiSegmentLine'){
          onShapeCreated(shape)
        }
      })

      resetCompositeShaderEffect()

      tldrawEditor.store.listen(onHistory => {
        console.log("store change",onHistory)

        for (const shapeId in onHistory.changes.added) {
          const shape = onHistory.changes.added[shapeId]
          if(shape.type === 'multiSegmentLine'){
            onShapeCreated(shape)
            resetCompositeShaderEffect()
          }
        }
        
        for (const shapeId in onHistory.changes.removed) {
          const shape = onHistory.changes.removed[shapeId]
          console.log("shape removed", shapeId)
          if(shape.type === 'multiSegmentLine'){
            const mapEntry = shapeRenderMap.get(shapeId)
            if(mapEntry){
              mapEntry.shaderGraphEndNode.disposeAll()
              shapeRenderMap.delete(shapeId)
              resetCompositeShaderEffect()
            }
          }
        }

      }, { scope: 'document', source: 'user' })

      tldrawEditor.store.listen(onHistory => {
        // console.log("session store change",onHistory)
        for(const itemId in onHistory.changes.updated){
          const item = onHistory.changes.updated[itemId]
          // console.log("item updated", itemId, item.type)
          if(itemId.split(':')[0] === 'camera'){
            console.log("camera updated", item)
            tldrawCamera = editor.getCamera()
          }
          // if(itemId != "pointer:pointer"){
          //   console.log("session store change", itemId, item)
          // }
          if(item[0]?.selectedShapeIds){
            console.log("selected shape ids", item[0].selectedShapeIds)
          }
          if(item[0]?.hoveredShapeId){
            console.log("hovered shape id", item[0].hoveredShapeId)
          }
          //for arbitrary shape related metadata, define a default value/shape property,
          //and then when you open the metadata editor, initialize with the default value.
          //The editor component can be the vue AutoUI component, and can save the value
          //back to tldraw. Might need to add a "save" button and an indicator that data
          //has been changed.
        }
      }, { scope: 'session', source: 'user' })
    }

    


    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?


      //todo sketch - create some kind of compositor shaderFX for shapeRenderMap 
      //set that compositor as shaderGraphEndNode

      appState.drawFuncMap.set('drawShapes', (p5i: p5) => {
        for (const [id, shape] of shapeRenderMap) {
          shape.drawFunc(p5i)
        }
      })
      

      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    code() 
  } catch (e) {
    console.warn(e)
  }

})

/**
 * music viz mapping
 *  - loop where height controls pitch of note, width relative to bounding box
 *    controls velocity, and other aspects of the shape control timbre
 *  - deviation from circle area controls low pass filter (more circle, more low pass)
 *  - note on events trigger small animations on the shape track 
 *  - other visuals options can be directly mapped to music synthesis parameters
 */

onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
  for (const [id, shape] of shapeRenderMap) {
    shape.shaderGraphEndNode.disposeAll()
  }
  shapeRenderMap.clear()
})
</script>

<template>
  <div></div>
  <AutoUI :object-to-edit="drawParams"/>
</template>

<style scoped></style>