<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri, naiveSleep } from '@/channels/channels';
import { FAUST_AUDIO_CONTEXT_READY, FaustTestVoice, MPEPolySynth, type MPEVoiceGraph } from '@/music/mpeSynth';
import { FaustTestVoice as FaustOscillatorVoice } from '@/music/FaustSynthTemplate';
import { Scale } from '@/music/scale';
import { dateNow } from '@/channels/base_time_context';
import { mapMidiInputToMpeSynth, MIDI_READY, midiInputs } from '@/io/midi';
// import { FaustOperatorVoice } from '@/music/FaustOperatorPresetWrapper';
import { FaustOperatorVoicePrecompiled } from '@/music/FaustOperatorPrecompiled/FaustOperatorPrecompiled';
import { operatorPreset } from './operator_preset';

const appState = inject<TemplateAppState>(appStateName)!!
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

function circleArr(n: number, rad: number, p: p5) {
  const center = { x: p.width / 2, y: p.height / 2 }
  const sin1 = (x: number) => Math.sin(x * 2 * Math.PI)
  const cos1 = (x: number) => Math.cos(x * 2 * Math.PI)
  return xyZip(0, cos1, sin1, n).map(({ x, y }) => ({x: x*rad + center.x, y: y*rad + center.y}))
}

const playNote = <T extends MPEVoiceGraph>(note: number, velocity: number, beats: number, synth: MPEPolySynth<T>, ctx: TimeContext) => {
  ctx.branch(async (ctx) => {
    const voice = synth.noteOn(note, velocity, 0, 0)
    await ctx.wait(beats)
    synth.noteOff(voice)
  })
}

const scale = new Scale()
const startLoop = <T extends MPEVoiceGraph>(synth: MPEPolySynth<T>) => {
  const playNoteLoop = launchLoop(async (ctx) => {
    ctx.bpm = 120
    // ctx.branch(async (ctx) => {
    //   while (true) {
    //     synth.setParam('Filter', 300 + sinN(ctx.time*0.2) * 1000)
    //     await ctx.waitSec(0.01)
    //   }
    // })
    while (true) {
      const randDegree = Math.floor(Math.random() * 8)
      const note0 = scale.getByIndex(randDegree)
      const note1 = scale.getByIndex(randDegree + 2)
      playNote(note0, 100, 0.5, synth, ctx)
      ctx.branch(async (ctx) => {
        await ctx.wait(0.01 + sinN(ctx.time*0.2) * 0.5)
        playNote(note1, 100, 0.5, synth, ctx)
      })
      console.log("played notes", note0, note1)
      await ctx.wait(1)
    }
  })
  return playNoteLoop
}

const modIndexRef = ref(21)
const synth = new MPEPolySynth(FaustOperatorVoicePrecompiled, 16, false, true)
const setModIndex = (v: number) => {
  modIndexRef.value = v
  synth.setBatchParams({ "/operator/ModIndex": v })
}
const modCurveRef = ref(1)
const setModCurve = (v: number) => {
  modCurveRef.value = v
  synth.setBatchParams({ "/operator/ModCurve": v })
}

const modChainCurveRef = ref(1)
const setModChainCurve = (v: number) => {
  modChainCurveRef.value = v
  synth.setBatchParams({ "/operator/ModChainCurve": v })
}

const mod2modRef = ref(1)
const setMod2mod = (v: number) => {
  mod2modRef.value = v
  synth.setBatchParams({ "/operator/Mod2Mod": v })
}

const setParams = (synth: MPEPolySynth<FaustOperatorVoicePrecompiled>) => {
  const params = { 
    ...operatorPreset, 
    "/operator/PolyGain": 0.2,
    "/operator/ModIndex": modIndexRef.value,
    "/operator/ModCurve": modCurveRef.value,
    "/operator/ModChainCurve": modChainCurveRef.value,
    "/operator/Mod2Mod": mod2modRef.value,
  }
  synth.setBatchParams(params)
}

