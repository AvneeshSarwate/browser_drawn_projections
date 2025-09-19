const polygons = []
const strokes = []

const element = document.getElementById('handwritingCanvas')
const canvasWidth = Number(element.getAttribute('width')) || 800
const canvasHeight = Number(element.getAttribute('height')) || 450

element.syncState = (state) => {
  polygons.splice(0, polygons.length, ...state.polygon.bakedRenderData)
  strokes.splice(0, strokes.length)

  state.freehand.bakedRenderData.forEach((group) => {
    if (group.type !== 'strokeGroup') return
    group.children.forEach((child) => {
      if (child.type === 'stroke') {
        strokes.push(child)
      }
    })
  })
}

function setup() {
  const container = document.getElementById('p5-container')
  createCanvas(canvasWidth, canvasHeight).parent(container)
  frameRate(60)
  noFill()
}

function draw() {
  clear()
  background(250)
  const elapsedTime = millis() / 1000

  noStroke()
  polygons.forEach((polygon, index) => {
    const { dx, dy } = offsetForIndex(index, elapsedTime)
    const color = polygon?.metadata?.color || colourForIndex(index)
    fill(color.r ?? 255, color.g ?? 255, color.b ?? 255, color.a ?? 255)
    beginShape()
    for (const point of polygon.points ?? []) {
      vertex(point.x + dx, point.y + dy)
    }
    endShape(CLOSE)
  })

  stroke(30)
  strokeWeight(2)
  noFill()
  strokes.forEach((stroke, index) => {
    const { dx, dy } = offsetForIndex(index, elapsedTime, { skew: 1.3, radiusOffset: 8 })
    beginShape()
    for (const point of stroke.points ?? []) {
      vertex(point.x + dx, point.y + dy)
    }
    endShape()
  })
}

function offsetForIndex(index, time, options = {}) {
  const seed = (index+1) * 97 + (options.seedOffset ?? 0)
  const radius = (options.radiusOffset ?? 6) + (seed % 5) * 3
  const speed = 0.5 + (seed % 7) * 0.3
  const phase = ((seed % 360) * TWO_PI) / 360
  const angle = phase + speed * time
  const skew = options.skew ?? 1
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle * skew) * radius,
  }
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const val = Math.round(l * 255)
    return [val, val, val]
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

function colourForIndex(index) {
  const hue = (index * 47) % 360
  const saturation = 65
  const lightness = 55
  const [r, g, b] = hslToRgb(hue / 360, saturation / 100, lightness / 100)
  return { r, g, b, a: 220 }
}
