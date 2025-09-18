import type { CanvasRuntimeState } from './canvasState'

export function singleKeydownEvent(
  state: CanvasRuntimeState,
  key: string,
  listener: (ev: KeyboardEvent) => void,
  target: HTMLElement = document.body
): () => void {
  const cb = (ev: KeyboardEvent) => {
    if (ev.key === key) {
      listener(ev)
    }
  }

  target.addEventListener('keydown', cb)

  const disposer = () => {
    target.removeEventListener('keydown', cb)
    const index = state.keyboardDisposables.indexOf(disposer)
    if (index !== -1) {
      state.keyboardDisposables.splice(index, 1)
    }
  }

  state.keyboardDisposables.push(disposer)

  return disposer
}
