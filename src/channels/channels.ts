import { Region } from '@/sketches/devTest/appState'
import { lerp } from 'three/src/math/MathUtils.js'
import * as Tone from 'tone'
import * as a from '@/sketches/devTest/planeAnimations'
import p5 from 'p5'
import { runTests } from './channelTests'


//todo api - make then/catch/finally chainable on CancelablePromisePoxy
export class CancelablePromisePoxy<T> implements Promise<T> {
  public promise?: Promise<T>
  public abortController: AbortController
  public timeContext?: TimeContext

  constructor(ab: AbortController) {
    this.abortController = ab
  }

  public cancel() {
    this.abortController.abort()
    this.timeContext?.cancel() //todo api - need to detangle relations between promise, context, abort controller
  }

  [Symbol.toStringTag]: string = '[object CancelablePromisePoxy]'

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.promise!!.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.promise!!.catch(onrejected)
  }

  //todo bug - does this properly work? can use to to clean up note-offs
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.promise!!.finally(onfinally)
  }
}

let contextId = 0

//todo api - is there a way to have this be both generic and type safe?
type Constructor<T> = new (time: number, ab: AbortController, id: number, cancelPromise: CancelablePromisePoxy<any>) => T;


function createAndLaunchContext<T, C extends TimeContext>(block: (ctx: C) => Promise<T>, rootTime: number, ctor: Constructor<C>, updateParent: boolean, parentContext?: C): CancelablePromisePoxy<T> {
  const abortController = new AbortController()
  const promiseProxy = new CancelablePromisePoxy<T>(abortController)
  const newContext = new ctor(rootTime, abortController, contextId++, promiseProxy)
  promiseProxy.timeContext = newContext
  if (parentContext) {
    newContext.bpm = parentContext.bpm
    parentContext.childContexts.add(newContext)
  }
  const blockPromise = block(newContext)
  promiseProxy.promise = blockPromise
  const bp = blockPromise.catch((e) => {
    const err = e as Error
    console.log('promise catch error', err, err?.message, err?.stack)
  })
  if (parentContext) {
    bp.finally(() => {
      //todo bug - should be able to always update parent right? why does this only work when both flagged and awaited
      if (updateParent) parentContext.time = Math.max(newContext.time, parentContext.time) 
      parentContext.childContexts.delete(newContext)
    })
  }
  return promiseProxy
}

const USE_TONE = false
//todo hotreload - need to register all launches to global state so they can be canceled on hot reload
export function launch<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T> {
  if(USE_TONE) return createAndLaunchContext(block, Tone.Transport.immediate(), ToneTimeContext, false)
  else return createAndLaunchContext(block, performance.now()/1000, DateTimeContext, false)
}

//todo draft - need to test generalized TimeContext implementation in loops
export abstract class TimeContext {
  public abortController: AbortController
  public time: number
  public startTime: number
  public isCanceled: boolean = false
  public get progTime(): number {
    return this.time - this.startTime
  }
  public get progBeats(): number {
    return this.progTime * this.bpm / 60
  }
  public id: number
  public bpm: number = 120
  public cancelPromise: CancelablePromisePoxy<any>
  public childContexts: Set<TimeContext> = new Set()

  constructor(time: number, ab: AbortController, id: number, cancelPromise: CancelablePromisePoxy<any>) {
    this.time = time
    this.startTime = time
    this.abortController = ab
    this.id = id
    this.abortController.signal.addEventListener('abort', () => {
      this.isCanceled = true
      console.log('abort')
    })
    this.cancelPromise = cancelPromise
  }

  public branch<T>(block: (ctx: TimeContext) => Promise<T>) {
    const promise = createAndLaunchContext(block, this.time, Object.getPrototypeOf(this).constructor, false, this)
    //todo api - this allows you to manage a branch without accidentally awaiting on it in a way that
    //would screw up parent context time. but in general, awaiting on anything other than
    //ctx.wait[Time] or ctx.branchWait will screw up contextTime <=> wallClock time relationship.
    //there might be no way to have a unified branch function.
    return {
      finally: (finalFunc: () => void) => {
        promise.finally(finalFunc)
      },
      cancel: () => {
        promise.cancel()
      }
    }
  }

  public branchWait<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T> {
    return createAndLaunchContext(block, this.time, Object.getPrototypeOf(this).constructor, true, this)
  } 

  public cancel() {
    this.abortController.abort()
    this.childContexts.forEach((ctx) => ctx.cancel())
  }

