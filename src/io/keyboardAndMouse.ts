import type p5 from "p5"

const eventListeners: { type: string, cb: (ev: any) => void, target: HTMLElement }[] = []

export function clearListeners() {
  eventListeners.forEach((ev) => ev.target.removeEventListener(ev.type, ev.cb))
  eventListeners.length = 0
}

export function keydownEvent(listener: (ev: KeyboardEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "keydown", cb: listener, target })
  target.addEventListener("keydown", listener)
}

export function singleKeydownEvent(key: string, listener: (ev: KeyboardEvent) => void, target: HTMLElement = document.body) {
  const cb = (ev: KeyboardEvent) => {
    if (ev.key === key) {
      listener(ev)
    }
  }
  eventListeners.push({ type: "keydown", cb, target })
  target.addEventListener("keydown", cb)
}

export function keyupEvent(listener: (ev: KeyboardEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "keyup", cb: listener, target })
  target.addEventListener("keyup", listener)
}

export function singleKeyupEvent(key: string, listener: (ev: KeyboardEvent) => void, target: HTMLElement = document.body) {
  const cb = (ev: KeyboardEvent) => {
    if (ev.key === key) {
      listener(ev)
    }
  }
  eventListeners.push({ type: "keyup", cb, target })
  target.addEventListener("keyup", cb)
}

export function mousemoveEvent(listener: (ev: MouseEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "mousemove", cb: listener, target })
  target.addEventListener("mousemove", listener)
}

export function mousedownEvent(listener: (ev: MouseEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "mousedown", cb: listener, target })
  target.addEventListener("mousedown", listener)
}

export function mouseupEvent(listener: (ev: MouseEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "mouseup", cb: listener, target })
  target.addEventListener("mouseup", listener)
}

export function touchstartEvent(listener: (ev: TouchEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "touchstart", cb: listener, target })
  target.addEventListener("touchstart", listener)
}

export function touchendEvent(listener: (ev: TouchEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "touchend", cb: listener, target })
  target.addEventListener("touchend", listener)
}

export function touchmoveEvent(listener: (ev: TouchEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "touchmove", cb: listener, target })
  target.addEventListener("touchmove", listener)
}

export function touchcancelEvent(listener: (ev: TouchEvent) => void, target: HTMLElement = document.body) {
  eventListeners.push({ type: "touchcancel", cb: listener, target })
  target.addEventListener("touchcancel", listener)
}

//todo api - need a way to normalize coordinates between input coords and targets

export function targetNormalizedCoords(ev: MouseEvent, target: HTMLElement = document.body) {
  const rect = target.getBoundingClientRect()
  return {
    x: (ev.clientX - rect.left) / rect.width,
    y: (ev.clientY - rect.top) / rect.height
  }
}

export function targetToP5Coords(ev: MouseEvent, p: p5, target: HTMLElement = document.body) {
  const norm = targetNormalizedCoords(ev, target) //todo api - should this just use the target from the event?
  return {
    x: norm.x * p.width,
    y: norm.y * p.height
  }
}
