<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TldrawTestAppState, appStateName, resolution } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, now } from '@/channels/channels';
import { getEllipseShapes, getFreehandShapes, getMultiSegmentLineShapes, getTransformedShapePoints, p5FreehandTldrawRender } from './tldrawWrapperPlain';
import { CompositeShaderEffect, HorizontalBlur, LayerBlend, Transform, VerticalBlur } from '@/rendering/customFX';
import AutoUI from '@/components/AutoUI.vue';
import { clamp, lerp, type Editor, type TLPageId } from 'tldraw';
import earcut from 'earcut';
import type { MultiSegmentLineShape } from './multiSegmentLine/multiSegmentLineUtil';
import { AbletonClip } from '@/io/abletonClips';
import type { MIDIValOutput } from '@midival/core';
import { MIDI_READY, midiOutputs } from '@/io/midi';

const appState = inject<TldrawTestAppState>(appStateName)!!
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

const notes = [
  { pitch: 60, velocity: 100, duration: 1, position: 0 },
  { pitch: 62, velocity: 100, duration: 1, position: 1 },
  { pitch: 64, velocity: 100, duration: 1, position: 2 },
  { pitch: 65, velocity: 100, duration: 1, position: 3 },
  { pitch: 67, velocity: 100, duration: 1, position: 4 },
  { pitch: 69, velocity: 100, duration: 1, position: 5 },
  { pitch: 71, velocity: 100, duration: 1, position: 6 },
]

const notes1 = notes.slice(0, 4)
const clip1 = new AbletonClip("clip1", 4, notes1)

const notes2 = notes.slice(0, 5).map(n => ({...n, pitch: n.pitch + 12}))
const clip2 = new AbletonClip("clip2", 5, notes2)

const notes3 = notes.slice(0, 6).map(n => ({...n, pitch: n.pitch - 12}))
const clip3 = new AbletonClip("clip3", 6, notes3)

const getTestClips = () => [clip1, clip2, clip3]

type PointHaver = {
  points: {x: number, y: number}[]
}
const calculatePlayProbabilities = (shape1: PointHaver, shape2: PointHaver, shape3: PointHaver, windowDim: {width: number, height: number}) => {
  const sumPt1 = shape1.points.reduce((acc, pt) => ({x: acc.x + pt.x, y: acc.y + pt.y}), {x: 0, y: 0})
  const centerPt1 = {x: sumPt1.x / shape1.points.length, y: sumPt1.y / shape1.points.length}
  const sumPt2 = shape2.points.reduce((acc, pt) => ({x: acc.x + pt.x, y: acc.y + pt.y}), {x: 0, y: 0})
  const centerPt2 = {x: sumPt2.x / shape2.points.length, y: sumPt2.y / shape2.points.length}
  const sumPt3 = shape3.points.reduce((acc, pt) => ({x: acc.x + pt.x, y: acc.y + pt.y}), {x: 0, y: 0})
  const centerPt3 = {x: sumPt3.x / shape3.points.length, y: sumPt3.y / shape3.points.length}

  const dist12 = Math.sqrt((centerPt1.x - centerPt2.x)**2 + (centerPt1.y - centerPt2.y)**2)
  const dist13 = Math.sqrt((centerPt1.x - centerPt3.x)**2 + (centerPt1.y - centerPt3.y)**2)
  const dist23 = Math.sqrt((centerPt2.x - centerPt3.x)**2 + (centerPt2.y - centerPt3.y)**2)

  const minDim = Math.min(windowDim.width, windowDim.height)
  //distance to weight
  const d2w = (dist: number) => clamp(1 - dist / (minDim/2), 0, 1)
  //normalize array to sum to 1
  const na = (arr: number[]) => arr.map(n => n / arr.reduce((acc, n) => acc + n, 0))

  // const v1Distribution = na([1, d2w(dist12), d2w(dist13)])
  // const v2Distribution = na([d2w(dist12), 1, d2w(dist23)])
  // const v3Distribution = na([d2w(dist13), d2w(dist23), 1])

  const v1Distribution = na([1, 0, 0])
  const v2Distribution = na([0, 1, 0])
  const v3Distribution = na([0, 0, 1])

  return [v1Distribution, v2Distribution, v3Distribution]
}

