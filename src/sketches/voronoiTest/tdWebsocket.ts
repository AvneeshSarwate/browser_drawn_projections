/* eslint-disable @typescript-eslint/no-unused-vars */
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
  get lineThickness() { return getParamData('lineThickness') }
  get frameId() { return getParamData('frameId') }
}

export const tdVoronoiData = new VoronoiData()





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





const bufferSize = 10
const lookbackSize = 5
const dataBuffer: voronoiData[] = []
export let frameUpdates = 0
const updateDataOnFrame = () => {
  frameUpdates++
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
  requestAnimationFrame(updateDataOnFrame)
}

const setDataLive = (data: voronoiData) => {
  perPointData.set('x', data.x)
  perPointData.set('y', data.y)
  perPointData.set('r', data.r)
  perPointData.set('g', data.g)
  perPointData.set('b', data.b)
  paramData.set('lineThickness', data.lineThickness)
  paramData.set('frameId', data.frameId)
}


const USE_BUFFERED_DATA_READ = true
const USE_MOCK_DATA = false //colors more red/purple ish with TD data
const USE_MOCK_DATA_LOOP = false

if(USE_BUFFERED_DATA_READ) {
  updateDataOnFrame()
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
  // if(frameId % 20 == 0) {
  //   console.log('Average parse time: ', parseTimes.reduce((a, b) => a + b, 0) / parseTimes.length)
  // }

  if(USE_BUFFERED_DATA_READ) {
    dataBuffer.push(data)
    if (dataBuffer.length > bufferSize) {
      dataBuffer.shift()
    }
  } else {
    setDataLive(data)
  }
}


const mockDataLoop = () => {
  const data = buildMockData()
  handleMessage(data)
  requestAnimationFrame(mockDataLoop)
}

if(USE_MOCK_DATA_LOOP) {
  mockDataLoop()
}


// eslint-disable-next-line prefer-const
let requestId = 0
const requestTimingBuffer = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
let requestStartTime = 0
const requestTdData = () => {
  requestStartTime = performance.now()
  ws.send(JSON.stringify({type: 'requestData'}))
  requestAnimationFrame(requestTdData)
}
// setTimeout(requestTdData, 1000)



ws.onmessage = (message) => {
  // setTimeout(() => {
  //   handleMessage(message)
  // }, 1)

  // const requestTime = performance.now() - requestStartTime
  // requestTimingBuffer[requestId % requestTimingBuffer.length] = requestTime
  // requestId++
  // if(requestId % requestTimingBuffer.length == 0) {
  //   console.log('Average request time: ', requestTimingBuffer.reduce((a, b) => a + b, 0) / requestTimingBuffer.length)
  // }

  if(!USE_MOCK_DATA_LOOP) {
    if(USE_MOCK_DATA) {
      const data = buildMockData()
      handleMessage(data)
    } else {
      handleMessage(message)
    }
  }
}

/**
 partial solutions to websocket stutter
 - fix indexing into buffer - it shouldn't always be 5 frames behind recieved frame count,
   but should advance forward every frame - may need a separate "read frame" index to 
   avoid stutter
 - set touchdesigner to send data at 60.1 fps
   - hypothesis - you will sometimes get late frames, but never early frames
     thus, if your data sending is at the same speed as data reading, you will 
     eventually fall behind beyond your buffer size, and it is worse to fall behind in sending than to be ahead in sending
   - if the sending index gets too far "ahead" of the reading index, you can always fastforward
     the reading index, which will still get you new data, which is still motion, vs falling behind in sending gives you 
     a frames with no motion, which is more noticeable
 */