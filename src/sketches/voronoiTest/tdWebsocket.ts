import { cosN, sinN } from "@/channels/channels"

const ws = new WebSocket('ws://localhost:9980')

ws.onopen = () => {
  console.log('Connected to server')
}

ws.onclose = () => {
  console.log('Disconnected from server')
}


type voronoiData = {
  x: number[];
  y: number[];
  r: number[];
  g: number[];
  b: number[];
  lineThickness: number;
  frameId: number;
}

const perPointData: Map<string, number[]> = new Map()
const paramData: Map<string, number> = new Map()
const getPtData = (pt: string) => perPointData.get(pt) || []
const getParamData = (pt: string) => paramData.get(pt) || 0

class VoronoiData {
  get x() {return getPtData('x')}
  get y() {return getPtData('y')}
  get r() {return getPtData('r')}
  get g() {return getPtData('g')}
  get b() {return getPtData('b')}
  get lineThickness() {return getParamData('lineThickness')}
}

export const tdVoronoiData = new VoronoiData()

const bufferSize = 10
const lookbackSize = 5
const dataBuffer: voronoiData[] = []

const updateData = () => {
  let bufferIndex = 0
  while (bufferIndex < dataBuffer.length && dataBuffer[bufferIndex].frameId != frameId - lookbackSize) {
    bufferIndex++
  }
  if( dataBuffer.length > 0 && dataBuffer[bufferIndex] && dataBuffer[bufferIndex].frameId != frameId - lookbackSize) {
    console.log('Frame mismatch')
  }

  if (dataBuffer.length > 0 && dataBuffer[bufferIndex]) {
    const data = dataBuffer[bufferIndex]
    setDataLive(data)
  } else {
    console.log('No data')
  }
  requestAnimationFrame(updateData)
}

const setDataLive = (data: voronoiData) => {
  perPointData.set('x', data.x)
  perPointData.set('y', data.y)
  perPointData.set('r', data.r)
  perPointData.set('g', data.g)
  perPointData.set('b', data.b)
  paramData.set('lineThickness', data.lineThickness)
}

// updateData()

const numCircles = 40
const colorData = {
  r: Array.from({ length: numCircles }, () => Math.random()),
  g: Array.from({ length: numCircles }, () => Math.random()),
  b: Array.from({ length: numCircles }, () => Math.random()),
}
const phase = (i: number) => i * 2 * Math.PI / numCircles 

const buildMockData = () => {
  const time = -performance.now() / 1000 * 0.1
  const data = {
    x: Array.from({ length: numCircles }, (_, i) => sinN(time + phase(i))),
    y: Array.from({ length: numCircles }, (_, i) => cosN(time + phase(i))),
    r: colorData.r,
    g: colorData.g,
    b: colorData.b,
    lineThickness: 1,
  }
  const dataString = JSON.stringify(data)
  return {data: dataString}
}


let frameId = 0
const parseTimes: number[] = []



const handleMessage = (message: {data: string}) => {
  const parseStart = performance.now()
  const data = JSON.parse(message.data) as voronoiData;
  const parseTime = performance.now() - parseStart
  parseTimes.push(parseTime)

  data.frameId = frameId
  frameId++

  if (parseTimes.length > 30) {
    parseTimes.shift()
  }
  if(frameId % 20 == 0) {
    console.log('Average parse time: ', parseTimes.reduce((a, b) => a + b, 0) / parseTimes.length)
  }

  // dataBuffer.push(data)
  // if (dataBuffer.length > bufferSize) {
  //   dataBuffer.shift()
  // }

  setDataLive(data)
}


const mockDataLoop = () => {
  const data = buildMockData()
  handleMessage(data)
  requestAnimationFrame(mockDataLoop)
}

mockDataLoop()



ws.onmessage = (message) => {
  // setTimeout(() => {
  //   handleMessage(message)
  // }, 1)

  // handleMessage(message)

  const data = buildMockData()
  handleMessage(data)
}