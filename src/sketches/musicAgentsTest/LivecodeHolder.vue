<!-- eslint-disable @typescript-eslint/no-unused-vars -->
<script setup lang="ts">
import { type TemplateAppState, PulseCircle, appStateName } from './appState';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import { CanvasPaint, Passthru, type ShaderEffect } from '@/rendering/shaderFX';
import { clearListeners, mousedownEvent, singleKeydownEvent, mousemoveEvent, targetToP5Coords } from '@/io/keyboardAndMouse';
import type p5 from 'p5';
import { launch, type CancelablePromisePoxy, type TimeContext, xyZip, cosN, sinN, Ramp, tri } from '@/channels/channels';
import { type LoopHandle } from '@/channels/base_time_context'
import { Scale } from '@/music/scale'
import { MIDI_READY, midiOutputs } from '@/io/midi';
import seedrandom from 'seedrandom'

import { generateUUID, lerp } from 'three/src/math/MathUtils.js';
import { brd, choiceNoReplaceN, weightedChoice } from '@/utils/utils';

import testJson from './test_json.json'
import { AbletonClip, INITIALIZE_ABLETON_CLIPS, clipMap } from '@/io/abletonClips';
import { playClip } from '@/music/clipPlayback';
import type { MIDIValOutput } from '@midival/core';

const j = testJson.key1

const options = {
    licenseKey: 'gpl-v3'
};




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

let noteWait = appState.UIState.noteWait
let noteWaitUseLfo = appState.UIState.noteWaitUseLfo
let velocity = appState.UIState.velocity
let velocityUseLfo = appState.UIState.velocityUseLfo
let shuffleSeed = appState.UIState.shuffleSeed
let shuffleSeedUseLfo = appState.UIState.shuffleSeedUseLfo
let noteLen = appState.UIState.noteLen
let noteLenUseLfo = appState.UIState.noteLenUseLfo

const RUNNING = ref(true)
const PLAYING = ref(false)

