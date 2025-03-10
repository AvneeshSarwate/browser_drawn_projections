<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TldrawTestAppState, appStateName, resolution, type AnimationState } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, FeedbackNode, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, now, biasedTri } from '@/channels/channels';
import { getEllipseShapes, getFreehandShapes, getMultiSegmentLineShapes, getTransformedShapePoints, p5FreehandTldrawRender } from './tldrawWrapperPlain';
import { AntiAlias, Bloom, CompositeShaderEffect, HorizontalBlur, LayerBlend, MathOp, RGDisplace, Transform, VerticalBlur } from '@/rendering/customFX';
import AutoUI from '@/components/AutoUI.vue';
import { clamp, lerp, type Editor, type TLPageId, type TLShapeId } from 'tldraw';
import earcut from 'earcut';
import type { MultiSegmentLineShape } from './multiSegmentLine/multiSegmentLineUtil';
import { AbletonClip, type AbletonNote } from '@/io/abletonClips';
import type { MIDIValOutput } from '@midival/core';
import { MIDI_READY, midiInputs, midiOutputs } from '@/io/midi';
import type { NumberNodeUniform } from 'three/src/renderers/common/nodes/NodeUniform.js';
import { catmullRomSpline } from '@/rendering/catmullRom';
import { getTestClips, clipVersions } from './midiClipUtils';
import { playNote } from './playback';
import type { TreeProp } from '@/stores/undoCommands';
import { HorizontalAlternateDisplace, PointZoom } from './customFx';
import { mixColorRGB } from '@/rendering/palletteHelper';

const appState = inject<TldrawTestAppState>(appStateName)!!
console.log("regrabbing clips", clipVersions)
appState.getClips = getTestClips
let shaderGraphEndNode: ShaderEffect | undefined = undefined
let timeLoops: CancelablePromisePoxy<any>[] = []

//@ts-ignore
let tldrawEditor: Editor | undefined = undefined
console.log("tldrawEditor", tldrawEditor)
let getCamera = () => tldrawEditor?.getCamera() ?? { x: 0, y: 0, z: 1 }

const getCenterPt = (points: {x: number, y: number}[]) => {
  const sumPt = points.reduce((acc, pt) => ({x: acc.x + pt.x, y: acc.y + pt.y}), {x: 0, y: 0})
  return {x: sumPt.x / points.length, y: sumPt.y / points.length}
}

const rotateAroundCenter = (points: {x: number, y: number}[], center: {x: number, y: number}, angle: number) => {
  const cosA = Math.cos(angle)
  const sinA = Math.sin(angle)
  return points.map(pt => ({
    x: (pt.x - center.x) * cosA - (pt.y - center.y) * sinA + center.x,
    y: (pt.x - center.x) * sinA + (pt.y - center.y) * cosA + center.y
  }))
}

const scaleAroundCenter = (points: {x: number, y: number}[], center: {x: number, y: number}, scale: number) => {
  return points.map(pt => ({
    x: center.x + (pt.x - center.x) * scale,
    y: center.y + (pt.y - center.y) * scale
  }))
}

const lerpToCenter = (points: { x: number, y: number }[], shapeCenter: { x: number, y: number }, targetCenter: { x: number, y: number }, t: number) => {
  const delta = {x: targetCenter.x - shapeCenter.x, y: targetCenter.y - shapeCenter.y}
  return points.map(pt => ({
    x: pt.x + delta.x * t,
    y: pt.y + delta.y * t
  }))
}



