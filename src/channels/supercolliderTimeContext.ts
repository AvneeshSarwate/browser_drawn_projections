import { CancelablePromiseProxy, createAndLaunchContext, TimeContext, type LoopHandle } from "./base_time_context"


const scWebsocket = new WebSocket('ws://localhost:57130')
const scWaitCallbacks = new Map<string, () => void>()


scWebsocket.onmessage = (event) => {
  const data = JSON.parse(event.data)
  const callback = scWaitCallbacks.get(data.id)
  if(callback) callback()
  scWaitCallbacks.delete(data.id)
}


const scBeatWait = (beats: number, contextRootId: number) => new Promise<void>((resolve, reject) => {
  const id = crypto.randomUUID();
  scWaitCallbacks.set(id, resolve)
  scWebsocket.send(JSON.stringify({type: 'wait', delayId: id, time: beats, rootId: contextRootId}))
})

const scBeatSyncWait = (contextRootId: number) => new Promise<void>((resolve, reject) => {
  const id = crypto.randomUUID();
  scWaitCallbacks.set(id, resolve)
  scWebsocket.send(JSON.stringify({type: 'wait', delayId: id, time: "beat", rootId: contextRootId}))
})


//for SCTimeContext, there is no notion of seconds, only beats (because sc clock uses scheduleAbs to a callback for a target time)

/* sc side stuff
node server will fwd osc messages to - https://github.com/AvneeshSarwate/kotlin-live-lib-3/blob/fbd96799eabe897caeea502317245d41ca5d91fb/timing_test.scd#L42
Instead of using the /coroStart endpoint, it will just log the first delay offset time of a context tree
in the same function
*/


export class SuperColliderTimeContext extends TimeContext{

  //todo api: should there be some enforcment that this only get's called once per root?
  //alternatively, could add an option to intialize a context so that its first wait adds on
  //a beat sync?
  public async initialBeatSync() {
    await scBeatSyncWait(this.rootContext!.id)
  }

  public override async wait(beats: number) {
    await this.waitSec(beats)
  }

  public async waitSec(beats: number) {
    // console.log('wait', sec, this.id, this.time.toFixed(3))
    if (this.isCanceled) {
      console.log(this.debugName, 'context is canceled')
      return
    }
    const ctx = this
    return new Promise<void>(async (resolve, reject) => {
      const listener = () => { reject(); console.log('abort') }
      ctx.abortController.signal.addEventListener('abort', listener)

      //todo - in progress
      const targetTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time) + beats
      
      const postWait = () => {
        try {

          ctx.time = targetTime

          ctx.abortController.signal.removeEventListener('abort', listener)
          
          resolve()
          if (this.isCanceled) resolve()
          else reject()
          if (this.isCanceled) return 
          
          this.rootContext!.mostRecentDescendentTime = targetTime
        } catch(e) {
          console.log('wait error', e)
        }
      }
      await scBeatWait(targetTime, this.rootContext!.id)
      postWait()
    })
  }

  public branch<T>(block: (ctx: TimeContext) => Promise<T>, debugName: string = ""): LoopHandle {
    const promise = createAndLaunchContext(block, this.rootContext!.mostRecentDescendentTime, Object.getPrototypeOf(this).constructor, false, this, debugName)
    return {
      finally: (finalFunc: () => void) => {
        promise.finally(finalFunc)
      },
      cancel: () => {
        promise.cancel()
      }
    }
  }
}

export function launchSC<T>(block: (ctx: SuperColliderTimeContext) => Promise<T>): CancelablePromiseProxy<T> {
  return createAndLaunchContext(block, 0, SuperColliderTimeContext, false)
}