onMounted(async () => {
  try {

    await MIDI_READY
    await INITIALIZE_ABLETON_CLIPS('src/sketches/musicAgentsTest/synths Project/polymeter.als')


    const p5i = appState.p5Instance!!
    const p5Canvas = document.getElementById('p5Canvas') as HTMLCanvasElement
    const threeCanvas = document.getElementById('threeCanvas') as HTMLCanvasElement


    let scale = new Scale()
    const cHarmonicMajorScale = new Scale([0, 2, 4, 5, 7, 8, 11, 12], 60)

    // eslint-disable-next-line no-inner-declarations
    function progGen(scale: Scale, roots: number[], shape: number[]) {
      const shell9 = shape
      const prog = roots.map(r => scale.getShapeFromInd(r, shell9))
      return prog
    }

    const progRoots = [0, 1, 2, 9, 10]
    // const progRoots = [0, 1, 2, 9, 10].map(e => e + 1)
    // const progRoots = [0, 1, 2, 9, 10].map(e => e + 3)
    // const progRoots = [0, 1, 2, 9, 10].map(e => e + 5)
    const triad = [0, 2, 4]
    const shell9 = [0, 2, 6, 8]
    let shape = triad
    let prog = progGen(cHarmonicMajorScale, progRoots, shape)

    /**
     * use drums to root the rhythms 
     * miles okazaki - open music experiments
     * kim cass - bassist - playing with subdivisions to change feel of tempo 
     * 
     * when playing with guitar, can have midi switch the guitar tone/fx in corrdination
     * with the generative scheme (or even switch the harmonizer with the key change)
     */

    const iac1 = midiOutputs.get('IAC Driver Bus 1')!!
    const iac2 = midiOutputs.get('IAC Driver Bus 2')!!
    const iac3 = midiOutputs.get('IAC Driver Bus 3')!!
    const iac4 = midiOutputs.get('IAC Driver Bus 4')!!
    const iac5 = midiOutputs.get('IAC Driver Bus 5')!!
    const iac6 = midiOutputs.get('IAC Driver Bus 6')!!
    const iac7 = midiOutputs.get('IAC Driver Bus 7')!!
    const iac8 = midiOutputs.get('IAC Driver Bus 8')!!

    const drum0 = () => clipMap.get('drum0')!!.clone()
    const bass = () => clipMap.get('bass')!!.clone()
    const mel = () => clipMap.get('mel')!!.clone()
    const high = () => clipMap.get('high')!!.clone()
    const liveClips = [drum0, bass, mel, high]

    const debugBass = () => clipMap.get('debugBass')!!.clone()
    const debugMel = () => clipMap.get('debugMel')!!.clone()
    const debugHigh = () => clipMap.get('debugHigh')!!.clone()

    const playNote = (pitch: number, velocity: number, ctx?: TimeContext, noteDur?: number, inst = iac1) => {
      if(!PLAYING.value) return
      inst.sendNoteOn(pitch, velocity)
      let noteIsOn = true
      ctx?.branch(async ctx => {
        await ctx?.wait((noteDur ?? 0.1) * 0.98)
        inst.sendNoteOff(pitch)
        noteIsOn = false
      }, "note").finally(() => {
        //todo bug - the finally block of closing notes when a loop is cancelled is not
        //always exectuing in the time/order expected, sometimes cutting off the first note
        //in the next iteration of a loop
        inst.sendNoteOff(pitch)
      })
    }



    const straightPlay = async (ctx: TimeContext, clip: () => AbletonClip, midi: MIDIValOutput) => {
      while (!ctx.isCanceled) {
        for (const [i, nextNote] of clip().noteBuffer().entries()) {
          await ctx.wait(nextNote.preDelta)
          playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, midi)
          await ctx.wait(nextNote.postDelta ?? 0)
        }
      }
    }

    /**
     * 
     * todo feature - an RNG where you can set a flag for whether to return the last random value or not
     * - will let you have the same number across a set of invocations, useful for stuff like having all 
     * random slice calls over multiple loops/branches all return the same slice area relative to their root clip
     * 
     * in general, think about ergonomic + musically relevant ways to communicate/coordinate across voices
     */



    abstract class VoiceAgent<T> {
      name: string
      ctx: TimeContext
      runningLoop: LoopHandle | undefined
      globalState: T
      abstract play(): void
      constructor(ctx: TimeContext, name: string, globalState: T) {
        this.ctx = ctx
        this.name = name
        this.globalState = globalState
      }
    }

    class SimplePlayerAgent<T> extends VoiceAgent<T> {
      clipGetter: () => AbletonClip
      midiOut: MIDIValOutput
      constructor(ctx: TimeContext, name: string, globalState: T, clipGetter: () => AbletonClip, midiOut: MIDIValOutput) {
        super(ctx, name, globalState)
        this.clipGetter = clipGetter
        this.midiOut = midiOut
      }
      play() {
        this.runningLoop = this.ctx.branch(async ctx => straightPlay(ctx, this.clipGetter, this.midiOut), "simple player")
      }
    }

    let syncCount = 0

    class SyncableAgent<T extends {syncPoints: Map<string, number>}> extends VoiceAgent<T> {
      clipGetter: () => AbletonClip
      midiOut: MIDIValOutput
      localSyncCount = 0
      constructor(ctx: TimeContext, name: string, globalState: T, clipGetter: () => AbletonClip, midiOut: MIDIValOutput) {
        super(ctx, name, globalState)
        this.clipGetter = clipGetter
        this.midiOut = midiOut
      }
      play() {
        this.runningLoop = this.ctx.branch(async ctx => straightPlay(ctx, this.clipGetter, this.midiOut), "inital sync agent play")
      }
      resync = (waitTime: number) => {
        console.log("sketchLog resyncing", this.runningLoop)
        this.runningLoop?.cancel()
        this.localSyncCount++
        const snapShotSyncCount = this.localSyncCount + 0
        const debugName = "playBranch-"+snapShotSyncCount
        this.runningLoop = this.ctx.branchWait(async ctx => {
          const rand0 = Math.random().toFixed(3)
          console.log("sketchLog branch launch", ctx.debugName, rand0, snapShotSyncCount)
          // await ctx.wait(waitTime)
          while (!ctx.isCanceled) {
            const clip = this.clipGetter()
            // this.globalState.syncPoints.set(this.name, ctx.beats + clip.duration) //todo check - is this correct?
            const rand1 = Math.random().toFixed(3)
            console.log("sketchLog setting end time", ctx.debugName, rand0, rand1)
            for (const [i, nextNote] of clip.noteBuffer().entries()) {
              await ctx.wait(nextNote.preDelta)
              playNote(nextNote.note.pitch, nextNote.note.velocity, ctx, nextNote.note.duration, this.midiOut)
              await ctx.wait(nextNote.postDelta ?? 0)
            }
          }
          console.log("sketchLog", this.name, "loop cancelled")
        }, debugName)
        this.runningLoop.finally(() => {
          console.log("sketchLog", debugName, "loop finally")
        })
      }
    }
    //general pattern - agents don't talk to each other directly, they talk to a global state
    //eg, a sync agent doesn't trigger sync to other sync agents, a SyncOrchestrator designates
    //when/who to sync. All agents should be given the SAME global state object

    //should agents start themselves (yes unless otherwise necessary), or should they be started by a global orchestrator?
    // current decsion -  minimize coupling between agent types
    class SyncOrchestratorAgent<T extends { syncPoints: Map<string, number>, agents: VoiceAgent<T>[] }> extends VoiceAgent<T> {
      syncInterval: number
      syncLeaderName: string
      constructor(ctx: TimeContext, name: string, globalState: T, syncInterval: number, syncLeader: string) {
        super(ctx, name, globalState)
        this.syncInterval = syncInterval
        this.syncLeaderName = syncLeader
      }
      play() {
        this.runningLoop = this.ctx.branch(async ctx => {
          while (!ctx.isCanceled) {
            await ctx.wait(this.syncInterval)
            this.syncToLeader(ctx, this.syncLeaderName)
          }
        }, "orchestrator")
      }

      async syncToLeader(ctx: TimeContext, syncLeaderName: string) {
        const syncableAgents = this.globalState.agents.filter(agent => agent instanceof SyncableAgent) as SyncableAgent<T>[]
        const syncWait = (this.globalState.syncPoints.get(syncLeaderName) ?? ctx.beats) - ctx.beats //todo check - is this correct? 
        await ctx.wait(syncWait)
        let resyncCount = 0
        for (const agent of syncableAgents) {
          agent.resync(0)
          resyncCount++
        }
        console.log("sketchLog syncing to leader", syncLeaderName, "wait", syncWait, "time", ctx.progBeats, "syncCount", syncCount++, "resyncCount")
      }

    }

    /**
     * root cause of timing issue - what calls to wait() end up deriving a negative wait time for setTimeout:
     * Bhere is root time context, and then 2 agents (syncer and syncee) that act on branches of the time context.
     * Both of these agents call branch instead of branchWait, so the logical time of the root context never gets updated. 
     * Thus, when you call wait() in the SyncableAgent.resync() function, that branch() call inherits the inital start time
     * of the root context, but the derived wait time is (logicalTime + wait) - performance.now()/1000. That performance.now()
     * has moved ahead in time in the "real world", but there have been no messages to the parent to update its time to the real world.
     * Somehow, when you update a child context's logical time with a wait(), you also need to propgate the wait up to the 
     * parent, so the parent is always as updated as it's most recently updated child. 
     * 
     * Alternatively, for every TimeContext, you need to give it some reference to its wallclock time of when it started so it can 
     * operate its waits() independently?
     * 
     * Likely you need some combination of these to handle all edge cases.
     * 
     * Is it more ergonomic to have a clock abstraction like in supercollider?
     * 
     * 
     * the way the kotlin system works
     * - all coroutines are backed by a single supercollider clock
     * - launchCoro sets the root of a branch tree - every branch tree is backed by a single  
     *   "coroStart" value - the supercollider clock time when that root was started
     * - every branch inherits its time from its parent
     * - would above issue still be a problem in kotlin? maybe not, because SyncableAgent.resync() would by default update parent here?
     * 
     * 
     * there are 2 different problems to solve:
     * 1. adjusting for drift when using setTimeout
     * 2. properly handling the logical time updates between parents and children 
     * The are connected by the fact that ??? 
     * 
     * 
     * in js TimeContexts, have several values and think of how to use all of them to resolve final time update
     * - context.time
     * - context.mostRecentDescendantTime (aka root.mostRecentDescendentTime)
     * - context.acumulatedLogicalWaits
     * - something to handle branchWait()? do we even need something for this if we have context.mostRecentDescendantTime?
     * - performance.now()
     * 
     * idea - when branching, branch()'s start time is always root.mostRecentDescendentTime (assuming whole app rooted at a single time context)?
     * - proof of correctness? - js is single threaded, so if code is executing, some wait must JUST have finished,
     *   so logical time should be very close to wall clock time (e.g within jitter range)
     * - corner case - when branching due to external input (UI/network), have a branchLive() that sets time to performance.now(),
     *   and then have the branch's internal logic wait appropriately to get back on the grid if desired. 
     * - corner case - cancelled loops? - wait() call needs to throw exception or something when canceleld so that the code after 
     *   the wait call is not executed. abortHandler is already to reject() wait promise on cancel, but does it need an exception 
     *   to fully guarantee that the code after the wait call is not executed?
     *   -  actually, current implementation already seems to do that 
     * 
     * might also be useful to have some way to "backwards quantize" (e.g, simulate having branched earlaier) for the case where
     * you want to launch a clip on the beat and are slightly off but don't want to wait a whole beat. This should
     * probably be some helper for user-logic when playing a "clip" vs a part of the underlying timing API. 
     */
      

    
    const code = () => {
      clearDrawFuncs()

      // launchLoop(async ctx => {
      //   while (RUNNING.value) {
      //     await ctx.waitFrame()
      //     if(noteWaitUseLfo.value) noteWait.value = 0.1 + sinN(Date.now() / 1000 * 0.02) * 0.3 
      //     if(velocityUseLfo.value) velocity.value = sinN(Date.now() / 1000 * 0.17) * 30 + 50
      //     if (shuffleSeedUseLfo.value) shuffleSeed.value = Math.floor(1 + sinN(Date.now() / 1000 * 0.13) * 5)
      //     if (noteLenUseLfo.value) noteLen.value = 0.05 + Math.pow(tri(Date.now() / 1000 * 0.07), 1) * .95
      //   }
      // })

      /**
       * todo sketch:
       *  - have some nice modularized LFO state/type/UI-component
       *  - have LFOs run based on loop context time (and make sure a root context always starts at 0)
       *  - take all Math.random calls and convert them to some kind of LFO or at least add a way to pause randomness and manually set them
       * 
       * musical
       *  - more musically considered approach to chord progression slicing
       *    - do it in such a way that you can practice playing over the changes 
       *      (or at least make it structured enought that a "live score" is reasonably playable)
       *  - a mode where the rhythm is flat/straight 16ths
       *  - add more subdivisions and phrase types to the bass (or a counterpoint?) or counter point on middle voice
       * 
       * add visuals
       *  - colors pallete for different scale or chord shapes 
       *  - color variation for the other of scale/chord shape
       *  - some type of complex shape(s) with interlocking movements for bass+melody for a single "two hand phrase"
       */

      type polymeterAgentState = {
        syncPoints: Map<string, number>,
        agents: VoiceAgent<any>[]
      }

      const agentState: polymeterAgentState = {
        syncPoints: new Map(),
        agents: []
      }

      launchLoop(async (ctx) => {

        ctx.bpm = 60
        ctx.debugName = "parent"

        // const drumAgent = new SyncableAgent(ctx, 'drum0', agentState, drum0, iac1)
        // const bassAgent = new SyncableAgent(ctx, 'bass', agentState, bass, iac2)
        // const melAgent = new SyncableAgent(ctx, 'mel', agentState, mel, iac3)
        // const highAgent = new SyncableAgent(ctx, 'high', agentState, high, iac4)
        // const syncOrchestrator = new SyncOrchestratorAgent(ctx, 'syncOrchestrator', agentState, 16, 'drum0')

        const debugBassAgent = new SyncableAgent(ctx, 'debugBass', agentState, debugBass, iac2)
        const debugMelAgent = new SyncableAgent(ctx, 'debugMel', agentState, debugMel, iac3)
        // const debugHighAgent = new SyncableAgent(ctx, 'debugHigh', agentState, debugHigh, iac4)
        const syncOrchestrator = new SyncOrchestratorAgent(ctx, 'syncOrchestrator', agentState, 4, 'debugBass')

        agentState.agents = [debugBassAgent, debugMelAgent, syncOrchestrator]

        agentState.agents.forEach(agent => agent.play())
        
      })

      // const passthru = new Passthru({ src: p5Canvas })
      // const canvasPaint = new CanvasPaint({ src: passthru })

      // shaderGraphEndNode = canvasPaint
      // appState.shaderDrawFunc = () => shaderGraphEndNode!!.renderAll(appState.threeRenderer!!)
      
      // singleKeydownEvent('p', (ev) => { appState.paused = !appState.paused })
    }

    appState.codeStack.push(code)
    code() 
  } catch (e) {
    console.warn(e)
  }

})



