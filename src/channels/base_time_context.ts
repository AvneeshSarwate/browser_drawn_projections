
// deno-lint-ignore-file no-explicit-any no-unused-vars no-this-alias require-await

const LOG_DELAYS = false

//todo cleanup - copy paste between this and channels.ts
function dateDelay(callback: () => void, nowTime: number, delayTime: number): void {
    setTimeout(() => {
      callback()
    }, delayTime * 1000)
  }
const startTime = performance.now() / 1000
export const dateNow = () => performance.now() / 1000 - startTime
export const beatNow = (bpm: number) => dateNow() * bpm / 60

const now = dateNow
const delayFunc = dateDelay


export class CancelablePromiseProxy<T> implements Promise<T> {
  public promise?: Promise<T>
  public abortController: AbortController
  public timeContext?: TimeContext

  constructor(ab: AbortController) {
    this.abortController = ab
  }

  public cancel() {
    this.abortController.abort()
    this.timeContext?.cancel() //todo api - need to detangle relations between promise, context, abort controller
    //cancel all child contexts
    // this.timeContext?.childContexts.forEach((ctx) => ctx.cancel()) //todo core - need to cancel child contexts properly
  }

  [Symbol.toStringTag]: string = '[object CancelablePromisePoxy]'

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.promise!.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.promise!.catch(onrejected)
  }

  //todo core - need to cancel child contexts properly
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.promise!.finally(onfinally)
  }
}

let contextId = 0

//todo api - is there a way to have this be both generic and type safe?
type Constructor<T> = new (time: number, ab: AbortController, id: number, cancelPromise: CancelablePromiseProxy<any>) => T;


export function createAndLaunchContext<T, C extends TimeContext>(block: (ctx: C) => Promise<T>, rootTime: number, ctor: Constructor<C>, updateParent: boolean, parentContext?: C, debugName: string = ""): CancelablePromiseProxy<T> {
  const abortController = new AbortController()
  const promiseProxy = new CancelablePromiseProxy<T>(abortController)
  const newContext = new ctor(rootTime, abortController, contextId++, promiseProxy)
  newContext.debugName = debugName
  promiseProxy.timeContext = newContext
  if (parentContext) {
    // newContext.rootContext = parentContext.rootContext
    // newContext.bpm = parentContext.bpm
    // parentContext.childContexts.add(newContext)
    parentContext.connectChildContext(newContext)
  } else {
    newContext.rootContext = newContext
    newContext.mostRecentDescendentTime = rootTime
  }
  const blockPromise = block(newContext)
  promiseProxy.promise = blockPromise
  const bp = blockPromise
    .catch((e) => { //todo core - need to cancel child contexts properly
      const err = e as Error
      console.log('promise catch error', err, err?.message, err?.stack)
    })
  if (parentContext) {
    bp.finally(() => { //todo core - need to cancel child contexts properly
      //todo bug - should be able to always update parent right? why does this only work when both flagged and awaited
      if (updateParent) parentContext.time = Math.max(newContext.time, parentContext.time) 
      parentContext.childContexts.delete(newContext)
    })
  }
  return promiseProxy
}

// const USE_TONE = false
export function launch<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromiseProxy<T> {
  // if(USE_TONE) return createAndLaunchContext(block, Tone.Transport.immediate(), ToneTimeContext, false)
  // else return createAndLaunchContext(block, dateNow(), DateTimeContext, false)
  return createAndLaunchContext(block, dateNow(), DateTimeContext, false)
}

export type LoopHandle = {
  cancel: () => void
  finally: (finalFunc: () => void) => void
}

//todo draft - need to test generalized TimeContext implementation in loops
export abstract class TimeContext {
  public rootContext: TimeContext | undefined
  public mostRecentDescendentTime: number = 0
  public get mostRecentDescendentBeats(): number {
    return this.mostRecentDescendentTime * this.bpm / 60
  }
  public debugName = ""
  public abortController: AbortController
  public time: number
  public get beats(): number {
    return this.time * this.bpm / 60
  }
  public startTime: number
  public isCanceled: boolean = false
  public get progTime(): number {
    return this.time - this.startTime
  }
  public get progBeats(): number {
    return this.progTime * this.bpm / 60
  }
  public id: number
  private _bpm: number = 60;
  public get bpm(): number {
    return this._bpm;
  }
  public set bpm(value: number) {
    this._bpm = value;
  }
  public cancelPromise: CancelablePromiseProxy<any>
  public childContexts: Set<TimeContext> = new Set()

