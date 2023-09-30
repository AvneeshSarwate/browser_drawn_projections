import * as Tone from 'tone'

//define an async function that waits using setTimeout
async function wait(ms: number) {
  return new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

function branch<T>(block: () => Promise<T>): Promise<T> {
  return block()
}

document.querySelector('body')?.addEventListener('click', async () => {
  await Tone.start()
  Tone.Transport.start()
  console.log('audio is ready', Tone.Transport.bpm.value)
  setTimeout(testCancel, 50)
})

//simplfy writing this with a snippet? https://code.visualstudio.com/docs/editor/userdefinedsnippets
// const res = branch(async () => {
//   console.log('start')
//   wait(10)
//   console.log('end')
// })

// res.then(() => {
//   console.log('done')
// })

//to be able to pause/cancel loops, will probable need to do something like

// class CancelablePromise<T> extends Promise<T> {
//   public cancelMethod: (() => void)
//   constructor(...args: [...ConstructorParameters<typeof Promise<T>>, () => void]) {
//     const [executor, cancelMethod] = args
//     super(executor);

//     this.cancelMethod = cancelMethod;
//   }

//   //cancel the operation
//   public cancel() {
//     if (this.cancelMethod) {
//       this.cancelMethod()
//     }
//   }
// }

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

//create a wait function based on tonejs transport

/* todo - have a launch() function that is like branch2,
   and then on the timeContext, have a branch method that creates
   a new timeContext that inherits the time of the parent

  launch(async (ctx) => {
    await ctx.wait(1)
    ctx.branch(async (ctx) => {
      await ctx.wait(1)
    })
  }

*/

function launch<T>(
  block: (ctx: TimeContext) => Promise<T>
): CancelablePromisePoxy<T> {
  return createAndLaunchContext(block, Tone.now())
}

class TimeContext {
  public abortController: AbortController
  public async wait(sec: number) {
    return new Promise<void>((resolve, reject) => {
      this.abortController.signal.addEventListener('abort', () => { reject()})
      // console.log('waitTransport start', Tone.now(), sec)
      Tone.Transport.scheduleOnce(() => {
        // console.log('waitTransport done')
        resolve()
      }, '+' + sec) //todo: check if the time units here are correct
    })
  }
  public time: number
  constructor(time: number, ab: AbortController) {
    this.time = time
    this.abortController = ab
  }

  public branch2<T>(block: (ctx: TimeContext) => Promise<T>): CancelablePromisePoxy<T> {
    //define an async function that waits using setTimeout
    return createAndLaunchContext(block, this.time)
  }
}

function createAndLaunchContext<T>(
  block: (ctx: TimeContext) => Promise<T>,
  rootTime: number
) {
  //define an async function that waits using setTimeout
  const abortController = new AbortController()
  const promiseProxy = new CancelablePromisePoxy<T>(abortController)
  const newContext = new TimeContext(rootTime, abortController)

  try {
    const blockPromise = block(newContext)
    promiseProxy.promise = blockPromise
    promiseProxy.cancel = () => {
      abortController.abort()
    }
    return promiseProxy
  } catch (e) {
    console.log('error', e)
    const promiseProxy = new CancelablePromisePoxy<T>(abortController)
    promiseProxy.promise = Promise.reject(e)
    return promiseProxy
  }
}

export const testCancel = async () => {

  launch(async (ctx) => {
    const stepVal = 1

    const start = Tone.now()
    const res0 = ctx.branch2(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        console.log('start', i, Tone.now() - start)
        await ctx.wait(stepVal)
      }
    })

    ctx.branch2(async (ctx) => {
      await ctx.wait(stepVal * 10)
      console.log('res0 cancel', Tone.now())
      res0.cancel()
    })
  })
}
