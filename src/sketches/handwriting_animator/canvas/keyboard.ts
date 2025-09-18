const eventListeners: Array<{ type: 'keydown'; cb: (ev: KeyboardEvent) => void; target: HTMLElement }> = []

export function clearListeners() {
  eventListeners.forEach((ev) => ev.target.removeEventListener(ev.type, ev.cb))
  eventListeners.length = 0
}

export function singleKeydownEvent(key: string, listener: (ev: KeyboardEvent) => void, target: HTMLElement = document.body) {
  const cb = (ev: KeyboardEvent) => {
    if (ev.key === key) {
      listener(ev)
    }
  }

  eventListeners.push({ type: 'keydown', cb, target })
  target.addEventListener('keydown', cb)
}
