import { launch } from "./channels"

const test0 = async () => {
  launch(async ctx => {
    for (let i = 0; i < 10; i++) {

      ctx.branch(async ctx => {
        await ctx.wait(1)
      })

      await ctx.branchWait(async ctx => {
        await ctx.wait(1)
      })

      ctx.branch(async ctx => {
        await ctx.wait(1)
      })

      console.log("progBeats-0", i, ctx.progBeats)
    }
    console.log("progBeats-0", "end", ctx.progBeats)
  })
}

const test1 = async () => {
  launch(async ctx => {
    for (let i = 0; i < 10; i++) {

      ctx.branchWait(async ctx => {
        await ctx.wait(1)
      })

      await ctx.branchWait(async ctx => {
        await ctx.wait(1)
        await ctx.branchWait(async ctx => {
          await ctx.wait(1)
        })
        console.log("progBeats-1 sub", i, ctx.progBeats)
      })

      ctx.branchWait(async ctx => {
        await ctx.wait(1)
      })

      console.log("progBeats-1", i, ctx.progBeats)
    }
    console.log("progBeats-1", "end", ctx.progBeats)
  })
}

const test2 = async () => {
  launch(async ctx => {
    for (let i = 0; i < 10; i++) {

      ctx.branchWait(async ctx => {
        await ctx.wait(.1)
      })

      await ctx.wait(1)

      console.log("progBeats-2", i, ctx.progBeats)
    }
    console.log("progBeats-2", "end", ctx.progBeats)
  })
}

const cancelTest = async () => {
  launch(async ctx => {
    const handle = ctx.branch(async ctx => {
      
      const innerHandle = ctx.branch(async ctx => {
        let innerCounter = 0
        while (!ctx.isCanceled) {
          await ctx.wait(1)
          console.log("canceltest 0", innerCounter)
          innerCounter++
        }
      })

      let counter = 0
      while (!ctx.isCanceled) {
        await ctx.wait(1)
        console.log("canceltest 1", counter)
        counter++
        if(counter === 5) {
          innerHandle.cancel()
        }
      }
    })

    await ctx.wait(10)

    console.log("canceltest", "cancelling")

    handle.cancel()
  })
}

const postCancelTest = async () => {
  launch(async ctx => {
    const handle = ctx.branch(async ctx => {
      console.log("postCancelTest a")
      await ctx.wait(3)
      console.log("postCancelTest b")
    }, "postCancelTest")

    await ctx.wait(2)

    handle.cancel()
  })
}

export function runTests() {
  // setTimeout(test0, 1000)
  // setTimeout(test1, 1000)
  setTimeout(postCancelTest, 1000)
}