const sampleFromDist = (dist: number[]) => {
  const rand = Math.random()
  let sum = 0
  for(let i = 0; i < dist.length; i++) {
    sum += dist[i]
    if(rand < sum) return i
  }
}
let midiOutput = midiOutputs.get("IAC Driver Bus 1")!!

const playNote = (pitch: number, velocity: number, ctx: TimeContext, noteDur: number, channel: number, inst: MIDIValOutput) => {
  console.log("pitch play", pitch, channel)
  const chan = channel + 1
  inst.sendNoteOn(pitch, velocity, chan)
  let noteIsOn = true
  ctx.branch(async ctx => {
    await ctx.wait((noteDur ?? 0.1) * 0.98)
    inst.sendNoteOff(pitch, chan)
    noteIsOn = false
  }).finally(() => {
    inst.sendNoteOff(pitch, chan)
  })
}

const playMelody = async (shapeGetter: () => PointHaver[], clipGetter: () => AbletonClip[], ctx: TimeContext, voiceIndex: number) => {
  const shapes = shapeGetter()
  const shape = shapes[voiceIndex]
  const clip = clipGetter()[voiceIndex]
  const playDistribution = calculatePlayProbabilities(shapes[0], shapes[1], shapes[2], resolution)[voiceIndex]

  const noteBuffer = clip.noteBuffer()
  for(const note of noteBuffer) {
    let voiceIndex = sampleFromDist(playDistribution)
    await ctx.wait(note.preDelta)
    playNote(note.note.pitch, note.note.velocity, ctx, note.note.duration, voiceIndex, midiOutput!!)
    await ctx.wait(note.postDelta ?? 0)
  }
}


const playMelodies = async (ctx: TimeContext, shapeGetter: () => PointHaver[], clipGetter: () => AbletonClip[]) => {
  for(let i = 0; i < 3; i++) {
    ctx.branch(async ctx => {
      
      // eslint-disable-next-line no-constant-condition
      while(true){
        await playMelody(shapeGetter, clipGetter, ctx, i) //todo sketch - test that this works 
      }
    })
  }
}

type AnimationState = {
  melodyPhase: number
  baseShapeIndex: number
  otherShapeIndex: number
  interpolationPhase: number
}

type RemnantCircles = {
  id: string
  x: number
  y: number
  radius: number
  color: number
}
const remnantCircles: RemnantCircles[] = []

type RemantTriangles = {
  id: string
  points: {x: number, y: number}[]
  color: number
}
const anim1Artifacts: RemantTriangles[] = []

/**
 * shapeGetter() is simple function grabbing multiLine shapes from the editor
 * 
 * ClipGetter() can actually encapsulate all of the orchestration logic between voices - 
 * because it knows what time each voice requests a clip, and how long the clip lasts, 
 * it can do things like truncate clips to coordinate start times between voices.
 * 
 * think about how this code pattern relates to the musicAgentTest code - whether
 * it is equivalent in flexibility, what stuff is cleaner, harder, etc.
 * - hypothesis - this is cleaner for generative music with minimal interaction, but
 *   if you want generative music with interactive interrupts in the middle of playback
 *   of a clip, you need to use something closer to the musicAgent pattern, since this
 *   doesn't accomodate for clip interrupts at all
 */

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
    window.editorReadyCallback = async (editor: Editor) => {
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

      const getShapes = () => {
        return Array.from(getMultiSegmentLineShapes(editor).values())
      }

      await MIDI_READY
      midiOutput = midiOutputs.get("IAC Driver Bus 1")!!

      launchLoop(async ctx => {
        ctx.bpm = 120
        await ctx.waitSec(3)
        await playMelodies(ctx, getShapes, getTestClips)
      })
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