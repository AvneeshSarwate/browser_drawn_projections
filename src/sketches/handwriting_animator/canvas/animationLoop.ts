export interface CancelToken {
  canceled: boolean
}

export interface AnimationLoopHandle {
  cancel: () => void
  token: CancelToken
}

export type AnimationFrameCallback = (timestamp: number, token: CancelToken) => boolean | void

const createCancelToken = (): CancelToken => ({
  canceled: false
})

const stopLoop = (handle: { frameId: number | null; token: CancelToken }) => {
  if (handle.token.canceled) return
  handle.token.canceled = true
  if (handle.frameId !== null) {
    cancelAnimationFrame(handle.frameId)
    handle.frameId = null
  }
}

export const startAnimationLoop = (callback: AnimationFrameCallback): AnimationLoopHandle => {
  const state = {
    frameId: null as number | null,
    token: createCancelToken()
  }

  const step = (timestamp: number) => {
    if (state.token.canceled) return

    state.frameId = null
    const shouldContinue = callback(timestamp, state.token)
    if (state.token.canceled || shouldContinue === false) {
      stopLoop(state)
      return
    }

    state.frameId = requestAnimationFrame(step)
  }

  state.frameId = requestAnimationFrame(step)

  return {
    token: state.token,
    cancel: () => stopLoop(state)
  }
}