onMounted(async () => {
  try {

    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement

    const initialCiclePos = appState.circles.list.map(c => ({ x: c.x, y: c.y }))

    await FAUST_AUDIO_CONTEXT_READY
    console.log("faust audio context ready")

    
    // todo api - need a promise on the MPEPolySynth to know when the voices are ready
    await synth.synthReady()



    // const synth = new MPEPolySynth(FaustOperatorVoice, 16, false, true)
    // console.log("synth created")
    // await synth.synthReady()
    // console.log("synth ready")

    await MIDI_READY
    const iac1 = midiInputs.get('IAC Driver Bus 1')!!
    mapMidiInputToMpeSynth(iac1, synth, false)
    console.log("mapped midi input to synth")

    setParams(synth)

    setTimeout(() => {
      Array.from(synth.voices.values()).slice(0, 1).forEach(v => {
        console.log("voice", v.voice.getAllParams())
      })
    }, 1000)

    // const playNoteLoop = startLoop(synth)



    // const voice = synth.noteOn(60, 100, 0, 0)
    // const params = voice.getAllParams()
    // console.log("params", params)
    // setTimeout(() => {
    //   // voice.setBatchParams({
    //   //   "/operator/Gate": 1,
    //   // })
    //   // const params2 = voice.getAllParams()["/operator/Gate"]
    //   console.log("params2", params["/operator/Gate"])
    // }, 1000)

    // const voice = new FaustOperatorVoicePrecompiled(5)
    // // const voice = new FaustOscillatorVoice(5)
    // await voice.ready()
    // voice.noteOn(60, 100, 0, 0)
    // setTimeout(() => {
    //   const params = voice.getAllParams()
    //   console.log("params", params["/operator/Gate"])
    // }, 1000)


    let p5Mouse = { x: 0, y: 0 }
    mousemoveEvent((ev) => {
      p5Mouse = targetToP5Coords(ev, p5i, threeCanvas)
    }, threeCanvas)

    const code = () => { //todo template - is this code-array pattern really needed in the template?
      clearDrawFuncs() //todo template - move this to cleanup block?
      appState.circles.list.forEach(c => c.debugDraw = false)

      const drawingCursor = (p: p5) => {
        p.push()
        p.strokeWeight(10)
        p.stroke(255, 0, 0)
        p.noFill()
        p.circle(p5Mouse.x, p5Mouse.y, 30)
        p.pop()
      }

      let seqInd = 0
      launchLoop(async (ctx) => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (appState.circles.list.length > 0) {
            const randIndex = Math.floor(Math.random() * appState.circles.list.length)
            seqInd = (seqInd + 1) % appState.circles.list.length
            appState.circles.list[seqInd].trigger()
          }
          await ctx.waitSec(0.05)
        }
      })

      let lerpEvt = new Ramp(1)
      let lerpLoop: CancelablePromisePoxy<any> | undefined = undefined
      singleKeydownEvent('f', (ev) => {
        const basePositions = appState.circles.list.map(c => ({ x: c.x, y: c.y }))
        const targetPositions = circleArr(appState.circles.list.length, 300, p5i)

        const lerp = (t: number) => {
          appState.circles.list.forEach((c, i) => {
            c.x = initialCiclePos[i].x + (targetPositions[i].x - initialCiclePos[i].x) * t
            c.y = initialCiclePos[i].y + (targetPositions[i].y - initialCiclePos[i].y) * t
          })
        }

        lerpLoop?.cancel()
        lerpEvt = new Ramp(2)
        lerpEvt.trigger()
        lerpLoop = launchLoop(async (ctx) => {
          while (lerpEvt.val() < 1) {
            const v  =lerpEvt.val()
            const triVal = tri(v)
            // console.log("triVal", triVal)
            lerp(triVal)
            await ctx.waitFrame()
          }
          appState.circles.list.forEach((c, i) => {
            c.x = initialCiclePos[i].x
            c.y = initialCiclePos[i].y
          })

        })
      })


      //sketchTodo - make all of these listen on threeCanvas
      singleKeydownEvent('d', (ev) => {
        appState.drawing = !appState.drawing
        console.log("drawing: " + appState.drawing)
        if (appState.drawing) {
          appState.drawFuncMap.set("debugDraw", drawingCursor)
        } else {
          appState.drawFuncMap.delete("debugDraw")
        }
      })

      singleKeydownEvent('s', (ev) => {
        if (appState.drawing) {
          const newCircle = new PulseCircle(p5Mouse.x, p5Mouse.y, 100)
          newCircle.debugDraw = false
          appState.circles.pushItem(newCircle)
          initialCiclePos.push({ x: newCircle.x, y: newCircle.y })
          console.log("adding circle", newCircle)
        }
      })

      
      appState.drawFunctions.push((p: p5) => {
        // console.log("drawing circles", appState.circles.list.length)
        appState.circles.list.forEach(c => c.draw(p))
      })

      const passthru = new Passthru({ src: p5Canvas })
      const canvasPaint = new CanvasPaint({ src: passthru })

      shaderGraphEndNode = canvasPaint
      appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
      singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    code() 
  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <div style="margin-left: 10px;">
    <label for="modIndex">ModIndex</label>
    <input type="range" :value="modIndexRef" @input="setModIndex(($event.target as HTMLInputElement).valueAsNumber)" min="1" max="100" step="0.1" />
    <div>{{ modIndexRef }}</div>
    <label for="modCurve">ModCurve</label>
    <input type="range" :value="modCurveRef" @input="setModCurve(($event.target as HTMLInputElement).valueAsNumber)" min="0.01" max="10" step="0.01" />
    <div>{{ modCurveRef }}</div>
    <label for="modChainCurve">ModChainCurve</label>
    <input type="range" :value="modChainCurveRef" @input="setModChainCurve(($event.target as HTMLInputElement).valueAsNumber)" min="0.01" max="10" step="0.01" />
    <div>{{ modChainCurveRef }}</div>
    <label for="mod2mod">Mod2Mod</label>
    <input type="range" :value="mod2modRef" @input="setMod2mod(($event.target as HTMLInputElement).valueAsNumber)" min="0.01" max="16" step="0.01" />
    <div>{{ mod2modRef }}</div>
  </div>
</template>

<style scoped></style>