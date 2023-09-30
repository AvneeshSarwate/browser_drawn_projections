import * as Tone from 'tone'

class CancelablePromisePoxy<T> implements Promise<T> {
  public promise?: Promise<T>
  public abortController: AbortController

  constructor(ab: AbortController) {
    this.abortController = ab
  }

  public cancel() {
    this.abortController.abort()
  }

  [Symbol.toStringTag]: string = 'CancelablePromisePoxy'

  //fwd then method to the underlying promise
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.promise!!.then(onfulfilled, onrejected)
  }

  //fwd catch method to the underlying promise
  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.promise!!.catch(onrejected)
  }

  //fwd finally method to the underlying promise
  finally(onfinally?: (() => void) | undefined | null): Promise<T> {
    return this.promise!!.finally(onfinally)
  }
}

function createAndLaunchContext<T>(block: (ctx: TimeContext) => Promise<T>,rootTime: number): CancelablePromisePoxy<T> {
  //define an async function that waits using setTimeout
  const abortController = new AbortController()
  const promiseProxy = new CancelablePromisePoxy<T>(abortController)
  const newContext = new TimeContext(rootTime, abortController)
  const blockPromise = block(newContext)
  promiseProxy.promise = blockPromise
  blockPromise.catch((e) => {
    console.log('promise catch error', e)
  })
  return promiseProxy
}

function launch<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T> {
  return createAndLaunchContext(block, Tone.now())
}

class TimeContext {
  public abortController: AbortController
  public time: number
  public isCanceled: boolean = false

  constructor(time: number, ab: AbortController) {
    this.time = time
    this.abortController = ab
    this.abortController.signal.addEventListener('abort', () => {
      this.isCanceled = true
      console.log('abort')
    })
  }

  public async wait(sec: number) {
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

  public branch<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T> {
    return createAndLaunchContext(block, this.time)
  }
}

document.querySelector('body')?.addEventListener('click', async () => {
  await Tone.start()
  Tone.Transport.start()
  console.log('audio is ready', Tone.Transport.bpm.value, Tone.context.lookAhead)
  setTimeout(testCancel, 50)
})

export const testCancel = async () => {

  launch(async (ctx) => {
    const stepVal = 0.2

    const start = ctx.time
    const start2 = performance.now() + Tone.context.lookAhead * 1000
    let drift, lastDrift = 0
    const res0 = ctx.branch(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        const [logicalTime, wallTime] = [ctx.time - start, (performance.now() - start2) / 1000]
        drift = wallTime - logicalTime 
        const driftDelta = drift - lastDrift
        console.log('step', i, "logicalTime", logicalTime, "drift", drift.toFixed(3), "driftDelta", driftDelta.toFixed(3))
        lastDrift = drift
        await ctx.wait(stepVal)
      }
    })

    ctx.branch(async (ctx) => {
      await ctx.wait(stepVal * 10)
      console.log('res0 cancel', performance.now() - start2)
      res0.cancel()
    })
  })
}
