
import { CancelablePromisePoxy, DateTimeContext, TimeContext, createAndLaunchContext } from './base_time_context'





const requestIdToPromise = new Map<string, Promise<void>>()


const scWaitCallback = (callback: () => void, schedTime: number, rootContextId: number) => {
   
}

//supercollider has a map of <rootContextId, rootContextStartTime>, and will schedule 
//a callback to run at the rootContextStartTime + schedTime

export class SCTimeContext extends TimeContext {
    contextId = Math.random()
    scClockTime?: number

    public getRootId(): number {
        return (this.rootContext! as SCTimeContext).contextId
    }

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
          //todo - in progress
          const targetTime = Math.max(this.rootContext!.mostRecentDescendentTime, this.time) + sec
          
          scWaitCallback(() => {
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
    
            } catch(e) {
              console.log('wait error', e)
            }
          }, targetTime, this.getRootId())
        })
      }  
}