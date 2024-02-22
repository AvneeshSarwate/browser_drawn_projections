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



export function runTests() {
  // setTimeout(test0, 1000)
  // setTimeout(test1, 1000)
  setTimeout(test2, 1000)
}