  public abstract waitSec(sec: number): Promise<void>
  public wait(beats: number) {
    return this.waitSec(beats * 60 / this.bpm)
  }
  public waitFrame(): Promise<void> {
    if (this.isCanceled) {
      throw new Error('context is canceled')
    }
    const ctx = this
    return new Promise<void>((resolve, reject) => {
      const listener = () => { reject(); console.log('abort') }
      ctx.abortController.signal.addEventListener('abort', listener)
      //resolve the promise on the call to requestanimationframe
      requestAnimationFrame(() => {
        ctx.abortController.signal.removeEventListener('abort', listener)
        resolve()
      })
    })
  }
}

class ToneTimeContext extends TimeContext {
  public async waitSec(sec: number) {
    if (this.isCanceled) {
      throw new Error('context is canceled')
    }
    const ctx = this
    return new Promise<void>((resolve, reject) => {
      const listener = () => { reject(); console.log('abort') }
      ctx.abortController.signal.addEventListener('abort', listener)
      Tone.Transport.scheduleOnce(() => {
        ctx.time += sec
        ctx.abortController.signal.removeEventListener('abort', listener)
        resolve()
      }, ctx.time + sec)
    })
  }
}

class DateTimeContext extends TimeContext{
  public async waitSec(sec: number) {
    // console.log('wait', sec, this.id, this.time.toFixed(3))
    if (this.isCanceled) {
      throw new Error('context is canceled')
    }
    const ctx = this
    return new Promise<void>((resolve, reject) => {
      const listener = () => { reject(); console.log('abort') }
      ctx.abortController.signal.addEventListener('abort', listener)
      const waitTime = this.time + sec - performance.now() / 1000
      const waitStart = performance.now()
      setTimeout(() => {
        ctx.time += sec
        ctx.abortController.signal.removeEventListener('abort', listener)
        resolve()
        const waitDuration = performance.now() - waitStart
        // console.log('wait duration', (waitDuration / 1000).toFixed(3), 'wait time', waitTime.toFixed(3))
        if(waitDuration/1000 - waitTime > 0.010) console.log('wait duration deviation greater than 10 ms')
      }, waitTime * 1000)
    })
  }
}

const audioStart = async () => {
  await Tone.start()
  Tone.Transport.start()
  console.log('audio is ready', Tone.Transport.bpm.value, Tone.context.lookAhead)
  // setTimeout(testCancel, 50)
  document.querySelector('body')?.removeEventListener('click', audioStart)
}
document.querySelector('body')?.addEventListener('click', audioStart)

export const testCancel = async () => {

  launch(async (ctx) => {
    const stepVal = 0.2

    const start = ctx.time
    const start2 = performance.now()  + (USE_TONE ? Tone.context.lookAhead * 1000 : 0)
    let drift, lastDrift = 0
    const res0 = ctx.branchWait(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        const [logicalTime, wallTime] = [ctx.time - start, (performance.now() - start2) / 1000] //todo bug - is this correct?
        drift = wallTime - logicalTime 
        const driftDelta = drift - lastDrift
        console.log('step', i, "logicalTime", logicalTime.toFixed(3), "wallTime", wallTime.toFixed(3), "drift", drift.toFixed(3), "driftDelta", driftDelta.toFixed(3))
        lastDrift = drift
        await ctx.waitSec(stepVal)
      }
    })

    await ctx.branchWait(async (ctx) => {
      await ctx.waitSec(stepVal * 10)
      console.log('res0 cancel', performance.now() - start2)
      res0.cancel()
    })

    console.log("parent context time elapsed", ctx.progTime.toFixed(3))
  })
}



interface Envelope {
  hold(time?: number): Envelope
  release(time?: number): Envelope
  trigger(time?: number): Envelope 
  val(time?: number): number
  onFinish?: () => void
  cancel: () => void
  releaseDur: number
  isHeld: boolean
  onTime: number
  releaseTime: number
  started: boolean
}

//an envelope that only triggers - no hold/release
export class Ramp implements Envelope {
  releaseDur = 1
  isHeld = false
  onTime = -1
  releaseTime = -1
  started = false
  constructor(releaseDur: number) {
    this.releaseDur = releaseDur
  }

  scheduleReleaseCallback() {
    delayFunc(() => {
      this.onFinish?.()
    }, this.onTime, this.releaseDur)
    // console.log('scheduled release callback', Tone.Transport.immediate().toFixed(3), this.onTime.toFixed(3), (this.onTime + this.releaseDur).toFixed(3), )
  }