  constructor(time: number, ab: AbortController, id: number, cancelPromise: CancelablePromiseProxy<any>) {
    this.time = time
    this.startTime = time
    this.abortController = ab
    this.id = id
    this.abortController.signal.addEventListener('abort', () => {
      this.isCanceled = true
      console.log('sketchLog aborted timecontext', this.debugName)
    })
    this.cancelPromise = cancelPromise
  }

  public connectChildContext(childContext: TimeContext) {
    childContext.rootContext = this.rootContext
    childContext.bpm = this.bpm
    this.childContexts.add(childContext)
  }

  /**
   * todo api - a potenial way to solve the branch/branchWait split - 
   * branch returns a function that returns the promise for the branch. 
   * to wait on the branch, you have to write an extra line like
   * const branchRet = ctx.branch(...)
   * await branchRet()
   * 
   * the call to branchRet() is what gets you the extra layer to only apply the time update if the branch is awaited
   */
  public branch<T>(block: (ctx: TimeContext) => Promise<T>, debugName: string = ""): LoopHandle {
    
    const promise = createAndLaunchContext(block, this.rootContext!.mostRecentDescendentTime, Object.getPrototypeOf(this).constructor, false, this, debugName)
    //todo api - this allows you to manage a branch without accidentally awaiting on it in a way that
    //would screw up parent context time. but in general, awaiting on anything other than
    //ctx.wait[Time] or ctx.branchWait will screw up contextTime <=> wallClock time relationship.
    //there might be no way to have a unified branch function.
    //could make a linter here to warn users?
    return {
      finally: (finalFunc: () => void) => {
        promise.finally(finalFunc)
      },
      cancel: () => {
        promise.cancel()
      }
    }
  }

  public branchWait<T>(block: (ctx: TimeContext) => Promise<T>, debugName: string = ""): CancelablePromiseProxy<T> {
    return createAndLaunchContext(block, this.time, Object.getPrototypeOf(this).constructor, true, this, debugName)
  } 

  //usage: await ctx.segmentWait((prog) => { filterMidi.sendCC(50 + prog) *20) }, 4)
  // public segmentWait<T>(block: (prog: number) => void, segmentBeats: number, frameTime: number = 0, debugName: string = ""): CancelablePromisePoxy<void> {
  //   return this.branchWait(async (ctx) => {
  //     const segmentStartBeats = this.beats
  //     const loopHandle = this.branch(async (ctx) => {
  //       while(beatNow(this.bpm) - segmentStartBeats < segmentBeats) {
  //         block((beatNow(this.bpm) - segmentStartBeats) / segmentBeats)
          
  //         if(frameTime > 0) {
  //           await ctx.waitSec(frameTime)
  //         } else {
  //           await ctx.waitFrame()
  //         }
  //       }
  //     })
  //     await this.wait(segmentBeats)
  //     loopHandle.cancel()
  //     block(1)
  //   })
  // }
  

  public cancel() {
    this.abortController.abort()
    this.childContexts.forEach((ctx) => ctx.cancel())
  }

  public abstract waitSec(sec: number): Promise<void>
  public wait(beats: number) {
    return beats === 0 ? Promise.resolve() : this.waitSec(beats * 60 / this.bpm) //todo api - should this be in waitSec?
  }

  //todo api - need to change launchLoop() calls to return a BrowserTimeContext, untill then, keep this implemented here to not break old sketches
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

// class ToneTimeContext extends TimeContext {
//   public async waitSec(sec: number) {
//     if (this.isCanceled) {
//       throw new Error('context is canceled')
//     }
//     const ctx = this
//     return new Promise<void>((resolve, reject) => {
//       const listener = () => { reject(); console.log('abort') }
//       ctx.abortController.signal.addEventListener('abort', listener)
//       Tone.Transport.scheduleOnce(() => {
//         ctx.time += sec
//         ctx.abortController.signal.removeEventListener('abort', listener)
//         resolve()
//       }, ctx.time + sec)
//     })
//   }
// }

export class DateTimeContext extends TimeContext{
  public async waitSec(sec: number) {
    // console.log('wait', sec, this.id, this.time.toFixed(3))
    if (this.isCanceled) {
      console.log(this.debugName, 'context is canceled')
      return
    }
    //if sec is NaN make it 0 and log warning
    if(isNaN(sec)) {
      console.warn('waitSec called with NaN sec', sec)
      sec = 0
    }
    const ctx = this
    return new Promise<void>((resolve, reject) => {
      const listener = () => { reject(); console.log('abort') }
      ctx.abortController.signal.addEventListener('abort', listener)
      const nowTime = dateNow()

      //todo - in progress
      const targetTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time) + sec
      
      const waitTime = targetTime - nowTime //todo bug - in usage in musicAgentTest sketch, time is not properly set and this becomes negative, causing problems
      if (waitTime < 0) {
        const x = 5
        console.log("sketchLog", "negative wait time", this.debugName, nowTime.toFixed(3), targetTime.toFixed(3), waitTime.toFixed(3))
      }
      const waitStart = dateNow()
      setTimeout(() => {
        try {
          // ctx.time += sec

          ctx.time = targetTime

          ctx.abortController.signal.removeEventListener('abort', listener)
          
          if (!this.isCanceled) {
            resolve()
          } else {
            reject()
            return
          } 
          
          //todo bug - is this defensive time check a bug?
          //defensive check so that time never moves "backwards" due to setTimeout jitter between context children
          this.rootContext!.mostRecentDescendentTime = Math.max(this.rootContext!.mostRecentDescendentTime, targetTime)
          // this.rootContext!.mostRecentDescendentTime = targetTime

          const waitDuration = dateNow() - waitStart
          // console.log('wait duration', (waitDuration / 1000).toFixed(3), 'wait time', waitTime.toFixed(3))
          if(LOG_DELAYS && waitDuration - waitTime > 0.010) console.log('wait duration deviation greater than 10 ms')
        } catch(e) {
          console.log('wait error', e)
        }
      }, waitTime * 1000)
    })
  }
}



