
// deno-lint-ignore-file no-explicit-any no-unused-vars no-this-alias require-await

//todo cleanup - copy paste between this and channels.ts
function dateDelay(callback: () => void, nowTime: number, delayTime: number): void {
    setTimeout(() => {
      callback()
    }, delayTime * 1000)
  }
const startTime = performance.now() / 1000
const dateNow = () => performance.now() / 1000 - startTime
const beatNow = (bpm: number) => dateNow() * bpm / 60

export const now = dateNow
const delayFunc = dateDelay

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
    return this.promise!.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.promise!.catch(onrejected)
  }

  //todo bug - does this properly work? can use to to clean up note-offs
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.promise!.finally(onfinally)
  }
}

let contextId = 0

//todo api - is there a way to have this be both generic and type safe?
type Constructor<T> = new (time: number, ab: AbortController, id: number, cancelPromise: CancelablePromisePoxy<any>) => T;


export function createAndLaunchContext<T, C extends TimeContext>(block: (ctx: C) => Promise<T>, rootTime: number, ctor: Constructor<C>, updateParent: boolean, parentContext?: C, debugName: string = ""): CancelablePromisePoxy<T> {
  const abortController = new AbortController()
  const promiseProxy = new CancelablePromisePoxy<T>(abortController)
  const newContext = new ctor(rootTime, abortController, contextId++, promiseProxy)
  newContext.debugName = debugName
  promiseProxy.timeContext = newContext
  if (parentContext) {
    newContext.rootContext = parentContext.rootContext
    newContext.bpm = parentContext.bpm
    parentContext.childContexts.add(newContext)
  } else {
    newContext.rootContext = newContext
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

// const USE_TONE = false
export function launch<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T> {
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
  public bpm: number = 60
  public cancelPromise: CancelablePromisePoxy<any>
  public childContexts: Set<TimeContext> = new Set()

  constructor(time: number, ab: AbortController, id: number, cancelPromise: CancelablePromisePoxy<any>) {
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
    const promise = createAndLaunchContext(block, now(), Object.getPrototypeOf(this).constructor, false, this, debugName)
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

  public branchWait<T>(block: (ctx: TimeContext) => Promise<T>, debugName: string = ""): CancelablePromisePoxy<T> {
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

          //todo - in progress
          ctx.time = targetTime

          ctx.abortController.signal.removeEventListener('abort', listener)
          resolve()

          // todo - in progress
          if (this.isCanceled) resolve()
          else reject()
          // console.log("setTimeout", this.debugName, this.isCanceled)
          if (this.isCanceled) return 
          
          this.rootContext!.mostRecentDescendentTime = targetTime

          const waitDuration = dateNow() - waitStart
          // console.log('wait duration', (waitDuration / 1000).toFixed(3), 'wait time', waitTime.toFixed(3))
          if(waitDuration - waitTime > 0.010) console.log('wait duration deviation greater than 10 ms')
        } catch(e) {
          console.log('wait error', e)
        }
      }, waitTime * 1000)
    })
  }
}