  onFinish?: () => void = undefined

  cancel() {
    this.onFinish = undefined
  }

  hold(time?: number) {
    this.onTime = time ?? now()
    this.started = true
    this.scheduleReleaseCallback()
    return this
  }
  release(time?: number) {
    this.releaseTime = time ?? now()
    return this
  }
  trigger(time?: number) {
    this.releaseTime = this.onTime = time ?? now()
    this.started = true
    this.isHeld = false
    this.scheduleReleaseCallback()
    return this
  }
  val(time?: number): number {
    const queryTime = time ?? now()
    if (!this.started) return 0
    else return Math.min(1, (queryTime - this.onTime) / this.releaseDur)
  }
}

/**
 * note - do not use now() in the calculations for context, only for relative time things
 */

function toneDelay(callback: () => void, nowTime: number, delayTime: number): void {
  Tone.Transport.scheduleOnce(() => {
    callback()
  }, nowTime + delayTime)
}
function dateDelay(callback: () => void, nowTime: number, delayTime: number): void {
  setTimeout(() => {
    callback()
  }, delayTime * 1000)
}

const toneNow = () => Tone.Transport.immediate()
const startTime = performance.now() / 1000
const dateNow = () => performance.now() / 1000 - startTime

export const now = USE_TONE ? toneNow : dateNow
const delayFunc = USE_TONE ? toneDelay : dateDelay
  
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ADSR implements Envelope{
  attack: number = 1
  decay: number = 0
  sustain: number = 1
  releaseDur: number = 0
  releaseLevel: number = 1
  isHeld: boolean = false
  onTime: number = 0
  releaseTime: number = 0
  started: boolean = false
  constructor() {

  }

  scheduleReleaseCallback() {
    delayFunc(() => {
      this.onFinish?.()
    }, this.onTime, this.releaseDur)
  }

  onFinish?: () => void = undefined

  cancel() {
    this.onFinish = undefined
  }

  // get() attackTime => this.onTime + this.attack
  public hold(time?: number) {
    this.onTime = time ?? now()
    this.isHeld = true
    this.started = true
    return this
  }
  public release(time?: number) {
    this.releaseTime = time ?? now()
    this.isHeld = false
    this.scheduleReleaseCallback()
    return this
  }
  public trigger(time?: number) {
    this.releaseTime = this.onTime = time ?? now()
    this.started = true
    this.isHeld = false
    this.scheduleReleaseCallback()
    return this
  }

  //todo later - this might need another intermediate value called offVal that 
  //calculates where the envelope val would have been at queryTime
  //given onTime and offTime. Then, in the relase state, the final
  //lerp is lerp(offVal, relaseLevel, releaseProgress)

  //todo later - figure out how touchdesigner deals with triggered vs on/off events wrt attack/release stages
  public val(time?: number): number {
    const queryTime = time ?? now()
    if (!this.started) return 0
    else {
      if (this.isHeld) {
        const attackEndTime = this.onTime + this.attack
        const decayEndTime = attackEndTime + this.decay
        if (queryTime < attackEndTime) {
          const attackProgress = (queryTime - (attackEndTime)) / this.attack
          return attackProgress
        } else if (queryTime < decayEndTime) {
          const decayProgress = (queryTime - (decayEndTime)) / this.decay
          return lerp(1, this.sustain, decayProgress)
        } else {
          return this.sustain
        }
      } else {
        const releaseProgress = (queryTime - this.releaseTime) / this.releaseDur
        return lerp(this.sustain, this.releaseLevel, releaseProgress)
      }
    }
  }
}

/*
todo later - if you want type inference with feedback loops of chops
you'll have to have a Feedback node (like with TOPs) where you 
explicitly give the type (or else inference won't be possible)

or is is just better to have a "sample" be a map{chanName: number}
each CHOP exposes a "channels" list of arrays, and a sample(ind) method that returns a map{chanName: number}
- would you even need typesafety anywhere?
- if most chops besides generators are defined on the fly by some user-defind processing function
  maybe it would help 
*/

/*
todo later/deep design - event lifecycle
- who manages lifecycle of events? events should probably "run" on their own.
- should events be given a TimeContext to run in to keep all timing tight?
  - want events to run w/o Tone.Transport.lookAhead latency, and to simplify things, 
    they shouldn't need to interact with branching-time context - progression
    of a single event should be launch-and-forget
    - can schedule with Tone.Transport.scheduleOnce(Tone.Transport.immediate(), () => { ... })
- should events have callbacks - use callback to get EventChop to delete the event
*/