//todo fix - this needs to be made more robust wrt grabbing a reference to editor while hotreloading
const getShapes = () => {
  const shapes = Array.from(getMultiSegmentLineShapes(tldrawEditor!!).values())
  const origCenters = shapes.map(shape => getCenterPt(shape.points))
  const target = {x: resolution.width/2, y: resolution.height/2}
  const targetCenteredShapes = shapes.map((shape, i) => lerpToCenter(shape.points, origCenters[i], target, appState.midiParams.shapeCenterLerp))
  const newCenters = targetCenteredShapes.map(shape => getCenterPt(shape))
  const scaledShapes = targetCenteredShapes.map((shape, i) => scaleAroundCenter(shape, newCenters[i], appState.midiParams.shapeScale))
  const scaledCenters = scaledShapes.map(shape => getCenterPt(shape))
  const rotatedShapes = scaledShapes.map((shape, i) => rotateAroundCenter(shape, scaledCenters[i], appState.rotateAngle))
  return rotatedShapes.map(shape => ({points: shape}))
}


type PointHaver = {
  points: {x: number, y: number}[]
}
const calculatePlayProbabilities = (shape1: PointHaver, shape2: PointHaver, shape3: PointHaver, windowDim: {width: number, height: number}) => {
  const centerPt1 = getCenterPt(shape1.points)
  const centerPt2 = getCenterPt(shape2.points)
  const centerPt3 = getCenterPt(shape3.points)

  const dist12 = Math.sqrt((centerPt1.x - centerPt2.x)**2 + (centerPt1.y - centerPt2.y)**2)
  const dist13 = Math.sqrt((centerPt1.x - centerPt3.x)**2 + (centerPt1.y - centerPt3.y)**2)
  const dist23 = Math.sqrt((centerPt2.x - centerPt3.x)**2 + (centerPt2.y - centerPt3.y)**2)

  const minDim = Math.min(windowDim.width, windowDim.height)
  //distance to weight
  const d2w = (dist: number) => clamp(1 - dist / (minDim/2), 0, 1)
  //normalize array to sum to 1
  const na = (arr: number[]) => arr.map(n => n / arr.reduce((acc, n) => acc + n, 0))

  const v1Distribution = na([1, d2w(dist12), d2w(dist13)])
  const v2Distribution = na([d2w(dist12), 1, d2w(dist23)])
  const v3Distribution = na([d2w(dist13), d2w(dist23), 1])

  // const v1Distribution = na([1, 0, 0])
  // const v2Distribution = na([0, 1, 0])
  // const v3Distribution = na([0, 0, 1])

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


//todo api - this is a hack till adding support for arrays in AutoUI
const voiceKeys = Object.keys(appState.voiceParams)

type MelodyGenerator = (noteLength: number, melodySpeed: number) => AbletonClip

const playMelody = async (ctx: TimeContext, shapeGetter: () => PointHaver[], animationStateGetter: () => AnimationState[], voiceIndex: number) => {
  const shapes = shapeGetter()
  const {noteLength, melodySpeed} = appState.voiceParams[voiceKeys[voiceIndex]]
  const clip = appState.getClips()[voiceIndex](noteLength, melodySpeed)
  const playDistribution = calculatePlayProbabilities(shapes[0], shapes[1], shapes[2], resolution)[voiceIndex]
  const animationState = animationStateGetter()[voiceIndex]

  //kick of a branch that runs for the clip duration and updates melody phase
  const melodyRamp = new Ramp(clip.duration * (60 / ctx.bpm))
  melodyRamp.trigger()
  ctx.branch(async _ctx => {
    while(melodyRamp.val() <= 1){
      animationState.melodyPhase = melodyRamp.val()
      await _ctx.waitFrame()
    }
  })

  const noteBuffer = clip.noteBuffer()
  for(const [noteIndex, note] of noteBuffer.entries()) {
    let randVoice = sampleFromDist(playDistribution)

    await ctx.wait(note.preDelta)
    const noteRamp = new Ramp(0.5)
    noteRamp.trigger()
    animationState.noteEnvelopes[noteIndex] = {
      noteIndex,
      ramp: noteRamp,
      otherVoiceIndex: randVoice,
      phasePos: animationState.melodyPhase,
      startTime: now()
    }

    if(appState.voiceParams[voiceKeys[voiceIndex]].play) {
      playNote(ctx, note.note, randVoice, midiOutput!!)
    }
    await ctx.wait(note.postDelta ?? 0)
  }
}

// livecoding

appState.voicePlayheadColors = [
  { primary: { r: 76, g: 134, b: 168 }, secondary: { r: 76, g: 164, b: 168 }, tertiary: { r: 76, g: 134, b: 168 } },
  { primary: { r: 165, g: 56, b: 96 }, secondary: { r: 255, g: 77, b: 131 }, tertiary: {r: 56, g: 165, b: 96}},
  { primary: { r: 207, g: 153, b: 95 }, secondary: { r: 255, g: 208, b: 117 }, tertiary: { r: 95, g: 153, b: 207 } },
]

// appState.voicePlayheadColors = [
//   {primary: {r: 134, g: 76, b: 168}, secondary: {r: 76, g: 164, b: 168}, tertiary: { r: 76, g: 164, b: 168 }},
//   {primary: {r: 56, g: 165, b: 96}, secondary: {r: 255, g: 77, b: 131}, tertiary: { r: 255, g: 77, b: 131 }},
//   {primary: {r: 153, g: 207, b: 95}, secondary: {r: 255, g: 208, b: 117}, tertiary: { r: 255, g: 208, b: 117 }},
// ]

const lerpColor = (col1: {r: number, g: number, b: number}, col2: {r: number, g: number, b: number}, t: number) => {
  return {r: lerp(col1.r, col2.r, t), g: lerp(col1.g, col2.g, t), b: lerp(col1.b, col2.b, t)}
}

const remnantCircleDraw = (p5: p5, shapeGetter: () => PointHaver[], animationStateGetter: () => AnimationState[], voiceIndex: number) => {
  // eslint-disable-next-line no-debugger
  if (voiceIndex >= 3) debugger

  const palette = appState.voicePlayheadColors

  const animationState = animationStateGetter()[voiceIndex]
  const shape = shapeGetter()[voiceIndex]

  const loopSplinePoints = shape.points.map(pt => pt)
  loopSplinePoints.push(loopSplinePoints[0])
  // loopSplinePoints.push(loopSplinePoints[1])
  const col2 = mixColorRGB(palette[voiceIndex].secondary, palette[voiceIndex].tertiary, appState.midiParams.paletteLerp)
  const col = mixColorRGB(palette[voiceIndex].primary, col2, sinN(appState.colorOscPhase))

  p5.push()
  p5.beginShape()
  p5.noFill()
  p5.strokeWeight(2)
  p5.stroke(col.r, col.g, col.b, 150)
  loopSplinePoints.forEach(pt => {
    p5.curveVertex(pt.x, pt.y)
  })
  p5.endShape(p5.CLOSE)
  p5.pop()

  const playHeadPos = catmullRomSpline(loopSplinePoints, animationState.melodyPhase)
  p5.push()

  p5.fill(col.r, col.g, col.b)
  p5.noStroke()
  p5.ellipse(playHeadPos.x, playHeadPos.y, 20, 20)
  p5.pop()

  for(const noteEnvelope of animationState.noteEnvelopes){
    let notePos = catmullRomSpline(loopSplinePoints, noteEnvelope.phasePos)
    let col = palette[voiceIndex].primary
    if(noteEnvelope.otherVoiceIndex != voiceIndex) {
      // console.log("draw note jump other", noteEnvelope.otherVoiceIndex)
      const otherShape = shapeGetter()[noteEnvelope.otherVoiceIndex]
      const otherLoopSplinePoints = otherShape.points.map(pt => pt)
      otherLoopSplinePoints.push(...otherLoopSplinePoints.slice(0, 2))
      const otherNotePos = catmullRomSpline(otherLoopSplinePoints, noteEnvelope.phasePos)
      const lerpVal = biasedTri(noteEnvelope.ramp.val(), 0.2)
      notePos = {
        x: lerp(notePos.x, otherNotePos.x, lerpVal),
        y: lerp(notePos.y, otherNotePos.y, lerpVal)
      }
      col = mixColorRGB(col, palette[noteEnvelope.otherVoiceIndex].primary, lerpVal)
    }
    
    p5.push()
    p5.fill(col.r, col.g, col.b, 255 * (1-noteEnvelope.ramp.val()))
    p5.noStroke()
    p5.ellipse(notePos.x, notePos.y, 35, 35)
    p5.pop()
  }

  // const shapeCenterX = () => {
  //   const { points } = shapeGetter()[voiceIndex]
  //   const shapeXSum = points.reduce((sum, pt) => sum + pt.x, 0)
  //   return shapeXSum / points.length / resolution.width
  // }
  // const shapeCenterY = () => {
  //   const { points } = shapeGetter()[voiceIndex]
  //   const shapeYSum = points.reduce((sum, pt) => sum + pt.y, 0)
  //   return shapeYSum / points.length / resolution.height
  // }

  // p5.push()
  // p5.fill(col.r, col.g, col.b)
  // p5.noStroke()
  // p5.ellipse(shapeCenterX() * resolution.width, shapeCenterY() * resolution.height, 30, 30)
  // p5.pop()
}




const playMelodies = async (ctx: TimeContext, shapeGetter: () => PointHaver[], animationStateGetter: () => AnimationState[]) => {
  for(let i = 0; i < 3; i++) {
    ctx.branch(async ctx => {
      
      // eslint-disable-next-line no-constant-condition
      while(true){
        await playMelody(ctx, shapeGetter, animationStateGetter, i) 
        // console.log("melody finished", i)
      }
    })
  }
}




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

const musicParams = ref({
  playMelody1: true,
  playMelody2: false,
  playMelody3: false,
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

const shaderGraph0 = (bgCanvas: OffscreenCanvas, getShape: () => MultiSegmentLineShape) => {
  const shapee = getShape()
  const p5Passthru = new Passthru({ src: bgCanvas })
  p5Passthru.debugId = `p5Passthru-${shapee.id}`
  const antiAlias = new AntiAlias({ src: p5Passthru })
  antiAlias.debugId = `antiAlias-${shapee.id}`
  const feedback = new FeedbackNode(antiAlias)
  feedback.debugId = `feedback-${shapee.id}`
  const vertBlur = new VerticalBlur({ src: feedback })
  vertBlur.debugId = `vertBlur-${shapee.id}`
  const horBlur = new HorizontalBlur({ src: vertBlur })
  horBlur.debugId = `horBlur-${shapee.id}`
  const transform = new Transform({ src: horBlur })
  transform.debugId = `transform-${shapee.id}`
  const mathOp = new MathOp({ src: transform })
  mathOp.debugId = `mathOp-${shapee.id}`
  const layerOverlay = new LayerBlend({ src1: p5Passthru, src2: mathOp })
  layerOverlay.debugId = `layerOverlay-${shapee.id}`
  feedback.setFeedbackSrc(layerOverlay);
  mathOp.setUniforms({mult: () => 0.99 + appState.midiParams.fadeawayDuration*0.02});

  return layerOverlay
}

const shaderGraph1 = (bgCanvas: OffscreenCanvas, getShape: () => MultiSegmentLineShape) => {
  const shapee = getShape()
  const p5Passthru = new Passthru({ src: bgCanvas })
  p5Passthru.debugId = `p5Passthru-${shapee.id}`
  const antiAlias = new AntiAlias({ src: p5Passthru })
  antiAlias.debugId = `antiAlias-${shapee.id}`
  const feedback = new FeedbackNode(antiAlias)
  feedback.debugId = `feedback-${shapee.id}`
  const horDisplaceSrc = new HorizontalAlternateDisplace()
  horDisplaceSrc.debugId = `horDisplaceSrc-${shapee.id}`
  const displace = new RGDisplace({ src: feedback, displacementMap: horDisplaceSrc })
  displace.debugId = `displace-${shapee.id}`
  const mathOp = new MathOp({ src: displace })
  mathOp.debugId = `mathOp-${shapee.id}`
  const layerOverlay = new LayerBlend({ src1: p5Passthru, src2: mathOp })
  layerOverlay.debugId = `layerOverlay-${shapee.id}`
  feedback.setFeedbackSrc(layerOverlay);
  mathOp.setUniforms({ mult: () => 0.99 + appState.midiParams.fadeawayDuration*0.01});
  displace.setUniforms({ strength: 0.001 })

  return layerOverlay
}

const shaderGraph2 = (bgCanvas: OffscreenCanvas, getShape: () => MultiSegmentLineShape) => {
  const shapee = getShape()

  const shapeCenterX = () => {
    const shape = getShape()
    const points = getTransformedShapePoints(shape, getCamera())
    const shapeXSum = points.reduce((sum, pt) => sum + pt.x, 0)
    return shapeXSum / points.length / resolution.width
  }
  const shapeCenterY = () => {
    const shape = getShape()
    const points = getTransformedShapePoints(shape, getCamera())
    const shapeYSum = points.reduce((sum, pt) => sum + pt.y, 0)
    return 1 - shapeYSum / points.length / resolution.height
  }

  const p5Passthru = new Passthru({ src: bgCanvas })
  p5Passthru.debugId = `p5Passthru-${shapee.id}`
  const antiAlias = new AntiAlias({ src: p5Passthru })
  antiAlias.debugId = `antiAlias-${shapee.id}`
  const feedback = new FeedbackNode(antiAlias)
  feedback.debugId = `feedback-${shapee.id}`

  
  const vertBlur = new VerticalBlur({ src: feedback })
  vertBlur.debugId = `vertBlur-${shapee.id}`
  const horBlur = new HorizontalBlur({ src: vertBlur })
  horBlur.debugId = `horBlur-${shapee.id}`
  const pointZoom = new PointZoom({ src: horBlur })
  pointZoom.debugId = `pointZoom-${shapee.id}`


  const mathOp = new MathOp({ src: pointZoom })
  mathOp.debugId = `mathOp-${shapee.id}`
  const layerOverlay = new LayerBlend({ src1: p5Passthru, src2: mathOp })
  layerOverlay.debugId = `layerOverlay-${shapee.id}`


  feedback.setFeedbackSrc(layerOverlay);
  pointZoom.setUniforms({centerX: shapeCenterX, centerY: shapeCenterY, strength: -0.01})
  mathOp.setUniforms({mult: () => 0.995 + appState.midiParams.fadeawayDuration*0.005});

  return layerOverlay
}

const shaderGraphs = [
  shaderGraph0,
  shaderGraph1,
  shaderGraph2,
]

let tldrawCamera = {x: 0, y: 0, z: 1}


console.log("loadCount", appState.loadCount)
onMounted(() => {
  appState.loadCount++
  console.log("onMounted", appState.loadCount)
  // if (!firstLoad) {
  //   console.log("first load already done")
  //   return
  // }
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement
    const debugCanvas = document.getElementById('debugCanvas') as HTMLCanvasElement
    const debugCtx = debugCanvas.getContext('2d')
    let numShapes = 0

    const onShapeCreated = (shapee: MultiSegmentLineShape) => {
      if(numShapes >= 3) return
      console.log("onShapeCreated", shapee.id, numShapes)
      const bgCanvas = new OffscreenCanvas(p5Canvas.width, p5Canvas.height)
      const bgCtx = bgCanvas.getContext('2d')

      //@ts-ignore
      bgCanvas.name = shapee.id

      const getShape = () => tldrawEditor!!.getShape<MultiSegmentLineShape>(shapee.id as TLShapeId)
      const layerOverlay = shaderGraphs[numShapes](bgCanvas, getShape);

      let voiceIndex = numShapes
      const drawFunc = (p5i: p5) => {
        p5i.clear()
        if(!appState.voiceParams[voiceKeys[voiceIndex]].play) return

        remnantCircleDraw(p5i, getShapes, () => appState.animationStates, voiceIndex)

        
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height)
        bgCtx.drawImage(p5Canvas, 0, 0, bgCanvas.width, bgCanvas.height)
        
        // debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height)
        debugCtx.drawImage(bgCanvas, 0, 0, debugCanvas.width, debugCanvas.height)

        // layerOverlay.renderAll(appState.threeRenderer!!)
      }
      
      shapeRenderMap.set(shapee.id, { drawFunc, shaderGraphEndNode: layerOverlay })
    }

    const initalPassthru = new Passthru({ src: p5Canvas })
    initalPassthru.debugId = "initialPassthru"
    const compositeShaderEffect = new CompositeShaderEffect([
      initalPassthru, 
    ], 1)
    const bloom = new Bloom({ src: compositeShaderEffect })
    bloom.setUniforms({intensity: () => appState.midiParams.bloomIntensity})
    bloom.debugId = "bloom"

    const finalFade = new MathOp({ src: bloom })
    finalFade.setUniforms({mult: () => appState.midiParams.finalFade})
    finalFade.debugId = "finalFade"

    const canvasPaint = new CanvasPaint({ src: finalFade })
    
    shaderGraphEndNode = canvasPaint

    const resetCompositeShaderEffect = () => {
      const shapeEndNodes = Array.from(shapeRenderMap.values()).map(shape => shape.shaderGraphEndNode)
      compositeShaderEffect.resetInputs(shapeEndNodes)
    }

    const initliazeShapeShaderPasses = (editor: Editor) => {
      editor.getPageShapeIds('page:page' as TLPageId).forEach(id => {
        const shape = editor.getShape<MultiSegmentLineShape>(id)
        if (shape.type === 'multiSegmentLine') {
          onShapeCreated(shape)
          numShapes++
        }
      })

      resetCompositeShaderEffect()
    }

    if (appState.loadCount > 0) {
      //todo fix - this is not the most structured/robust way to grab reference to editor in hot-reload

      //@ts-ignore
      // eslint-disable-next-line no-debugger
      if (!window.tldrawEditor) debugger
      //@ts-ignore
      tldrawEditor = window.tldrawEditor

      //@ts-ignore
      initliazeShapeShaderPasses(window.tldrawEditor)
      
    }

    //todo - need to think of a more structured way to handle creating/cleaing up
    //listners on external stores/objects

    //@ts-ignore
    window.editorReadyCallback = async (editor: Editor) => {
      tldrawEditor = editor

      initliazeShapeShaderPasses(editor)      

      tldrawEditor.store.listen(onHistory => {
        // console.log("store change", onHistory)

        for (const shapeId in onHistory.changes.added) {
          const shape = onHistory.changes.added[shapeId]
          if (shape.type === 'multiSegmentLine') {
            onShapeCreated(shape)
            resetCompositeShaderEffect()
          }
        }

        for (const shapeId in onHistory.changes.removed) {
          const shape = onHistory.changes.removed[shapeId]
          console.log("shape removed", shapeId)
          if (shape.type === 'multiSegmentLine') {
            const mapEntry = shapeRenderMap.get(shapeId)
            if (mapEntry) {
              mapEntry.shaderGraphEndNode.disposeAll()
              shapeRenderMap.delete(shapeId)
              resetCompositeShaderEffect()
            }
          }
        }

      }, { scope: 'document', source: 'user' })

      tldrawEditor.store.listen(onHistory => {
        // console.log("session store change",onHistory)
        for (const itemId in onHistory.changes.updated) {
          const item = onHistory.changes.updated[itemId]
          // console.log("item updated", itemId, item.type)
          if (itemId.split(':')[0] === 'camera') {
            // console.log("camera updated", item)
            tldrawCamera = editor.getCamera()
          }
          // if(itemId != "pointer:pointer"){
          //   console.log("session store change", itemId, item)
          // }
          if (item[0]?.selectedShapeIds) {
            // console.log("selected shape ids", item[0].selectedShapeIds)
          }
          if (item[0]?.hoveredShapeId) {
            // console.log("hovered shape id", item[0].hoveredShapeId)
          }
          //for arbitrary shape related metadata, define a default value/shape property,
          //and then when you open the metadata editor, initialize with the default value.
          //The editor component can be the vue AutoUI component, and can save the value
          //back to tldraw. Might need to add a "save" button and an indicator that data
          //has been changed.
        }
      }, { scope: 'session', source: 'user' })

      await MIDI_READY
      midiOutput = midiOutputs.get("IAC Driver Bus 1")!!
      console.log('pre launch loop', appState.loadCount, appState.loopRoot)
      if (!appState.loopRoot) {
        appState.loopRoot = launchLoop(async ctx => {
          ctx.bpm = 180
          await ctx.waitSec(1)
          ctx.branch(async () => {
            
            // eslint-disable-next-line no-constant-condition
            while (true) {
              await ctx.waitFrame()
              appState.rotateAngle += appState.midiParams.shapeRotateSpeed
              appState.colorOscPhase += appState.midiParams.colorOscSpeed
            }
          })
          await playMelodies(ctx, getShapes, () => appState.animationStates)
        })
        console.log('post launch loop', appState.loadCount, appState.loopRoot)
      }


      const midiInput = midiInputs.get("LPD8 mk2")!!
      const midiNorm = (val: number) => val / 127
      midiInput?.onControlChange(70, (msg) => {
        appState.midiParams.shapeScale = (midiNorm(msg.data2)**2) * 3 + 0.1
      })
      midiInput?.onControlChange(71, (msg) => {
        appState.midiParams.shapeRotateSpeed = (midiNorm(msg.data2)**2) * 0.3
      })
      midiInput?.onControlChange(72, (msg) => {
        appState.midiParams.shapeCenterLerp = midiNorm(msg.data2)
      })
      midiInput?.onControlChange(73, (msg) => {
        appState.midiParams.finalFade = midiNorm(msg.data2)
      })
      midiInput?.onControlChange(74, (msg) => {
        appState.midiParams.paletteLerp = midiNorm(msg.data2)
      })
      midiInput?.onControlChange(75, (msg) => {
        appState.midiParams.colorOscSpeed = (midiNorm(msg.data2)**2) * 0.3
      })
      midiInput?.onControlChange(76, (msg) => {
        appState.midiParams.bloomIntensity = 0.5 + (midiNorm(msg.data2)**1.5) * 10
      })
      midiInput?.onControlChange(77, (msg) => {
        appState.midiParams.fadeawayDuration = (midiNorm(msg.data2)**2)
      })

    }

    //todo - this breaks with hotreload and pop-out canvas
    // let p5Mouse = { x: 0, y: 0 }
    // mousemoveEvent((ev) => {
    //   p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    // }, threeCanvas)

    const code = () => { //todo template - is this code-array pattern really needed in the template?

      appState.drawFunctions.push((p5i: p5) => {
        debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height)
      })
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
  console.log("onUnmounted", appState.loadCount)
  console.log("disposing livecoded resources")
  clearDrawFuncs()
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  // timeLoops.forEach(tl => tl.cancel())
  for (const [id, shape] of shapeRenderMap) {
    shape.shaderGraphEndNode.disposeAll()
  }
  shapeRenderMap.clear()
})
</script>

<template>
  <Teleport to="#topPageControls">
    <AutoUI :object-to-edit="appState.voiceParams as TreeProp"/>
  </Teleport>
</template>

<style scoped></style>./customFx