/*
export class TempoClock {
  private _bpm: number = 60
  private startTime: number = 0
  private callbackMap: Map<string, () => void> = new Map()
  private callbackBeats: Map<string, number> = new Map()
  private callbackTimeoutIds: Map<string, number> = new Map()

  constructor(bpm: number, startTime: number | undefined = undefined) {
    this._bpm = bpm
    this.startTime = startTime ?? dateNow()
  }

  public get time(): number {
    return dateNow() - this.startTime
  }

  public get beats(): number {
    return this.time * this._bpm / 60
  }

  public get bpm(): number {
    return this._bpm
  }

  public set bpm(bpm: number) {
    this._bpm = bpm
    this.callbackMap.forEach((callback, callbackId) => {
      const beats = this.callbackBeats.get(callbackId)!
      const time = beats * 60 / this._bpm
      const deltaTime = time - this.time
      const timeoutId = this.callbackTimeoutIds.get(callbackId)!
      clearTimeout(timeoutId)
      this.callbackTimeoutIds.delete(callbackId)
      this.callbackTimeoutIds.set(callbackId, setTimeout(() => {
        this.callbackMap.delete(callbackId)
        this.callbackBeats.delete(callbackId)
        this.callbackTimeoutIds.delete(callbackId)
        callback()
      }, deltaTime * 1000))
    })
  }

  scheduleAbsBeats(beats: number, callback: () => void) {
    const time = beats * 60 / this._bpm
    const deltaTime = time - this.time
    const callbackId = crypto.randomUUID()
    this.callbackMap.set(callbackId, callback)
    this.callbackBeats.set(callbackId, beats)
    const timeoutId = setTimeout(() => {
      this.callbackMap.delete(callbackId)
      this.callbackBeats.delete(callbackId)
      this.callbackTimeoutIds.delete(callbackId)
      callback()
    }, deltaTime * 1000)
    this.callbackTimeoutIds.set(callbackId, timeoutId)
  }
}

export class TempoClockTimeContext extends TimeContext {
  public tempoClock: TempoClock
  constructor(time: number, ab: AbortController, id: number, cancelPromise: CancelablePromisePoxy<any>) {
    super(time, ab, id, cancelPromise)
    this.tempoClock = new TempoClock(60, time)
  }

  override connectChildContext(childContext: TempoClockTimeContext): void {
    super.connectChildContext(childContext)
    childContext.tempoClock = new TempoClock(this.tempoClock.bpm, this.tempoClock.time)
  }

  public override async wait(beats: number): Promise<void> {
    if (this.isCanceled) {
      console.log(this.debugName, 'context is canceled')
      return
    }

    const targetBeats = Math.max(this.rootContext!.mostRecentDescendentBeats, this.beats) + beats
    const ctx = this

    return new Promise((resolve, reject) => {
      const listener = () => { reject(); console.log('abort') }
      ctx.abortController.signal.addEventListener('abort', listener)

      this.tempoClock.scheduleAbsBeats(targetBeats, () => {
        try {
          ctx.time = targetBeats * 60 / this.tempoClock.bpm
          ctx.abortController.signal.removeEventListener('abort', listener)
          
          //todo - need to debug this pattern across all context implementations
          //this implementation is probably the one that is correct
          if (!this.isCanceled) resolve()
          else reject()
          if (this.isCanceled) return 

          //todo - is there an edge case where after cancelling a child, 
          //control returns to the parent but the parent's mostRecentDescendentTime is not updated?
          //it would need to be the logical time of the child cancellation.
          //but maybe it's ok, because the CANCALLER is also setting the parent's mostRecentDescendentTime?
          //This is an issue if cancellation happens outside of the context of the parent,
          //(e.g in response to user-input, or via a call to cancel() from outside the contex/tree of the parent).
          //can this be fixed by always using the TempoClockTimeContext in some way instead of DateTimeContext?
          
          this.rootContext!.mostRecentDescendentTime = ctx.time
        } catch(e) {
          reject(e)
        }
      })
    })
  }

  public override set bpm(bpm: number) {
    this.tempoClock.bpm = bpm
  }

  override waitSec(sec: number): Promise<void> {
    return this.wait(sec * this.tempoClock.bpm / 60)
  }
}

*/




  // * todo barrier - a naoive implementation with only promises and no
  // * modication of context time will break the timing engine.
  // * To fix this, when the barrier is resolved, we need to broadcast the
  // * current time to all of the channels that are waiting on the barrier.
  // * they then adopt the broadcasted time as their current time.
  // * This might require a refactor of the core time context logic to work.
  // * Additionally, will need to do another scripting-api/engine-api split.
  // * the in-browser api will just be barrierFunc("name") but the engine
  // * function call will need to be barrierFunc("name", ctx) so that
  // * the appropriate time context info can be used
  