/*
do chops have pull-model rendering? time driven chops like eventCHOP or patternCHOP
run on their own, but values only get used when chop graph is pulled from?
overall this seems fine, but how does this play with feedback?

the only time this is a problem for feedback is if the time in between "frames"
is significant for the calculation - (e.g, physics - anything else?)
- also in general, don't need feedback for most things -  can just ignore it for now

*/

export class EventChop<T> {

  idGen: number = 0
  public events: ({ evt: Envelope, metadata: T, id: number })[] = []

  public newEvt(evt: Envelope, metadata: T): void {
    const evtData = { evt, metadata, id: this.idGen++ }
    this.events.push(evtData)
    evt.onFinish = () => {
      // console.log("event finished", evtData.id, now().toFixed(3))
      const idx = this.events.indexOf(evtData)
      this.events.splice(idx, 1)
    }
  }

  public ramp(time: number, metadata: T): Ramp {
    const ramp = new Ramp(time)
    this.newEvt(ramp.trigger(), metadata)
    return ramp
  }
  
  public samples(): (T & { evtId: number, val: number })[] { //some composite type using keysof 
    return this.events.map((evtData) => {
      return {
        ...evtData.metadata,
        evtId: evtData.id,
        val: evtData.evt.val()
      }
    })
  }
}



// eslint-disable-next-line @typescript-eslint/no-unused-vars
function testCalls() {
  const ec = new EventChop<{ reg: Region, aseg: a.AnimationSegment }>()
  const regs: Region[] = []
  ec.newEvt(new Ramp(1).trigger(), { reg: regs[0], aseg: a.lrLine(1) })

  ec.samples().forEach((sample) => {
    sample.aseg.phaseDraw(new p5(() => { }), sample.reg, sample.val)
  })

  launch(async (ctx) => {
    for (let i = 0; i < 10; i++) {
      ec.ramp(1, { reg: regs[i % 4], aseg: a.lrLine(1) })
      ec.ramp(1, { reg: regs[(i+2) % 4], aseg: a.rlLine(1) })
      await ctx.waitSec(1) //todo api - should await be inside the wait() call?
    }
  })
}

/**
 * what people want out of node based systems is to be able to easily see
 * high level data flow, CORE STATE (eg, separating "things" and "transforms on things"), 
 * and to be able to have a formal notion of PROGRESSION OF TIME
 * 
 * can still have your code-based-node system work with callbacks,
 * (e.g, "fluent api" with chains of provided callbacks at each processing step) 
 * just name your callbacks and pass in the variables instead of 
 * defining them all inline. Makes the code cleaner
 * 
 * being able to define functions is auto-componentization - many of the 
 * nodes in a node graph are getting around things that are 1 line of code.
 * in building a "node graph like" code system, don't try to duplicate
 * nodes specifically, try to duplicate the "feel" of the node graph:
 * - easy to see high level data flow
 * - easy to see core state
 * - easy to see progression of time
 * If you define good APIs for core functions and hooks, as well as good utilities,
 * you don't actually need to implement many nodes at all
 * 
 * even "opening a menu of a node object" can be simulated by cmd-clicking to 
 * go to the place where the arguments-variable is defined
 */


export const sinN = (phase: number): number  => {
  return Math.sin(phase * Math.PI * 2) * 0.5 + 0.5
}

export const cosN = (phase: number): number  => {
  return Math.cos(phase * Math.PI * 2) * 0.5 + 0.5
}

export const sin = (phase: number): number  => {
  return Math.sin(phase * Math.PI * 2)
}

export const cos = (phase: number): number  => {
  return Math.cos(phase * Math.PI * 2)
}

export const tri = (phase: number): number => {
  return 1 - Math.abs((phase % 1) * 2 - 1)
}

export const saw = (phase: number): number => {
  return phase % 1
}

export const xyZip = (phase: number, xPat: (phase: number) => number, yPat: (phase: number) => number, count: number = 100, cycles = 1): { x: number, y: number }[] => {
  const out: { x: number, y: number }[] = []
  for (let i = 0; i < count; i++) {
    const p = (i / count) * cycles + phase
    out.push({ x: xPat(p), y: yPat(p) })
  }
  return out
}

export const steps = (start: number, end: number, count: number): number[] => {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    out.push(lerp(start, end, i / count))
  }
  return out
}

runTests()