onUnmounted(() => {
  console.log("disposing livecoded resources")
  // shaderGraphEndNode?.disposeAll()
  clearListeners()
  timeLoops.forEach(tl => tl.cancel())
})

</script>

<template>
  <div>
    <!-- create sliders for noteWait -->
    <div>
      <input type="checkbox" id="noteWaitLfo" v-model="noteWaitUseLfo">
      <label for="noteWaitLfo">lfo</label>
      <input type="range" min="0" max="1" step="0.01" id="noteWait" v-model.number="noteWait">
      <label for="noteWait">Note Wait</label>
      <br>
      <input type="checkbox" id="velocityLfo" v-model="velocityUseLfo">
      <label for="velocityLfo">lfo</label>
      <input type="range" min="0" max="127" step="1" id="velocity" v-model.number="velocity">
      <label for="velocity">Velocity</label>
      <br>
      <input type="checkbox" id="shuffleSeedLfo" v-model="shuffleSeedUseLfo">
      <label for="shuffleSeedLfo">lfo</label>
      <input type="range" min="1" max="6" step="1" id="shuffleSeed" v-model.number="shuffleSeed">
      <label for="shuffleSeed">Shuffle Seed</label>
      <br>
      <input type="checkbox" id="noteLenLfo" v-model="noteLenUseLfo">
      <label for="noteLenLfo">lfo</label>
      <input type="range" min="0" max="2" step="0.01" id="noteLen" v-model.number="noteLen">
      <label for="noteLen">Note Length</label>
      <br>
      <input type="checkbox" id="running" v-model="RUNNING">
      <label for="running">Running</label>
      <input type="checkbox" id="playing" v-model="PLAYING">
      <label for="playing">Playing</label>
    </div>
  </div>
</template>

<style scoped></style>