/**
 export const promiseBarrierMap = new Map<string, { promise: Promise<void>, resolve: () => void, resolveTime: number, startTime: number }>()
 
 export const startBarrier = (key: string, ctx: TimeContext) => {
   let res: () => void = null
   const newPromise = new Promise<void>((resolve, reject) => {
     res = resolve
   })
   
   //fix for missing case
   const oldBarrier = promiseBarrierMap.get(key)
   if (oldBarrier) {
     oldBarrier.resolve()
     oldBarrier.resolveTime = ctx.time
   } 
 
   promiseBarrierMap.set(key, { promise: newPromise, resolve: res, resolveTime: -1, startTime: ctx.time })
 }
 
 export const resolveBarrier = (key: string, ctx: TimeContext) => {
   const barrier = promiseBarrierMap.get(key)
   if (!barrier) {
     console.warn(`No barrier found for key: ${key}`)
     return
   }
   barrier.resolveTime = ctx.time
   barrier.resolve()
   promiseBarrierMap.delete(key)
 }
 
 export const awaitBarrier = async (key: string, ctx: TimeContext) => {
   const barrier = promiseBarrierMap.get(key)
   if (!barrier) {
     console.warn(`No barrier found for key: ${key}`)
     return Promise.resolve()
   }
 
   //if await happens at the same time as barrier start, you're already synced
   if (ctx.time == barrier.startTime) return
     
   await barrier.promise
   ctx.time = barrier.resolveTime
 }
 
*/
 
 //todo API - can move these to be instance methods for the root of the context tree?
 //these things only actually work within the same context tree
 
 

  //  event orders per key - loop A is start/resolving barriers, loop B is awaiting to sync, imagine 1 beat loops
 
  //  startA - t-0
  //  resolA - t-1
  //  awaitB - t-1
  //  startA - t-1
 
  //  because of unpredictability of setTimeout, events at t-1 could happen in any order wrt wall clock
 
  //  All 6 possibilities:
 
  //  resolA - t-1
  //  awaitB - t-1
  //  startA - t-1
  //  - awaitB immediately releases becaues no active key and never waits on barrier 
 
  //  resolA - t-1
  //  startA - t-1
  //  awaitB - t-1
  //  - awaitB immediately releases because startTime == waitTime and never waits on barrier 
 
  //  startA - t-1
  //  resolA - t-1
  //  awaitB - t-1
  //  - awaitB immediately releases becaues no active key and never waits on barrier 
 
  //  startA - t-1
  //  awaitB - t-1
  //  resolA - t-1
  //  - awaitB immediately releases because startTime == waitTime and never waits on barrier 
 
  //  awaitB - t-1
  //  startA - t-1
  //  resolA - t-1
  //  - awaitB waits because it has captured and is waiting on barrier set at t-0, which never gets resolved when barrier map entry is overwritten with new start
  //  - FIX: if "double start" (eg, key as existing unresolved barrier when start is called), release it before creating new one
 
  //  awaitB - t-1
  //  resolA - t-1
  //  startA - t-1
  //  - awaitB releases because it's barrier is resolved
